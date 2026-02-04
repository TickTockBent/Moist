# Moist

**Gmail MCP Connector**

*"Neither rain nor snow nor stranded tokens shall stay this messenger."*

---

Moist is an [MCP](https://modelcontextprotocol.io) server that exposes Gmail operations as tools. It handles OAuth 2.0, token refresh, rate limiting, and MIME parsing so consuming applications don't have to.

## Quick Start

### 1. Google Cloud Setup

1. Create a project in the [Google Cloud Console](https://console.cloud.google.com/)
2. Enable the **Gmail API**
3. Create **OAuth 2.0 Client ID** credentials (Desktop application type)
4. Add `http://localhost:3000/oauth/callback` as an authorized redirect URI
5. Note your Client ID and Client Secret

### 2. MCP Configuration

Add Moist to your MCP client configuration:

```json
{
  "mcpServers": {
    "moist": {
      "command": "npx",
      "args": ["@ticktockbent/moist"],
      "env": {
        "MOIST_CLIENT_ID": "your_client_id",
        "MOIST_CLIENT_SECRET": "your_client_secret"
      }
    }
  }
}
```

### 3. First Run

On the first connection, Moist opens your browser for Google OAuth consent. Once authorized, tokens are encrypted and stored locally at `~/.moist/tokens.json`. Subsequent runs authenticate automatically.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MOIST_CLIENT_ID` | Yes | Google OAuth 2.0 Client ID |
| `MOIST_CLIENT_SECRET` | Yes | Google OAuth 2.0 Client Secret |
| `MOIST_REDIRECT_URI` | No | OAuth callback URI (default: `http://localhost:3000/oauth/callback`) |

## Tools

### Authentication

| Tool | Description |
|------|-------------|
| `moist_auth_status` | Check authentication state, email, scopes, and token expiry |
| `moist_auth_logout` | Revoke tokens and clear stored credentials |

### Messages

| Tool | Description |
|------|-------------|
| `moist_list_messages` | Search and list messages with pagination and label filtering |
| `moist_get_message` | Get full message details including body, headers, and attachments |
| `moist_send_message` | Send an email (supports replies via `replyTo` and threading via `threadId`) |
| `moist_trash_message` | Move a message to trash |
| `moist_delete_message` | Permanently delete a message (irreversible) |

### Threads

| Tool | Description |
|------|-------------|
| `moist_list_threads` | List threads with search and label filtering |
| `moist_get_thread` | Get a thread with all its messages |
| `moist_trash_thread` | Move an entire thread to trash |

### Labels

| Tool | Description |
|------|-------------|
| `moist_list_labels` | List all labels (system and user-created) |
| `moist_modify_labels` | Add or remove labels from a message |

### Search

| Tool | Description |
|------|-------------|
| `moist_search` | Search messages using Gmail's full query syntax |

Gmail search supports operators like `from:`, `to:`, `subject:`, `has:attachment`, `is:unread`, `is:starred`, `label:`, `after:`, `before:`, `filename:`, and `"exact phrases"`. Operators can be combined:

```
from:bank@example.com has:attachment after:2024/01/01 subject:statement
```

### Drafts

| Tool | Description |
|------|-------------|
| `moist_create_draft` | Create a new draft email |
| `moist_list_drafts` | List drafts with pagination |
| `moist_delete_draft` | Delete a draft |
| `moist_send_draft` | Send an existing draft |

## Architecture

```
src/
├── index.ts              # MCP server entry point (stdio transport)
├── types.ts              # TypeScript interfaces
├── auth/
│   ├── oauth.ts          # OAuth 2.0 flow, token refresh, browser consent
│   └── storage.ts        # Encrypted token persistence (~/.moist/)
├── client/
│   ├── gmail.ts          # Gmail API wrapper, MIME parsing, message building
│   └── rate-limiter.ts   # Sliding-window quota tracker
└── tools/
    ├── auth.ts           # Auth status and logout tools
    ├── messages.ts       # Message CRUD tools
    ├── threads.ts        # Thread tools
    ├── labels.ts         # Label tools
    ├── search.ts         # Search tool
    └── drafts.ts         # Draft tools
```

### Key Design Decisions

- **Stateless** -- No caching. Each tool call hits the Gmail API directly.
- **Single account** -- One Gmail account per server instance. Run multiple instances for multiple accounts.
- **Raw content** -- Message bodies are returned as-is (plain text and HTML). No parsing or summarization.
- **Encrypted storage** -- Tokens at rest are AES-256-CBC encrypted using a machine-specific derived key.
- **Rate limiting** -- Tracks Gmail API quota usage in a sliding 1-second window (250 units/sec per Google's limits). Returns structured errors with retry timing when exceeded.

### Error Handling

All tools return consistent error shapes:

```json
{
  "error": "not_found",
  "message": "Human-readable description",
  "details": {}
}
```

| Error Code | Meaning |
|------------|---------|
| `not_found` | Message, thread, or label doesn't exist |
| `rate_limited` | Gmail API quota exceeded (includes `retryAfter`) |
| `auth_failed` | Token expired or revoked |
| `invalid_request` | Bad parameters |
| `api_error` | Gmail API error (details included) |

## OAuth Scopes

Moist requests these scopes during authorization:

| Scope | Purpose |
|-------|---------|
| `gmail.readonly` | Read messages, threads, and labels |
| `gmail.send` | Send messages |
| `gmail.modify` | Modify labels, trash/untrash |
| `gmail.compose` | Create and manage drafts |

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev
```

## License

MIT

## References

- [Gmail API Documentation](https://developers.google.com/gmail/api)
- [MCP Specification](https://modelcontextprotocol.io)
- [Going Postal](https://en.wikipedia.org/wiki/Going_Postal) -- The source of the name
