import { afterEach, describe, expect, it } from "vitest";
import type { HttpRequest } from "../src/transport.js";
import type { MeetingSummary } from "../src/types.js";
import { createHarness, type Harness } from "./harness.js";
import { CALENDAR_EVENTS, loginPageHtml } from "./fixtures.js";
import { html, json, type Route } from "./scripted-transport.js";

const harnesses: Harness[] = [];

afterEach(async () => {
  await Promise.all(harnesses.splice(0).map((h) => h.close()));
});

function isCredentialPost(req: HttpRequest): boolean {
  return (
    req.method.toUpperCase() === "POST" &&
    req.url.includes("/Login") &&
    typeof req.body === "string" &&
    req.body.includes("Password=")
  );
}

function countLogins(h: Harness): number {
  return h.transport.requests.filter(isCredentialPost).length;
}

async function harness(options?: Parameters<typeof createHarness>[0]): Promise<Harness> {
  const h = await createHarness(options);
  harnesses.push(h);
  return h;
}

describe("session handling", () => {
  it("logs in automatically on the first request", async () => {
    const h = await harness();
    await h.callTool("list_meetings");
    expect(countLogins(h)).toBe(1);

    const calendarCall = h.transport.requestsTo("GetCalendarEvents")[0];
    expect(calendarCall?.headers?.cookie).toContain("__Host-ibabsportal=");
  });

  it("re-authenticates and retries once when a request lands on a login page", async () => {
    const flakyCalendar: Route = {
      name: "flaky-calendar",
      method: "GET",
      match: (req) => req.url.includes("GetCalendarEvents"),
      handler: (_req, { count }) =>
        count === 1 ? html(200, loginPageHtml()) : json(200, CALENDAR_EVENTS),
    };

    const h = await harness({ routes: [flakyCalendar] });
    const meetings = await h.callTool<MeetingSummary[]>("list_meetings");

    expect(meetings).toHaveLength(3);
    expect(h.transport.requestsTo("GetCalendarEvents")).toHaveLength(2);
    expect(countLogins(h)).toBe(2);
  });
});
