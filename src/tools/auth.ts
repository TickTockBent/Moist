import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getAuthStatus, logout } from "../auth/oauth.js";

export function registerAuthTools(server: McpServer): void {
  server.tool(
    "moist_auth_status",
    "Check the current authentication status, including email, scopes, and token expiry",
    {},
    async () => {
      const result = await getAuthStatus();
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );

  server.tool(
    "moist_auth_logout",
    "Logout and clear stored authentication tokens",
    {},
    async () => {
      const result = await logout();
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );
}
