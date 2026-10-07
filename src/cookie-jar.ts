export interface Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  expires: number | null;
  sameSite: string | null;
}

function parseSetCookie(raw: string): { cookie: Cookie; expires: number | null } | null {
  const segments = raw.split(";");
  const first = segments.shift();
  if (!first) return null;
  const eq = first.indexOf("=");
  if (eq < 0) return null;
  const name = first.slice(0, eq).trim();
  const value = first.slice(eq + 1).trim();
  if (!name) return null;

  const cookie: Cookie = {
    name,
    value,
    domain: "",
    path: "",
    secure: false,
    httpOnly: false,
    expires: null,
    sameSite: null,
  };

  for (const segment of segments) {
    const idx = segment.indexOf("=");
    const key = (idx < 0 ? segment : segment.slice(0, idx)).trim().toLowerCase();
    const val = idx < 0 ? "" : segment.slice(idx + 1).trim();
    switch (key) {
      case "domain":
        cookie.domain = val.toLowerCase();
        break;
      case "path":
        cookie.path = val || "/";
        break;
      case "secure":
        cookie.secure = true;
        break;
      case "httponly":
        cookie.httpOnly = true;
        break;
      case "samesite":
        cookie.sameSite = val;
        break;
      case "max-age": {
        const seconds = Number.parseInt(val, 10);
        if (Number.isFinite(seconds)) {
          cookie.expires = Date.now() / 1000 + seconds;
        }
        break;
      }
      case "expires": {
        const parsed = Date.parse(val);
        if (Number.isFinite(parsed)) {
          cookie.expires = parsed / 1000;
        }
        break;
      }
      default:
        break;
    }
  }

  return { cookie, expires: cookie.expires };
}

function domainMatches(cookieDomain: string, host: string): boolean {
  const domain = cookieDomain.replace(/^\./, "").toLowerCase();
  const normalizedHost = host.toLowerCase();
  return normalizedHost === domain || normalizedHost.endsWith(`.${domain}`);
}

function pathMatches(cookiePath: string, requestPath: string): boolean {
  if (cookiePath === "/" || cookiePath === "") return true;
  if (requestPath === cookiePath) return true;
  if (requestPath.startsWith(cookiePath)) {
    return cookiePath.endsWith("/") || requestPath[cookiePath.length] === "/";
  }
  return false;
}

// RFC 6265 default-path: everything up to (not including) the rightmost "/".
function defaultPath(uriPath: string): string {
  if (!uriPath || uriPath[0] !== "/") return "/";
  const lastSlash = uriPath.lastIndexOf("/");
  if (lastSlash <= 0) return "/";
  return uriPath.slice(0, lastSlash);
}

export class CookieJar {
  private cookies: Cookie[] = [];

  static fromJSON(data: unknown): CookieJar {
    const jar = new CookieJar();
    if (!Array.isArray(data)) return jar;
    jar.cookies = data.filter((c): c is Cookie => {
      return (
        typeof c === "object" &&
        c !== null &&
        typeof (c as Cookie).name === "string" &&
        typeof (c as Cookie).value === "string" &&
        typeof (c as Cookie).domain === "string"
      );
    });
    return jar;
  }

  setFromResponse(url: string, setCookieHeaders: readonly string[]): void {
    const { hostname, pathname: path } = new URL(url);
    for (const raw of setCookieHeaders) {
      const parsed = parseSetCookie(raw);
      if (!parsed) continue;
      const cookie = parsed.cookie;
      if (!cookie.domain) cookie.domain = hostname.toLowerCase();
      if (!cookie.path) cookie.path = defaultPath(path || "/");
      if (cookie.value === "" || cookie.expires === 0) {
        this.remove(cookie.name, cookie.domain, cookie.path);
        continue;
      }
      this.upsert(cookie);
    }
  }

  setCookie(cookie: Partial<Cookie> & { name: string; value: string; domain: string }): void {
    this.upsert({
      path: "/",
      secure: true,
      httpOnly: true,
      expires: null,
      sameSite: null,
      ...cookie,
    });
  }

  private remove(name: string, domain: string, path: string): void {
    this.cookies = this.cookies.filter(
      (c) => !(c.name === name && c.domain === domain && c.path === path),
    );
  }

  private upsert(cookie: Cookie): void {
    this.cookies = this.cookies.filter(
      (c) => !(c.name === cookie.name && c.domain === cookie.domain && c.path === cookie.path),
    );
    this.cookies.push(cookie);
  }

  headerFor(url: string): string {
    const { hostname, pathname: path, protocol } = new URL(url);
    const now = Date.now() / 1000;
    return this.cookies
      .filter((c) => {
        if (c.expires !== null && c.expires <= now) return false;
        if (c.secure && protocol !== "https:") return false;
        return domainMatches(c.domain, hostname) && pathMatches(c.path, path || "/");
      })
      .sort((a, b) => b.path.length - a.path.length)
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
  }

  has(name: string): boolean {
    const now = Date.now() / 1000;
    return this.cookies.some((c) => c.name === name && (c.expires === null || c.expires > now));
  }

  get(name: string): Cookie | undefined {
    return this.cookies.find((c) => c.name === name);
  }

  toJSON(): Cookie[] {
    return this.cookies.map((c) => ({ ...c }));
  }
}
