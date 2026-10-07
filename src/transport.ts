export interface HttpRequest {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string | Uint8Array;
}

export interface HttpResponse {
  status: number;
  url: string;
  headers: Record<string, string>;
  setCookie: string[];
  body: Uint8Array;
}

export interface Transport {
  send(request: HttpRequest): Promise<HttpResponse>;
}

export function bodyText(response: HttpResponse): string {
  return new TextDecoder("utf-8").decode(response.body);
}

export function headerValue(response: HttpResponse, name: string): string | undefined {
  return response.headers[name.toLowerCase()];
}

export class FetchTransport implements Transport {
  async send(request: HttpRequest): Promise<HttpResponse> {
    const headers: Record<string, string> = { ...request.headers };
    if (request.body !== undefined && headers["content-type"] === undefined) {
      headers["content-type"] =
        typeof request.body === "string"
          ? "application/x-www-form-urlencoded"
          : "application/octet-stream";
    }

    const response = await fetch(request.url, {
      method: request.method,
      headers,
      body: request.body as RequestInit["body"],
      redirect: "manual",
    });

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key.toLowerCase()] = value;
    });

    const setCookie =
      typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];

    const body = new Uint8Array(await response.arrayBuffer());

    return {
      status: response.status,
      url: response.url || request.url,
      headers: responseHeaders,
      setCookie,
      body,
    };
  }
}
