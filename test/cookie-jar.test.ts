import { describe, expect, it } from "vitest";
import { CookieJar } from "../src/cookie-jar.js";

describe("CookieJar", () => {
  it("keeps an explicit root path and sends the cookie on deep paths", () => {
    const jar = new CookieJar();
    jar.setFromResponse("https://portal.ibabs.eu/Account/ExternalLoginCallback", [
      "__Host-ibabsportal=abc; Path=/; Secure; HttpOnly",
    ]);
    expect(jar.headerFor("https://portal.ibabs.eu/Meeting/GetCalendarEvents")).toContain(
      "__Host-ibabsportal=abc",
    );
  });

  it("applies the RFC default path when no Path is given", () => {
    const jar = new CookieJar();
    jar.setFromResponse("https://example.com/a/b/c", ["session=xyz"]);
    expect(jar.headerFor("https://example.com/a/b/other")).toContain("session=xyz");
    expect(jar.headerFor("https://example.com/other")).not.toContain("session=xyz");
  });

  it("scopes cookies by domain, including a leading dot", () => {
    const jar = new CookieJar();
    jar.setFromResponse("https://signon.ibabs.eu/Login", [
      "device_key=dev; Domain=.ibabs.eu; Path=/; Secure",
    ]);
    expect(jar.headerFor("https://portal.ibabs.eu/")).toContain("device_key=dev");
    expect(jar.headerFor("https://example.com/")).not.toContain("device_key=dev");
  });

  it("round-trips through JSON", () => {
    const jar = new CookieJar();
    jar.setFromResponse("https://portal.ibabs.eu/", ["a=1; Path=/; Secure"]);
    const restored = CookieJar.fromJSON(JSON.parse(JSON.stringify(jar.toJSON())));
    expect(restored.headerFor("https://portal.ibabs.eu/")).toContain("a=1");
  });
});
