import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  listMessages,
  getMessage,
  sendMessage,
  trashMessage,
  deleteMessage,
  toMoistError,
} from "../client/gmail.js";

export function registerMessageTools(server: McpServer): void {
  server.tool(
    "moist_list_messages",
    "Search and list Gmail messages with optional filters and pagination",
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
        const result = await listMessages(args);
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
    "moist_get_message",
    "Retrieve the full details of a Gmail message including body, headers, and attachment metadata",
    {
      messageId: z.string().describe("The Gmail message ID"),
    },
    async ({ messageId }) => {
      try {
        const result = await getMessage(messageId);
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
    "moist_send_message",
    "Send an email message. Can also reply to an existing message or attach to a thread.",
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
      replyTo: z
        .string()
        .optional()
        .describe("Message ID to reply to (sets In-Reply-To headers)"),
      threadId: z
        .string()
        .optional()
        .describe("Thread ID to attach this message to"),
    },
    async (args) => {
      try {
        const result = await sendMessage(args);
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
    "moist_trash_message",
    "Move a Gmail message to the trash",
    {
      messageId: z.string().describe("The Gmail message ID to trash"),
    },
    async ({ messageId }) => {
      try {
        const result = await trashMessage(messageId);
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
    "moist_delete_message",
    "Permanently delete a Gmail message. This cannot be undone - use moist_trash_message instead for recoverable deletion.",
    {
      messageId: z
        .string()
        .describe("The Gmail message ID to permanently delete"),
    },
    async ({ messageId }) => {
      try {
        const result = await deleteMessage(messageId);
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
