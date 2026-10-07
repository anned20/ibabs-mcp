import { AuthManager } from "./auth.js";
import type { Config } from "./config.js";
import { DocumentService } from "./documents.js";
import { PortalClient } from "./portal-client.js";
import { MeetingService } from "./service.js";
import { FetchTransport, type Transport } from "./transport.js";

export interface Runtime {
  config: Config;
  auth: AuthManager;
  client: PortalClient;
  service: MeetingService;
  documents: DocumentService;
}

export interface RuntimeOptions {
  ttlMs?: number;
  maxTextChars?: number;
}

export function createRuntime(
  config: Config,
  transport: Transport = new FetchTransport(),
  options: RuntimeOptions = {},
): Runtime {
  const auth = new AuthManager(transport, config);
  const client = new PortalClient(auth, config);
  const service = new MeetingService(client, options.ttlMs);
  const documents = new DocumentService(client, config.downloadDir, options.maxTextChars);
  return { config, auth, client, service, documents };
}
