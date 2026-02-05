import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getThread, listThreads, trashThread, toMoistError } from "../client/gmail.js";

export function registerThreadTools(server: McpServer): void {
  server.tool(
    "moist_get_thread",
    "Retrieve a Gmail thread with all its messages",
    {
      threadId: z.string().describe("The Gmail thread ID"),
    },
    async ({ threadId }) => {
      try {
        const result = await getThread(threadId);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: JSON.stringify(toMoistError(err)) }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "moist_list_threads",
    "List Gmail threads with optional search and filtering",
    {
      query: z.string().optional().describe("Gmail search query syntax"),
      maxResults: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .describe("Maximum results to return (default: 20, max: 100)"),
      pageToken: z.string().optional().describe("Pagination token from previous response"),
      labelIds: z
        .array(z.string())
        .optional()
        .describe("Filter by label IDs"),
    },
    async (args) => {
      try {
        const result = await listThreads(args);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: JSON.stringify(toMoistError(err)) }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "moist_trash_thread",
    "Move an entire Gmail thread to the trash",
    {
      threadId: z.string().describe("The Gmail thread ID to trash"),
    },
    async ({ threadId }) => {
      try {
        const result = await trashThread(threadId);
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
