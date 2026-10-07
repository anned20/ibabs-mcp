import type { AuthManager } from "./auth.js";
import type { Config } from "./config.js";
import { bodyText, headerValue, type HttpResponse } from "./transport.js";

export class PortalError extends Error {
  override name = "PortalError";
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export interface DownloadedDocument {
  body: Uint8Array;
  filename: string;
  mime: string;
}

function filenameFromDisposition(disposition: string | undefined, fallback: string): string {
  if (!disposition) return fallback;
  const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1].trim().replace(/^"|"$/g, ""));
    } catch {
      return utf8[1].trim().replace(/^"|"$/g, "");
    }
  }
  const plain = disposition.match(/filename="?([^";]+)"?/i);
  if (plain?.[1]) return plain[1].trim();
  return fallback;
}

export class PortalClient {
  constructor(
    private readonly auth: AuthManager,
    private readonly config: Config,
  ) {}

  private async get(pathOrUrl: string): Promise<HttpResponse> {
    const url = pathOrUrl.startsWith("http")
      ? pathOrUrl
      : `${this.config.portalUrl}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
    return this.auth.authenticatedRequest({ method: "GET", url });
  }

  async getCalendarEvents(start: Date, end: Date): Promise<unknown> {
    const url =
      `${this.config.portalUrl}/Meeting/GetCalendarEvents` +
      `?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`;
    const response = await this.auth.authenticatedRequest({ method: "GET", url });
    if (response.status >= 400) {
      throw new PortalError(`iBabs calendar request failed with status ${response.status}.`, response.status);
    }
    const text = bodyText(response);
    try {
      return JSON.parse(text);
    } catch {
      throw new PortalError(
        "Could not parse the iBabs calendar response as JSON. The endpoint may have changed.",
      );
    }
  }

  async getPageHtml(pathOrUrl: string): Promise<string> {
    const response = await this.get(pathOrUrl);
    if (response.status >= 400) {
      throw new PortalError(
        `iBabs page request failed with status ${response.status} for ${pathOrUrl}.`,
        response.status,
      );
    }
    return bodyText(response);
  }

  async download(documentId: string): Promise<DownloadedDocument> {
    const url = `${this.config.portalUrl}/Document/Download/${encodeURIComponent(documentId)}/`;
    const response = await this.auth.authenticatedRequest({ method: "GET", url });
    if (response.status >= 400) {
      throw new PortalError(
        `iBabs document download failed with status ${response.status} for ${documentId}.`,
        response.status,
      );
    }
    const mime = (headerValue(response, "content-type") ?? "application/octet-stream").split(";")[0]?.trim() ?? "application/octet-stream";
    const filename = filenameFromDisposition(headerValue(response, "content-disposition"), documentId);
    return { body: response.body, filename, mime };
  }
}
