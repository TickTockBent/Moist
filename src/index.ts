#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { authenticate } from "./auth/oauth.js";
import { registerMessageTools } from "./tools/messages.js";
import { registerThreadTools } from "./tools/threads.js";
import { registerLabelTools } from "./tools/labels.js";
import { registerSearchTools } from "./tools/search.js";
import { registerDraftTools } from "./tools/drafts.js";
import { registerAuthTools } from "./tools/auth.js";

async function main(): Promise<void> {
  console.error("[moist] Starting Moist - Gmail MCP Connector");

  // Create MCP server
  const server = new McpServer({
    name: "moist",
    version: "1.0.0",
  });

  // Register all tools before connecting
  registerAuthTools(server);
  registerMessageTools(server);
  registerThreadTools(server);
  registerLabelTools(server);
  registerSearchTools(server);
  registerDraftTools(server);

  // Attempt authentication (loads saved tokens or starts OAuth flow)
  try {
    await authenticate();
  } catch (err) {
    console.error(
      `[moist] Authentication failed: ${err instanceof Error ? err.message : err}`,
    );
    console.error(
      "[moist] Server will start but tools requiring auth will fail. Use moist_auth_status to check.",
    );
  }

  // Connect to stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("[moist] MCP server running on stdio");
}

main().catch((err) => {
  console.error("[moist] Fatal error:", err);
  process.exit(1);
});
