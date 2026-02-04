import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listMessages, toMoistError } from "../client/gmail.js";

export function registerSearchTools(server: McpServer): void {
  server.tool(
    "moist_search",
    "Search Gmail messages using Gmail's full search syntax (from:, to:, subject:, has:attachment, is:unread, label:, etc.)",
    {
      query: z.string().describe("Gmail search query"),
      maxResults: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .describe("Maximum results to return (default: 20, max: 100)"),
      pageToken: z.string().optional().describe("Pagination token from previous response"),
    },
    async ({ query, maxResults, pageToken }) => {
      try {
        const result = await listMessages({ query, maxResults, pageToken });
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: JSON.stringify(toMoistError(err)) }],
          isError: true,
        };
      }
    },
  );
}
