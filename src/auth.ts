import fs from "node:fs/promises";
import path from "node:path";
import { parseLoginForm } from "./adapter.js";
import type { Config } from "./config.js";
import { CookieJar } from "./cookie-jar.js";
import { bodyText, headerValue, type HttpRequest, type HttpResponse, type Transport } from "./transport.js";

export class AuthError extends Error {
  override name = "AuthError";
}

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";

function redirectLocation(response: HttpResponse): string | undefined {
  const location = headerValue(response, "location");
  if (!location) return undefined;
  try {
    return new URL(location, response.url).href;
  } catch {
    return undefined;
  }
}

function formEncode(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

function hostOf(url: string): string {
  return new URL(url).hostname.toLowerCase();
}

function looksLikeLogin(response: HttpResponse): boolean {
  if (response.status === 401 || response.status === 403) return true;

  const location = headerValue(response, "location")?.toLowerCase() ?? "";
  if ((response.status === 302 || response.status === 301) && (
    location.includes("/account/login") || location.includes("signon.ibabs.eu/login")
  )) {
    return true;
  }

  const contentType = headerValue(response, "content-type")?.toLowerCase() ?? "";
  if (response.status === 200 && contentType.includes("text/html")) {
    const html = bodyText(response).toLowerCase();
    return (
      html.includes('name="password"') ||
      html.includes("signon.ibabs.eu/login") ||
      html.includes("/account/login")
    );
  }

  return false;
}

export class AuthManager {
  private jar: CookieJar;

  constructor(
    private readonly transport: Transport,
    private readonly config: Config,
    jar: CookieJar = new CookieJar(),
  ) {
    this.jar = jar;
    if (config.sessionCookie && !this.jar.has("__Host-ibabsportal")) {
      this.jar.setCookie({
        name: "__Host-ibabsportal",
        value: config.sessionCookie,
        domain: hostOf(config.portalUrl),
      });
    }
  }

  get sessionPath(): string {
    return path.join(this.config.cacheDir, "session.json");
  }

  isAuthenticated(): boolean {
    return this.jar.has("__Host-ibabsportal");
  }

  async load(): Promise<boolean> {
    try {
      const raw = await fs.readFile(this.sessionPath, "utf8");
      this.jar = CookieJar.fromJSON(JSON.parse(raw));
      if (this.config.sessionCookie && !this.jar.has("__Host-ibabsportal")) {
        this.jar.setCookie({
          name: "__Host-ibabsportal",
          value: this.config.sessionCookie,
          domain: hostOf(this.config.portalUrl),
        });
      }
      return this.isAuthenticated();
    } catch {
      return this.isAuthenticated();
    }
  }

  async persist(): Promise<void> {
    await fs.mkdir(this.config.cacheDir, { recursive: true });
    await fs.writeFile(this.sessionPath, JSON.stringify(this.jar.toJSON(), null, 2), "utf8");
  }

  private async rawSend(request: HttpRequest): Promise<HttpResponse> {
    const headers: Record<string, string> = { ...request.headers };
    const cookie = this.jar.headerFor(request.url);
    if (cookie) headers.cookie = cookie;
    headers["user-agent"] = headers["user-agent"] ?? USER_AGENT;

    const response = await this.transport.send({ ...request, headers });
    this.jar.setFromResponse(response.url, response.setCookie);
    return response;
  }

  async ensureSession(): Promise<void> {
    if (this.isAuthenticated()) return;
    if (!this.config.password) {
      throw new AuthError(
        "No iBabs session available and no IBABS_PASSWORD configured. " +
          "Set IBABS_PASSWORD or provide IBABS_SESSION_COOKIE.",
      );
    }
    await this.login();
  }

  async authenticatedRequest(request: HttpRequest): Promise<HttpResponse> {
    await this.ensureSession();
    let response = await this.rawSend(request);
    if (looksLikeLogin(response)) {
      await this.login();
      response = await this.rawSend(request);
      if (looksLikeLogin(response)) {
        throw new AuthError(
          "iBabs session could not be re-established; the portal kept returning a login page. " +
            "Check IBABS_EMAIL / IBABS_PASSWORD.",
        );
      }
    }
    return response;
  }

  async login(): Promise<void> {
    const portal = this.config.portalUrl;

    let response = await this.rawSend({ method: "GET", url: `${portal}/Account/Login?ReturnUrl=%2F` });
    let location = redirectLocation(response);
    if (!location) {
      throw new AuthError(
        `iBabs login flow did not redirect from ${portal}/Account/Login. The portal may be unreachable or changed.`,
      );
    }

    response = await this.rawSend({ method: "GET", url: location });
    location = redirectLocation(response) ?? location;

    response = await this.rawSend({ method: "GET", url: location });
    const loginHtml = bodyText(response);
    const { requestVerificationToken, viewState } = parseLoginForm(loginHtml);
    if (!requestVerificationToken) {
      throw new AuthError(
        "Could not find the antiforgery token on the iBabs login page. The login markup may have changed.",
      );
    }

    const loginUrl = new URL(location);
    const returnUrl = loginUrl.searchParams.get("ReturnUrl") ?? location;

    const loginOptionsUrl = new URL(this.config.loginUrl);
    loginOptionsUrl.pathname = `/Site/GetLoginOptions/${encodeURIComponent(this.config.site)}`;
    loginOptionsUrl.searchParams.set("ReturnUrl", returnUrl);
    await this.rawSend({
      method: "POST",
      url: loginOptionsUrl.href,
      headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" },
      body: formEncode({ __RequestVerificationToken: requestVerificationToken }),
    });

    const credentialsForm = formEncode({
      __RequestVerificationToken: requestVerificationToken,
      ...(viewState ? { viewState } : {}),
      SiteName: this.config.site,
      EmailAddress: this.config.email,
      Password: this.config.password,
      RememberPassword: "false",
    });

    response = await this.rawSend({
      method: "POST",
      url: `${loginUrl.origin}${loginUrl.pathname}?ReturnUrl=${encodeURIComponent(returnUrl)}`,
      headers: { origin: loginUrl.origin },
      body: credentialsForm,
    });

    await this.followRedirects(response);

    if (!this.isAuthenticated()) {
      throw new AuthError(
        "iBabs login did not establish a portal session. Check IBABS_EMAIL and IBABS_PASSWORD.",
      );
    }

    await this.persist();
  }

  private async followRedirects(start: HttpResponse, max = 12): Promise<HttpResponse> {
    let current = start;
    for (let i = 0; i < max; i++) {
      if (current.status < 300 || current.status >= 400) return current;
      const location = redirectLocation(current);
      if (!location) return current;
      current = await this.rawSend({ method: "GET", url: location });
    }
    return current;
  }
}
