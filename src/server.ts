import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { DocumentService } from "./documents.js";
import type { MeetingService } from "./service.js";

export interface ServerDeps {
  service: MeetingService;
  documents: DocumentService;
}

function jsonResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

export function buildServer(deps: ServerDeps): McpServer {
  const server = new McpServer({
    name: "ibabs-mcp",
    version: "0.1.0",
  });

  server.registerTool(
    "list_meetings",
    {
      title: "List iBabs meetings",
      description:
        "List your iBabs meetings (vergaderingen) in a date range, in chronological order. " +
        "Defaults to the next 30 days. Use type 'council' to only get council/committee meetings.",
      inputSchema: {
        from: z.string().optional().describe("Start of the range as an ISO date/time. Defaults to now."),
        to: z.string().optional().describe("End of the range as an ISO date/time. Defaults to 30 days from now."),
        type: z
          .enum(["council", "other"])
          .optional()
          .describe("Restrict to council/committee meetings ('council') or everything else ('other')."),
      },
    },
    async ({ from, to, type }) => {
      const meetings = await deps.service.listMeetings({
        ...(from !== undefined ? { from } : {}),
        ...(to !== undefined ? { to } : {}),
        ...(type !== undefined ? { type } : {}),
      });
      return jsonResult(meetings);
    },
  );

  server.registerTool(
    "get_meeting",
    {
      title: "Get an iBabs meeting",
      description:
        "Get one meeting by id, including its agendapunten with their number, title, " +
        "confidentiality flag and bijlagen (attachments) with name and size. " +
        "Also includes meeting-level bijlagen that are not tied to an agendapunt.",
      inputSchema: {
        id: z.string().describe("The meeting id returned by list_meetings."),
      },
    },
    async ({ id }) => {
      const meeting = await deps.service.getMeeting(id);
      return jsonResult(meeting);
    },
  );

  server.registerTool(
    "get_attachment",
    {
      title: "Download an iBabs attachment",
      description:
        "Download an attachment by documentId and return its name, mime type and local path. " +
        "PDFs and text files are also returned as extracted text.",
      inputSchema: {
        documentId: z.string().describe("The documentId from a meeting's bijlagen."),
        extractText: z
          .boolean()
          .optional()
          .describe("Whether to extract text from PDFs/plain text. Defaults to true."),
      },
    },
    async ({ documentId, extractText }) => {
      const attachment = await deps.documents.fetch(documentId, extractText ?? true);
      return jsonResult(attachment);
    },
  );

  return server;
}
