import { afterEach, describe, expect, it } from "vitest";
import type { DownloadedAttachment, Meeting, MeetingSummary } from "../src/types.js";
import { createHarness, type Harness } from "./harness.js";
import { CALENDAR_EVENTS, DOCUMENT_IDS, MEETING_IDS } from "./fixtures.js";

const harnesses: Harness[] = [];

async function harness(options?: Parameters<typeof createHarness>[0]): Promise<Harness> {
  const h = await createHarness(options);
  harnesses.push(h);
  return h;
}

afterEach(async () => {
  await Promise.all(harnesses.splice(0).map((h) => h.close()));
});

describe("list_meetings", () => {
  it("lists meetings in chronological order by default", async () => {
    const h = await harness();
    const meetings = await h.callTool<MeetingSummary[]>("list_meetings");

    expect(meetings.map((m) => m.id)).toEqual([
      MEETING_IDS.council,
      MEETING_IDS.webinar,
      MEETING_IDS.allDay,
    ]);
    expect(meetings.map((m) => m.kind)).toEqual(["council", "other", "other"]);
    expect(meetings[1]?.title).toBe("Webinar Omgevingswet");
  });

  it("marks all-day events as such", async () => {
    const h = await harness();
    const meetings = await h.callTool<MeetingSummary[]>("list_meetings");
    const allDay = meetings.find((m) => m.id === MEETING_IDS.allDay);
    expect(allDay?.allDay).toBe(true);
    expect(allDay?.start).toBe("2026-09-10T00:00:00+02:00");
  });

  it("defaults to a 30-day window starting now", async () => {
    const h = await harness();
    await h.callTool("list_meetings");
    const call = h.transport.requestsTo("GetCalendarEvents")[0];
    expect(call).toBeDefined();
    const url = new URL(call!.url);
    const start = new Date(url.searchParams.get("start")!);
    const end = new Date(url.searchParams.get("end")!);
    const days = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
    expect(days).toBeCloseTo(30, 5);
  });

  it("passes an explicit range through to the calendar endpoint", async () => {
    const h = await harness();
    await h.callTool("list_meetings", { from: "2026-09-01", to: "2026-09-30" });
    const call = h.transport.requestsTo("GetCalendarEvents")[0];
    const url = new URL(call!.url);
    expect(new Date(url.searchParams.get("start")!).toISOString()).toBe(
      new Date("2026-09-01").toISOString(),
    );
    expect(new Date(url.searchParams.get("end")!).toISOString()).toBe(
      new Date("2026-09-30").toISOString(),
    );
  });

  it("filters to council/committee meetings", async () => {
    const h = await harness();
    const meetings = await h.callTool<MeetingSummary[]>("list_meetings", { type: "council" });
    expect(meetings).toHaveLength(1);
    expect(meetings[0]?.id).toBe(MEETING_IDS.council);
  });

  it("reuses cached results for repeated calls", async () => {
    const h = await harness();
    await h.callTool("list_meetings");
    await h.callTool("list_meetings");
    expect(h.transport.requestsTo("GetCalendarEvents")).toHaveLength(1);
  });

  it("rejects an inverted range with a clear error", async () => {
    const h = await harness();
    const result = await h.rawCallTool("list_meetings", { from: "2026-10-01", to: "2026-09-01" });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/from.*earlier than.*to/i);
  });
});

describe("get_meeting", () => {
  it("returns a council meeting with agenda items, attachments and confidentiality", async () => {
    const h = await harness();
    await h.callTool("list_meetings");
    const meeting = await h.callTool<Meeting>("get_meeting", { id: MEETING_IDS.council });

    expect(meeting.title).toContain("Raadsvergadering");
    expect(meeting.kind).toBe("council");
    expect(meeting.start).toBe(CALENDAR_EVENTS[1]!.start);
    expect(meeting.description).toContain("gemeenteraad");
    expect(meeting.agendaItems.map((a) => a.number)).toEqual(["1", "4", "5"]);

    const item4 = meeting.agendaItems[1]!;
    expect(item4.title).toContain("Bestuursakkoord");
    expect(item4.attachments.map((b) => b.documentId)).toEqual([DOCUMENT_IDS.pdf, DOCUMENT_IDS.docx]);
    expect(item4.attachments[0]?.size).toBe("151 KB");

    const item5 = meeting.agendaItems[2]!;
    expect(item5.confidential).toBe(true);
    expect(item5.attachments.map((b) => b.documentId)).toEqual([DOCUMENT_IDS.confidential]);
  });

  it("exposes meeting-level attachments separately from the agenda items", async () => {
    const h = await harness();
    await h.callTool("list_meetings");
    const meeting = await h.callTool<Meeting>("get_meeting", { id: MEETING_IDS.council });

    expect(meeting.attachments.map((b) => b.documentId)).toEqual([DOCUMENT_IDS.meetingLevel]);
    expect(meeting.attachments[0]?.name).toBe("Vastgestelde besluitenlijst");
    expect(meeting.attachments[0]?.size).toBe("161 KB");

    const allDocuments = meeting.agendaItems.flatMap((a) => a.attachments.map((b) => b.documentId));
    expect(allDocuments).not.toContain(DOCUMENT_IDS.meetingLevel);
  });

  it("degrades gracefully for a webinar with no agenda items", async () => {
    const h = await harness();
    await h.callTool("list_meetings");
    const meeting = await h.callTool<Meeting>("get_meeting", { id: MEETING_IDS.webinar });

    expect(meeting.kind).toBe("other");
    expect(meeting.title).toBe("Webinar Omgevingswet");
    expect(meeting.description).toBe("Extern webinar over de Omgevingswet.");
    expect(meeting.agendaItems).toEqual([]);
    expect(meeting.attachments.map((b) => b.documentId)).toEqual([DOCUMENT_IDS.webinarLevel]);
    expect(meeting.attachments[0]?.name).toBe("Presentatie Omgevingswet.pdf");
    expect(meeting.attachments[0]?.size).toBe("2 MB");
  });

  it("falls back to the meeting view when there is no agenda page", async () => {
    const h = await harness();
    const meeting = await h.callTool<Meeting>("get_meeting", { id: MEETING_IDS.webinar });

    expect(meeting.title).toBe("Webinar Omgevingswet");
    expect(h.transport.requestsTo(`/Meeting/View/${MEETING_IDS.webinar}`)).toHaveLength(1);
  });
});

describe("get_attachment", () => {
  it("extracts text from a PDF", async () => {
    const h = await harness();
    const attachment = await h.callTool<DownloadedAttachment>("get_attachment", { documentId: DOCUMENT_IDS.pdf });
    expect(attachment.mime).toContain("pdf");
    expect(attachment.name).toContain("Raadsvoorstel");
    expect(attachment.text).toContain("Hello iBabs");
  });

  it("returns plain text files as text", async () => {
    const h = await harness();
    const attachment = await h.callTool<DownloadedAttachment>("get_attachment", { documentId: DOCUMENT_IDS.text });
    expect(attachment.mime).toContain("text/plain");
    expect(attachment.text).toContain("Notulen van de vergadering.");
  });

  it("returns unsupported types by path and mime without text", async () => {
    const h = await harness();
    const attachment = await h.callTool<DownloadedAttachment>("get_attachment", { documentId: DOCUMENT_IDS.docx });
    expect(attachment.mime).toContain("wordprocessingml");
    expect(attachment.text).toBeUndefined();
    expect(attachment.path).toContain(DOCUMENT_IDS.docx);
  });

  it("downloads a meeting-level attachment", async () => {
    const h = await harness();
    await h.callTool("list_meetings");
    const meeting = await h.callTool<Meeting>("get_meeting", { id: MEETING_IDS.council });
    const documentId = meeting.attachments[0]!.documentId;

    const attachment = await h.callTool<DownloadedAttachment>("get_attachment", { documentId });
    expect(attachment.name).toContain("besluitenlijst");
    expect(attachment.text).toContain("Besluitenlijst van de vergadering.");
  });

  it("can skip text extraction", async () => {
    const h = await harness();
    const attachment = await h.callTool<DownloadedAttachment>("get_attachment", {
      documentId: DOCUMENT_IDS.pdf,
      extractText: false,
    });
    expect(attachment.text).toBeUndefined();
  });

  it("serves a repeated download from the disk cache", async () => {
    const h = await harness();
    await h.callTool("get_attachment", { documentId: DOCUMENT_IDS.text });
    await h.callTool("get_attachment", { documentId: DOCUMENT_IDS.text });
    expect(h.transport.requestsTo(`/Document/Download/${DOCUMENT_IDS.text}`)).toHaveLength(1);
  });
});
