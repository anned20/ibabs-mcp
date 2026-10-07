import { AdapterError, parseCalendarEvents, parseMeetingPage } from "./adapter.js";
import { TtlCache } from "./cache.js";
import type { PortalClient, PortalError } from "./portal-client.js";
import type { Meeting, MeetingKind, MeetingSummary } from "./types.js";

export class ServiceError extends Error {
  override name = "ServiceError";
}

export interface ListMeetingsOptions {
  from?: string;
  to?: string;
  type?: MeetingKind;
}

const DEFAULT_RANGE_DAYS = 30;

function parseDate(value: string | undefined, fallback: Date): Date {
  if (value === undefined) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ServiceError(`Invalid date "${value}". Use an ISO date like 2026-09-01.`);
  }
  return parsed;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    ((error as { status?: number }).status === 404 || (error as { status?: number }).status === 410)
  );
}

export class MeetingService {
  private readonly listCache: TtlCache<MeetingSummary[]>;
  private readonly meetingCache: TtlCache<Meeting>;
  private readonly index: TtlCache<MeetingSummary>;

  constructor(
    private readonly client: PortalClient,
    ttlMs = 3 * 60 * 1000,
  ) {
    this.listCache = new TtlCache<MeetingSummary[]>(ttlMs);
    this.meetingCache = new TtlCache<Meeting>(ttlMs);
    this.index = new TtlCache<MeetingSummary>(ttlMs);
  }

  async listMeetings(options: ListMeetingsOptions = {}): Promise<MeetingSummary[]> {
    const from = parseDate(options.from, startOfDay(new Date()));
    const to = parseDate(options.to, addDays(from, DEFAULT_RANGE_DAYS));
    if (from.getTime() >= to.getTime()) {
      throw new ServiceError("`from` must be earlier than `to`.");
    }

    const key = `${from.toISOString()}|${to.toISOString()}|${options.type ?? "all"}`;
    const cached = this.listCache.get(key);
    if (cached) return cached;

    const events = await this.client.getCalendarEvents(from, to);
    const summaries = parseCalendarEvents(events);
    for (const summary of summaries) {
      this.index.set(summary.id, summary);
    }

    const filtered = options.type
      ? summaries.filter((m) => m.kind === options.type)
      : summaries;

    this.listCache.set(key, filtered);
    return filtered;
  }

  async getMeeting(id: string): Promise<Meeting> {
    const cached = this.meetingCache.get(id);
    if (cached) return cached;

    const summary = this.index.get(id);
    const fallback = summary
      ? { title: summary.title, start: summary.start, end: summary.end, kind: summary.kind }
      : undefined;

    const primaryPath = summary?.url || `/Agenda/View/${id}`;
    const secondaryPath = `/Meeting/View/${id}`;

    const attempt = async (path: string): Promise<Meeting> => {
      const html = await this.client.getPageHtml(path);
      return parseMeetingPage(html, {
        id,
        url: path,
        ...(summary ? { kind: summary.kind } : {}),
        ...(fallback ? { fallback } : {}),
      });
    };

    let meeting: Meeting;
    try {
      meeting = await attempt(primaryPath);
    } catch (error) {
      if (summary || (!isNotFound(error) && !(error instanceof AdapterError))) {
        throw error;
      }
      meeting = await attempt(secondaryPath);
    }

    this.meetingCache.set(id, meeting);
    return meeting;
  }
}
