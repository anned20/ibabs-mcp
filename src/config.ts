import os from "node:os";
import path from "node:path";

export interface Config {
  site: string;
  email: string;
  password: string;
  portalUrl: string;
  authorizeUrl: string;
  loginUrl: string;
  clientId: string;
  redirectUri: string;
  cacheDir: string;
  downloadDir: string;
  sessionCookie?: string;
}

export class ConfigError extends Error {
  override name = "ConfigError";
}

const DEFAULTS = {
  portalUrl: "https://portal.ibabs.eu",
  authorizeUrl: "https://signon.ibabs.eu/OAuth/Authorize",
  loginUrl: "https://signon.ibabs.eu/Login",
  clientId: "A5D450B5-D6C3-4C75-8BEF-665152DBD455",
  redirectUri: "https://portal.ibabs.eu/signin-iBabs",
} as const;

export function defaultCacheDir(): string {
  if (process.env.XDG_CACHE_HOME) {
    return path.join(process.env.XDG_CACHE_HOME, "ibabs-mcp");
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Caches", "ibabs-mcp");
  }
  if (process.platform === "win32") {
    const base = process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
    return path.join(base, "ibabs-mcp");
  }
  return path.join(os.homedir(), ".cache", "ibabs-mcp");
}

function trimmed(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const v = value.trim();
  return v.length > 0 ? v : undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const site = trimmed(env.IBABS_SITE);
  const email = trimmed(env.IBABS_EMAIL);
  const password = trimmed(env.IBABS_PASSWORD);
  const sessionCookie = trimmed(env.IBABS_SESSION_COOKIE);

  const missing: string[] = [];
  if (!site) missing.push("IBABS_SITE");
  if (!email) missing.push("IBABS_EMAIL");
  if (!password && !sessionCookie) missing.push("IBABS_PASSWORD");
  if (missing.length > 0) {
    throw new ConfigError(
      `Missing required iBabs configuration: ${missing.join(", ")}. ` +
        "Set these environment variables (see .env.example) before starting the server.",
    );
  }

  const cacheDir = trimmed(env.IBABS_CACHE_DIR) ?? defaultCacheDir();
  const downloadDir = trimmed(env.IBABS_DOWNLOAD_DIR) ?? path.join(cacheDir, "downloads");

  return {
    site: site as string,
    email: email as string,
    password: password ?? "",
    portalUrl: (trimmed(env.IBABS_PORTAL_URL) ?? DEFAULTS.portalUrl).replace(/\/$/, ""),
    authorizeUrl: trimmed(env.IBABS_AUTHORIZE_URL) ?? DEFAULTS.authorizeUrl,
    loginUrl: trimmed(env.IBABS_LOGIN_URL) ?? DEFAULTS.loginUrl,
    clientId: trimmed(env.IBABS_CLIENT_ID) ?? DEFAULTS.clientId,
    redirectUri: trimmed(env.IBABS_REDIRECT_URI) ?? DEFAULTS.redirectUri,
    cacheDir,
    downloadDir,
    ...(sessionCookie ? { sessionCookie } : {}),
  };
}
