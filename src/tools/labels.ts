import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listLabels, modifyLabels, toMoistError } from "../client/gmail.js";

export function registerLabelTools(server: McpServer): void {
  server.tool(
    "moist_list_labels",
    "List all Gmail labels (both system and user-created)",
    {},
    async () => {
      try {
        const result = await listLabels();
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
    "moist_modify_labels",
    "Add or remove labels from a Gmail message",
    {
      messageId: z.string().describe("The Gmail message ID"),
      addLabelIds: z
        .array(z.string())
        .optional()
        .describe("Label IDs to add to the message"),
      removeLabelIds: z
        .array(z.string())
        .optional()
        .describe("Label IDs to remove from the message"),
    },
    async ({ messageId, addLabelIds, removeLabelIds }) => {
      try {
        const result = await modifyLabels(messageId, {
          addLabelIds,
          removeLabelIds,
        });
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
