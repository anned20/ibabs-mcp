import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Config } from "../src/config.js";
import { createRuntime, type Runtime } from "../src/runtime.js";
import { buildServer } from "../src/server.js";
import { authRoutes, portalDataRoutes, testConfig } from "./fixtures.js";
import { ScriptedTransport, type Route } from "./scripted-transport.js";

export interface Harness {
  dir: string;
  config: Config;
  transport: ScriptedTransport;
  runtime: Runtime;
  client: Client;
  callTool<T = unknown>(name: string, args?: Record<string, unknown>): Promise<T>;
  rawCallTool(name: string, args?: Record<string, unknown>): Promise<{ isError: boolean; text: string }>;
  close(): Promise<void>;
}

export interface HarnessOptions {
  config?: Partial<Config>;
  routes?: Route[];
  ttlMs?: number;
  maxTextChars?: number;
}

export async function createHarness(options: HarnessOptions = {}): Promise<Harness> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ibabs-mcp-test-"));
  const config = testConfig(dir, options.config);
  const transport = new ScriptedTransport([
    ...(options.routes ?? []),
    ...portalDataRoutes(config),
    ...authRoutes(config),
  ]);
  const runtime = createRuntime(config, transport, {
    ttlMs: options.ttlMs,
    maxTextChars: options.maxTextChars,
  });
  await runtime.auth.load();

  const server = buildServer({ service: runtime.service, documents: runtime.documents });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  const extract = (content: unknown): string => {
    const blocks = Array.isArray(content) ? content : [];
    const block = blocks.find(
      (b): b is { type: string; text?: string } =>
        typeof b === "object" && b !== null && (b as { type?: string }).type === "text",
    );
    return block?.text ?? "";
  };

  const rawCallTool = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name, arguments: args });
    return { isError: result.isError === true, text: extract(result.content) };
  };

  return {
    dir,
    config,
    transport,
    runtime,
    client,
    async callTool<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T> {
      const { isError, text } = await rawCallTool(name, args);
      if (isError) throw new Error(text);
      return JSON.parse(text) as T;
    },
    rawCallTool,
    async close() {
      await client.close();
      await server.close();
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}
