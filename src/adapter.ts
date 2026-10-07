import { load, type CheerioAPI } from "cheerio";
import type { Agendapunt, Bijlage, Meeting, MeetingKind, MeetingSummary } from "./types.js";

export class AdapterError extends Error {
  override name = "AdapterError";
}

function normalize(value: string | undefined | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function classifyKind(url: string | undefined | null): MeetingKind {
  return /\/Agenda\/View\//i.test(url ?? "") ? "council" : "other";
}

interface RawCalendarEvent {
  id?: unknown;
  title?: unknown;
  start?: unknown;
  end?: unknown;
  allDay?: unknown;
  url?: unknown;
  description?: unknown;
}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) return value;
  if (typeof value === "number") return String(value);
  return null;
}

export function parseCalendarEvents(json: unknown): MeetingSummary[] {
  if (!Array.isArray(json)) {
    throw new AdapterError(
      "Unexpected calendar response: expected a JSON array from /Meeting/GetCalendarEvents.",
    );
  }

  const meetings: MeetingSummary[] = [];
  for (const entry of json as RawCalendarEvent[]) {
    if (entry === null || typeof entry !== "object") continue;
    const id = asString(entry.id);
    const url = asString(entry.url);
    if (!id && !url) continue;

    const title = normalize(asString(entry.title) ?? "");
    const start = asString(entry.start);
    const end = asString(entry.end);

    meetings.push({
      id: id ?? url ?? "",
      title,
      start,
      end,
      allDay: entry.allDay === true || entry.allDay === "true",
      kind: classifyKind(url),
      url: url ?? "",
    });
  }

  meetings.sort((a, b) => {
    const at = a.start ? Date.parse(a.start) : Number.POSITIVE_INFINITY;
    const bt = b.start ? Date.parse(b.start) : Number.POSITIVE_INFINITY;
    if (at !== bt) return at - bt;
    return a.title.localeCompare(b.title);
  });

  return meetings;
}

export interface LoginForm {
  requestVerificationToken?: string;
  viewState?: string;
}

function inputValue(html: string, name: string): string | undefined {
  const tagRe = new RegExp(`<input[^>]*name=["']${escapeRegExp(name)}["'][^>]*>`, "i");
  const tag = html.match(tagRe)?.[0];
  if (!tag) return undefined;
  const value = tag.match(/value=["']([^"']*)["']/i)?.[1];
  return value;
}

export function parseLoginForm(html: string): LoginForm {
  return {
    requestVerificationToken:
      inputValue(html, "__RequestVerificationToken") ?? inputValue(html, "__requestverificationtoken"),
    viewState: inputValue(html, "viewState") ?? inputValue(html, "__VIEWSTATE"),
  };
}

function documentIdFromHref(href: string): string | null {
  const withoutQuery = href.split(/[?#]/)[0] ?? "";
  if (!/\/Document\//i.test(withoutQuery)) return null;
  const segments = withoutQuery.split("/").filter((s) => s.length > 0);
  const last = segments[segments.length - 1];
  if (!last || last.toLowerCase() === "download") return null;
  return last;
}

const DOCUMENT_ROW_SELECTOR = "li, tr, .document-row, .document, .attachment, .bijlage";

function findSize($: CheerioAPI, element: Parameters<CheerioAPI>[0]): string | null {
  const sizeRe = /(\d+(?:[.,]\d+)?\s*(?:TB|GB|MB|KB|B))/i;
  const row = $(element).closest(DOCUMENT_ROW_SELECTOR);
  const scopes = [
    row.find('[class*="filesize"], [class*="document-size"], .document-size').first(),
    row,
    $(element).parent(),
    $(element).next(),
  ];
  for (const scope of scopes) {
    if (scope.length === 0) continue;
    const match = normalize(scope.text()).match(sizeRe);
    if (match && match[1]) return match[1].replace(/\s+/g, " ").trim();
  }
  return null;
}

interface BijlageDraft {
  name: string;
  nameFromText: boolean;
  size: string | null;
}

function parseBijlagen(
  $: CheerioAPI,
  scope: ReturnType<CheerioAPI>,
  excludeAgendaItems = false,
): Bijlage[] {
  const groups = new Map<string, BijlageDraft>();

  scope.find("a[href]").each((_, el) => {
    if (excludeAgendaItems && $(el).closest("[data-agendaitem-id]").length > 0) return;
    const $el = $(el);
    const row = $el.closest(DOCUMENT_ROW_SELECTOR);
    const documentId =
      normalize($el.attr("data-document-id")) ||
      normalize(row.find("[data-document-id]").first().attr("data-document-id")) ||
      documentIdFromHref($el.attr("href") ?? "");
    if (!documentId) return;

    const text = normalize($el.text());
    const title = normalize($el.attr("title"));
    const draft = groups.get(documentId) ?? {
      name: documentId,
      nameFromText: false,
      size: null,
    };

    // A row can carry several anchors to the same document (an icon anchor with
    // a timestamp `title` and a title anchor with the real name). Prefer the
    // anchor that actually has visible text.
    if (text) {
      draft.name = text;
      draft.nameFromText = true;
    } else if (title && !draft.nameFromText && draft.name === documentId) {
      draft.name = title;
    }
    draft.size = draft.size ?? findSize($, el);
    groups.set(documentId, draft);
  });

  return [...groups].map(([documentId, draft]) => ({
    documentId,
    name: draft.name,
    size: draft.size,
  }));
}

function parseConfidential($: CheerioAPI, scope: ReturnType<CheerioAPI>): boolean {
  const input = scope.find('input[name="IsConfidential"], input[name="isConfidential"]').first();
  if (input.length > 0) {
    const value = normalize(input.attr("value")).toLowerCase();
    if (["true", "1", "yes", "ja"].includes(value)) return true;
  }
  if (scope.find('[data-confidential="true"], .confidential, .is-confidential').length > 0) {
    return true;
  }
  return scope.attr("data-confidential") === "true";
}

function parseAgendapunten($: CheerioAPI, root: ReturnType<CheerioAPI>): Agendapunt[] {
  const items: Agendapunt[] = [];
  const seen = new Set<string>();

  root.find("[data-agendaitem-id]").each((_, el) => {
    const scope = $(el);
    const agendaitemId = normalize(scope.attr("data-agendaitem-id"));
    if (!agendaitemId || seen.has(agendaitemId)) return;
    seen.add(agendaitemId);

    const number =
      normalize(scope.attr("data-agendaitem-number")) ||
      normalize(
        scope
          .find(
            ".agendaitem-number, .agenda-item-number, .agenda-item-col-itemnumber, .agendaitem__number, .number",
          )
          .first()
          .text(),
      ) ||
      normalize(scope.children().filter((_, child) => /^\d{1,3}$/.test(normalize($(child).text()))).first().text());

    const title =
      normalize(scope.attr("data-agendaitem-title")) ||
      normalize(scope.find("h1, h2, h3, h4, h5, .agendaitem-title, .agenda-item-title").first().text());

    items.push({
      number,
      title,
      agendaitemId,
      confidential: parseConfidential($, scope),
      bijlagen: parseBijlagen($, scope),
    });
  });

  return items;
}

export interface ParseMeetingContext {
  id: string;
  kind?: MeetingKind;
  url?: string;
  fallback?: Partial<Pick<MeetingSummary, "title" | "start" | "end" | "kind">>;
}

function parseDescription($: CheerioAPI, root: ReturnType<CheerioAPI>): string | undefined {
  const attr = normalize(root.attr("data-meeting-description"));
  if (attr) return attr;

  let description: string | undefined;
  root.find("dt").each((_, el) => {
    const term = normalize($(el).text()).replace(/:$/, "").toLowerCase();
    if (term === "toelichting") {
      const dd = $(el).next("dd");
      const paragraphs = dd
        .find("p")
        .map((__, p) => normalize($(p).text()))
        .get()
        .filter((p) => p.length > 0);
      description = paragraphs.length > 0 ? paragraphs.join("\n\n") : normalize(dd.text());
    }
  });
  return description && description.length > 0 ? description : undefined;
}

export function parseMeetingPage(html: string, context: ParseMeetingContext): Meeting {
  const $ = load(html);
  const root = $("[data-meeting-id]").first();
  const scope = root.length > 0 ? root : $("body");

  const rootTitle = normalize(scope.attr("data-meeting-title"));
  const headingTitle = normalize(scope.find("h3").not("[data-agendaitem-id] h3").first().text());
  const title =
    rootTitle ||
    headingTitle ||
    context.fallback?.title ||
    normalize(scope.find("h1").first().text());

  const start =
    normalize(scope.attr("data-meeting-start")) || context.fallback?.start || null;
  const end = normalize(scope.attr("data-meeting-end")) || context.fallback?.end || null;

  const agendapunten = parseAgendapunten($, scope);
  const bijlagen = parseBijlagen($, scope, true);

  const hasMeetingDetails = scope.find("dt").filter((_, el) => {
    const term = normalize($(el).text()).replace(/:$/, "").toLowerCase();
    return ["tijd", "toelichting", "subtitel", "locatie", "voorzitter"].includes(term);
  }).length > 0;

  const found = root.length > 0 || agendapunten.length > 0 || hasMeetingDetails;

  if (!found) {
    throw new AdapterError(
      `Could not parse a meeting page for ${context.id}. The portal markup may have changed.`,
    );
  }

  const description = parseDescription($, scope);

  return {
    id: context.id,
    title,
    start,
    end,
    kind: context.kind ?? context.fallback?.kind ?? classifyKind(context.url),
    ...(description ? { description } : {}),
    agendapunten,
    bijlagen,
  };
}
