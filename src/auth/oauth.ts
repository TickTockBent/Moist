import { google } from "googleapis";
import type { OAuth2Client, Credentials } from "google-auth-library";
import * as http from "http";
import { saveTokens, loadTokens, clearTokens } from "./storage.js";
import type { AuthStatus, TokenData } from "../types.js";

const DEFAULT_PORT = 3000;

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.compose",
];

let oauth2Client: OAuth2Client | null = null;
let authenticatedEmail: string | null = null;

function getClientConfig(): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
} {
  const clientId = process.env.MOIST_CLIENT_ID;
  const clientSecret = process.env.MOIST_CLIENT_SECRET;
  const redirectUri =
    process.env.MOIST_REDIRECT_URI ||
    `http://localhost:${DEFAULT_PORT}/oauth/callback`;

  if (!clientId || !clientSecret) {
    throw new Error(
      "MOIST_CLIENT_ID and MOIST_CLIENT_SECRET environment variables are required. " +
        "Create a Google Cloud project with Gmail API enabled and set up OAuth 2.0 credentials.",
    );
  }

  return { clientId, clientSecret, redirectUri };
}

function getPort(): number {
  const redirectUri =
    process.env.MOIST_REDIRECT_URI ||
    `http://localhost:${DEFAULT_PORT}/oauth/callback`;
  try {
    const url = new URL(redirectUri);
    return parseInt(url.port, 10) || DEFAULT_PORT;
  } catch {
    return DEFAULT_PORT;
  }
}

export function getOAuth2Client(): OAuth2Client {
  if (oauth2Client) {
    return oauth2Client;
  }

  const { clientId, clientSecret, redirectUri } = getClientConfig();
  oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  // Listen for token refresh events to persist new tokens
  oauth2Client.on("tokens", (tokens: Credentials) => {
    const existing = loadTokens();
    if (existing) {
      const updated: TokenData = {
        ...existing,
        access_token: tokens.access_token || existing.access_token,
        expiry_date: tokens.expiry_date || existing.expiry_date,
      };
      if (tokens.refresh_token) {
        updated.refresh_token = tokens.refresh_token;
      }
      saveTokens(updated);
    }
  });

  return oauth2Client;
}

function waitForAuthCode(port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url!, `http://localhost:${port}`);

      if (url.pathname === "/oauth/callback") {
        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");

        if (error) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(
            "<html><body><h1>Authorization Failed</h1>" +
              `<p>Error: ${error}</p>` +
              "<p>You can close this window.</p></body></html>",
          );
          server.close();
          reject(new Error(`OAuth error: ${error}`));
          return;
        }

        if (code) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(
            "<html><body>" +
              "<h1>Moist - Authorization Successful</h1>" +
              "<p>You can close this window and return to your application.</p>" +
              "</body></html>",
          );
          server.close();
          resolve(code);
          return;
        }
      }

      res.writeHead(404);
      res.end();
    });

    server.listen(port, "localhost", () => {
      console.error(
        `[moist] OAuth callback server listening on http://localhost:${port}/oauth/callback`,
      );
    });

    // Timeout after 2 minutes
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error("OAuth callback timed out after 2 minutes"));
    }, 120_000);

    server.on("close", () => clearTimeout(timeout));
  });
}

export async function authenticate(): Promise<void> {
  const client = getOAuth2Client();

  // Try to load existing tokens first
  const existingTokens = loadTokens();
  if (existingTokens) {
    client.setCredentials({
      access_token: existingTokens.access_token,
      refresh_token: existingTokens.refresh_token,
      expiry_date: existingTokens.expiry_date,
      token_type: existingTokens.token_type,
    });

    // Try to get user email to verify tokens work
    try {
      const gmail = google.gmail({ version: "v1", auth: client });
      const profile = await gmail.users.getProfile({ userId: "me" });
      authenticatedEmail = profile.data.emailAddress || null;
      console.error(`[moist] Authenticated as ${authenticatedEmail}`);
      return;
    } catch {
      console.error(
        "[moist] Stored tokens invalid, starting OAuth flow...",
      );
    }
  }

  // Start OAuth flow
  const port = getPort();
  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });

  console.error("[moist] Opening browser for authorization...");
  console.error(`[moist] If browser doesn't open, visit: ${authUrl}`);

  // Start callback server before opening browser
  const codePromise = waitForAuthCode(port);

  // Dynamically import 'open' (ESM-only package)
  try {
    const openModule = await import("open");
    await openModule.default(authUrl);
  } catch {
    console.error(
      "[moist] Could not open browser automatically. Please visit the URL above.",
    );
  }

  const code = await codePromise;
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  // Save tokens
  const tokenData: TokenData = {
    access_token: tokens.access_token || "",
    refresh_token: tokens.refresh_token || "",
    expiry_date: tokens.expiry_date || 0,
    token_type: tokens.token_type || "Bearer",
    scope: tokens.scope || SCOPES.join(" "),
  };
  saveTokens(tokenData);

  // Get user email
  try {
    const gmail = google.gmail({ version: "v1", auth: client });
    const profile = await gmail.users.getProfile({ userId: "me" });
    authenticatedEmail = profile.data.emailAddress || null;
    console.error(`[moist] Authenticated as ${authenticatedEmail}`);
  } catch {
    console.error("[moist] Authenticated but could not retrieve email");
  }
}

export async function getAuthStatus(): Promise<AuthStatus> {
  try {
    const client = getOAuth2Client();
    const credentials = client.credentials;

    if (!credentials.access_token && !credentials.refresh_token) {
      return { authenticated: false, error: "Not authenticated" };
    }

    return {
      authenticated: true,
      email: authenticatedEmail || undefined,
      scopes: credentials.scope?.split(" "),
      expiresAt: credentials.expiry_date
        ? new Date(credentials.expiry_date).toISOString()
        : undefined,
    };
  } catch (err) {
    return {
      authenticated: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function logout(): Promise<{ success: boolean }> {
  try {
    if (oauth2Client) {
      try {
        await oauth2Client.revokeCredentials();
      } catch {
        // Token may already be invalid, continue with cleanup
      }
      oauth2Client.credentials = {};
    }
    clearTokens();
    authenticatedEmail = null;
    oauth2Client = null;
    return { success: true };
  } catch {
    clearTokens();
    authenticatedEmail = null;
    oauth2Client = null;
    return { success: true };
  }
}

export function isAuthenticated(): boolean {
  if (!oauth2Client) return false;
  const creds = oauth2Client.credentials;
  return !!(creds.access_token || creds.refresh_token);
}
