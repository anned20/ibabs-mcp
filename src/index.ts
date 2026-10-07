#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ConfigError, loadConfig } from "./config.js";
import { createRuntime } from "./runtime.js";
import { buildServer } from "./server.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const runtime = createRuntime(config);
  await runtime.auth.load();

  const server = buildServer({ service: runtime.service, documents: runtime.documents });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  const message =
    error instanceof ConfigError || error instanceof Error
      ? error.message
      : "Unknown error starting iBabs MCP server.";
  process.stderr.write(`[ibabs-mcp] ${message}\n`);
  process.exit(1);
});
