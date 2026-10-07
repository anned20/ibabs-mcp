import type { HttpRequest, HttpResponse, Transport } from "../src/transport.js";

export interface RouteContext {
  count: number;
}

export interface Route {
  name?: string;
  method?: string;
  match: (req: HttpRequest) => boolean;
  handler: (req: HttpRequest, ctx: RouteContext) => Partial<HttpResponse> | Promise<Partial<HttpResponse>>;
}

export class ScriptedTransport implements Transport {
  readonly requests: HttpRequest[] = [];
  private readonly counts = new Map<string, number>();

  constructor(private readonly routes: Route[]) {}

  async send(request: HttpRequest): Promise<HttpResponse> {
    this.requests.push(request);

    for (let i = 0; i < this.routes.length; i++) {
      const route = this.routes[i]!;
      if (route.method && route.method.toUpperCase() !== request.method.toUpperCase()) continue;
      if (!route.match(request)) continue;

      const key = route.name ?? `route-${i}`;
      const count = (this.counts.get(key) ?? 0) + 1;
      this.counts.set(key, count);

      const partial = await route.handler(request, { count });
      return {
        status: partial.status ?? 200,
        url: request.url,
        headers: partial.headers ?? {},
        setCookie: partial.setCookie ?? [],
        body: partial.body ?? new Uint8Array(),
      };
    }

    throw new Error(`No scripted response for ${request.method} ${request.url}`);
  }

  requestsTo(fragment: string, method?: string): HttpRequest[] {
    return this.requests.filter(
      (r) => r.url.includes(fragment) && (!method || r.method.toUpperCase() === method.toUpperCase()),
    );
  }
}

export function html(status: number, body: string, extra: Partial<HttpResponse> = {}): Partial<HttpResponse> {
  const headers = { "content-type": "text/html; charset=utf-8", ...(extra.headers ?? {}) };
  return { ...extra, status, headers, body: new TextEncoder().encode(body) };
}

export function json(status: number, value: unknown): Partial<HttpResponse> {
  return {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: new TextEncoder().encode(JSON.stringify(value)),
  };
}

export function redirect(status: number, location: string, setCookie: string[] = []): Partial<HttpResponse> {
  return {
    status,
    headers: { location },
    setCookie,
  };
}
