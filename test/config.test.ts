import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("throws a clear error listing the missing credentials", () => {
    expect(() => loadConfig({})).toThrowError(ConfigError);
    expect(() => loadConfig({})).toThrowError(
      /IBABS_SITE.*IBABS_EMAIL.*IBABS_PASSWORD/s,
    );
  });

  it("accepts a session cookie in place of a password", () => {
    const config = loadConfig({
      IBABS_SITE: "example-site",
      IBABS_EMAIL: "test@example.com",
      IBABS_SESSION_COOKIE: "abc",
    });
    expect(config.sessionCookie).toBe("abc");
    expect(config.password).toBe("");
  });

  it("falls back to the documented portal defaults", () => {
    const config = loadConfig({
      IBABS_SITE: "example-site",
      IBABS_EMAIL: "test@example.com",
      IBABS_PASSWORD: "secret",
    });
    expect(config.portalUrl).toBe("https://portal.ibabs.eu");
    expect(config.loginUrl).toBe("https://signon.ibabs.eu/Login");
    expect(config.clientId).toBe("A5D450B5-D6C3-4C75-8BEF-665152DBD455");
  });
});
