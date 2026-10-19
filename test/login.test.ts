import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AuthManager } from "../src/auth.js";
import { CookieJar } from "../src/cookie-jar.js";
import { ScriptedTransport } from "./scripted-transport.js";
import { authRoutes, testConfig, TEST_PASSWORD } from "./fixtures.js";

const tmpDirs: string[] = [];

async function makeDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ibabs-login-"));
  tmpDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("iBabs login replay", () => {
  it("establishes a portal session from the redirect chain", async () => {
    const dir = await makeDir();
    const config = testConfig(dir);
    const transport = new ScriptedTransport(authRoutes(config));
    const auth = new AuthManager(transport, config);

    expect(auth.isAuthenticated()).toBe(false);
    await auth.login();
    expect(auth.isAuthenticated()).toBe(true);

    const loginPost = transport
      .requestsTo("/Login", "POST")
      .find((req) => typeof req.body === "string" && req.body.includes("Password="));
    expect(loginPost).toBeDefined();
    expect(loginPost?.body).toContain(encodeURIComponent(config.email));
    expect(loginPost?.body).toContain("RememberPassword=false");
  });

  it("persists the session without ever writing the password", async () => {
    const dir = await makeDir();
    const config = testConfig(dir);
    const auth = new AuthManager(new ScriptedTransport(authRoutes(config)), config);
    await auth.login();

    const raw = await fs.readFile(path.join(dir, "session.json"), "utf8");
    expect(raw).toContain("__Host-ibabsportal");
    expect(raw).not.toContain(TEST_PASSWORD);
  });

  it("accepts the per-site session cookie on the site portal", () => {
    const config = testConfig("/tmp/unused", { portalUrl: "https://portal0600.ibabs.eu" });
    const jar = new CookieJar();
    jar.setCookie({ name: "__Host-ibabs-session", value: "site-session", domain: "portal0600.ibabs.eu" });
    const auth = new AuthManager(new ScriptedTransport([]), config, jar);

    expect(auth.isAuthenticated()).toBe(true);
  });

  it("ignores a session cookie belonging to another portal host", () => {
    const jar = new CookieJar();
    jar.setCookie({ name: "__Host-ibabsportal", value: "other-site", domain: "portal0600.ibabs.eu" });
    const auth = new AuthManager(new ScriptedTransport([]), testConfig("/tmp/unused"), jar);

    expect(auth.isAuthenticated()).toBe(false);
  });

  it("reloads a persisted session without calling the transport", async () => {
    const dir = await makeDir();
    const config = testConfig(dir);
    await new AuthManager(new ScriptedTransport(authRoutes(config)), config).login();

    const offline = new ScriptedTransport([]);
    const reloaded = new AuthManager(offline, config);
    expect(await reloaded.load()).toBe(true);
    expect(reloaded.isAuthenticated()).toBe(true);
    expect(offline.requests).toHaveLength(0);
  });
});
