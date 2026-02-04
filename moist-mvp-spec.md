# Moist

**Gmail MCP Connector**

*"Neither rain nor snow nor stranded tokens shall stay this messenger."*

---

## Overview

Moist is an MCP server that exposes Gmail operations as tools. It handles OAuth, token refresh, and rate limiting so consuming applications don't have to.

```
npm install @ticktockbent/moist
```

---

## Tools

### Messages

```typescript
moist_list_messages(options?: {
  query?: string;          // Gmail search syntax
  maxResults?: number;     // Default: 20, max: 100
  pageToken?: string;      // Pagination
  labelIds?: string[];     // Filter by labels
}) → { messages: MessageSummary[], nextPageToken?: string }

moist_get_message(messageId: string) → Message

moist_send_message(options: {
  to: string | string[];
  subject: string;
  body: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;        // Message ID to reply to
  threadId?: string;       // Thread to attach to
}) → { messageId: string, threadId: string }

moist_trash_message(messageId: string) → { success: boolean }

moist_delete_message(messageId: string) → { success: boolean }
// Permanent delete - use with caution
```

### Threads

```typescript
moist_get_thread(threadId: string) → Thread

moist_list_threads(options?: {
  query?: string;
  maxResults?: number;
  pageToken?: string;
  labelIds?: string[];
}) → { threads: ThreadSummary[], nextPageToken?: string }

moist_trash_thread(threadId: string) → { success: boolean }
```

### Labels

```typescript
moist_list_labels() → Label[]

moist_modify_labels(messageId: string, options: {
  addLabelIds?: string[];
  removeLabelIds?: string[];
}) → { success: boolean }
```

### Search

```typescript
moist_search(query: string, options?: {
  maxResults?: number;
  pageToken?: string;
}) → { messages: MessageSummary[], nextPageToken?: string }
```

### Drafts

```typescript
moist_create_draft(options: {
  to: string | string[];
  subject: string;
  body: string;
  cc?: string | string[];
  bcc?: string | string[];
}) → { draftId: string }

moist_list_drafts(options?: {
  maxResults?: number;
  pageToken?: string;
}) → { drafts: DraftSummary[], nextPageToken?: string }

moist_delete_draft(draftId: string) → { success: boolean }

moist_send_draft(draftId: string) → { messageId: string, threadId: string }
```

---

## Types

```typescript
interface MessageSummary {
  id: string;
  threadId: string;
  snippet: string;
  from: string;
  to: string[];
  subject: string;
  date: string;           // ISO 8601
  labelIds: string[];
  hasAttachments: boolean;
}

interface Message extends MessageSummary {
  body: {
    text?: string;        // Plain text version
    html?: string;        // HTML version
  };
  cc?: string[];
  bcc?: string[];
  attachments?: Attachment[];
  headers: Record<string, string>;
}

interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
}

interface ThreadSummary {
  id: string;
  snippet: string;
  messageCount: number;
  participants: string[];
  subject: string;
  lastMessageDate: string;
}

interface Thread extends ThreadSummary {
  messages: Message[];
}

interface Label {
  id: string;
  name: string;
  type: 'system' | 'user';
  messageCount?: number;
  color?: { background: string; text: string };
}

interface DraftSummary {
  id: string;
  to: string[];
  subject: string;
  snippet: string;
  updatedAt: string;
}
```

---

## Authentication

### Setup

Moist uses OAuth 2.0 with Gmail API scopes. Users must create a Google Cloud project with Gmail API enabled.

```bash
# Environment variables
MOIST_CLIENT_ID=your_client_id
MOIST_CLIENT_SECRET=your_client_secret
MOIST_REDIRECT_URI=http://localhost:3000/oauth/callback

# Or path to credentials file
MOIST_CREDENTIALS_PATH=~/.moist/credentials.json
```

### First Run

On first connection, Moist opens a browser for OAuth consent. Tokens are stored locally:

```
~/.moist/
  tokens.json          # Access + refresh tokens (encrypted)
  credentials.json     # Client ID + secret (optional)
```

### Token Refresh

Automatic. Access tokens are refreshed before expiry. If refresh fails, the `moist_auth_status` tool reports the error.

```typescript
moist_auth_status() → {
  authenticated: boolean;
  email?: string;
  scopes?: string[];
  expiresAt?: string;
  error?: string;
}

moist_auth_logout() → { success: boolean }
// Clears stored tokens
```

### Scopes

Moist requests the minimum scopes needed:

```
gmail.readonly      - Read messages and threads
gmail.send          - Send messages
gmail.modify        - Modify labels, trash/untrash
gmail.compose       - Create drafts
```

Users can restrict scopes at setup if they only need read access.

---

## Configuration

### MCP Server Config

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

### Rate Limiting

Gmail API has quotas. Moist handles this internally:

- Per-user rate limit: 250 quota units / second
- Daily limit: 1,000,000,000 quota units

Moist tracks usage and returns clear errors when limits are hit:

```typescript
{
  error: "rate_limited",
  message: "Gmail API quota exceeded. Retry after 60 seconds.",
  retryAfter: 60
}
```

---

## Error Handling

All tools return consistent error shapes:

```typescript
// Success
{ messages: [...], nextPageToken: "..." }

// Error
{ 
  error: "not_found" | "rate_limited" | "auth_failed" | "invalid_request" | "api_error",
  message: "Human-readable description",
  details?: any
}
```

Error codes:

| Code | Meaning |
|------|---------|
| `not_found` | Message/thread/label doesn't exist |
| `rate_limited` | API quota exceeded |
| `auth_failed` | Token expired or revoked |
| `invalid_request` | Bad parameters |
| `api_error` | Gmail API error (details included) |

---

## Search Syntax

Moist passes queries directly to Gmail's search API. Full syntax supported:

```
from:someone@example.com
to:me
subject:invoice
has:attachment
filename:pdf
after:2024/01/01
before:2024/12/31
is:unread
is:starred
label:work
-label:spam
"exact phrase"
```

Queries can be combined:

```
from:bank@example.com has:attachment after:2024/01/01 subject:statement
```

---

## Implementation Notes

### Stack

- TypeScript
- `@modelcontextprotocol/sdk` for MCP server
- `googleapis` for Gmail API client
- `keytar` for secure token storage (optional, falls back to encrypted file)

### File Structure

```
moist/
├── src/
│   ├── index.ts           # MCP server entry
│   ├── tools/
│   │   ├── messages.ts
│   │   ├── threads.ts
│   │   ├── labels.ts
│   │   ├── drafts.ts
│   │   └── search.ts
│   ├── auth/
│   │   ├── oauth.ts
│   │   ├── tokens.ts
│   │   └── storage.ts
│   ├── client/
│   │   └── gmail.ts       # Wrapped Gmail API client
│   └── types.ts
├── package.json
├── tsconfig.json
└── README.md
```

### Testing

- Unit tests for type transformations
- Integration tests against Gmail API (requires test account)
- Mock MCP server for tool interface testing

---

## MVP Scope

### Phase 1: Read-Only

- [ ] OAuth flow with token storage
- [ ] `moist_auth_status`
- [ ] `moist_list_messages`
- [ ] `moist_get_message`
- [ ] `moist_get_thread`
- [ ] `moist_list_labels`
- [ ] `moist_search`
- [ ] Basic rate limiting
- [ ] Error handling

### Phase 2: Write Operations

- [ ] `moist_send_message`
- [ ] `moist_trash_message`
- [ ] `moist_modify_labels`
- [ ] `moist_create_draft`
- [ ] `moist_send_draft`

### Phase 3: Polish

- [ ] Attachment download support
- [ ] Batch operations
- [ ] Webhook support for push notifications (optional)
- [ ] Comprehensive docs

---

## Non-Goals

- **No AI logic** — Moist is plumbing, not intelligence
- **No message parsing** — Return raw content, let consumers parse
- **No caching** — Keep it stateless, let consumers cache if needed
- **No multi-account** — One account per instance (run multiple instances if needed)

---

## License

MIT

---

## References

- [Gmail API Documentation](https://developers.google.com/gmail/api)
- [MCP Specification](https://modelcontextprotocol.io)
- [Going Postal](https://en.wikipedia.org/wiki/Going_Postal) — The source of the name
