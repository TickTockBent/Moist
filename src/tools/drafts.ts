import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  createDraft,
  listDrafts,
  deleteDraft,
  sendDraft,
  toMoistError,
} from "../client/gmail.js";

export function registerDraftTools(server: McpServer): void {
  server.tool(
    "moist_create_draft",
    "Create a new email draft",
    {
      to: z
        .union([z.string(), z.array(z.string())])
        .describe("Recipient email address(es)"),
      subject: z.string().describe("Email subject line"),
      body: z.string().describe("Email body (plain text)"),
      cc: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe("CC recipients"),
      bcc: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe("BCC recipients"),
    },
    async (args) => {
      try {
        const result = await createDraft(args);
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
    "moist_list_drafts",
    "List email drafts with pagination",
    {
      maxResults: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .describe("Maximum results to return (default: 20, max: 100)"),
      pageToken: z.string().optional().describe("Pagination token from previous response"),
    },
    async (args) => {
      try {
        const result = await listDrafts(args);
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
    "moist_delete_draft",
    "Delete a draft email",
    {
      draftId: z.string().describe("The Gmail draft ID to delete"),
    },
    async ({ draftId }) => {
      try {
        const result = await deleteDraft(draftId);
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
    "moist_send_draft",
    "Send an existing draft email",
    {
      draftId: z.string().describe("The Gmail draft ID to send"),
    },
    async ({ draftId }) => {
      try {
        const result = await sendDraft(draftId);
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
