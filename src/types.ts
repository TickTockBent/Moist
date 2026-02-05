export interface MessageSummary {
  id: string;
  threadId: string;
  snippet: string;
  from: string;
  to: string[];
  subject: string;
  date: string;
  labelIds: string[];
  hasAttachments: boolean;
}

export interface Message extends MessageSummary {
  body: {
    text?: string;
    html?: string;
  };
  cc?: string[];
  bcc?: string[];
  attachments?: Attachment[];
  headers: Record<string, string>;
}

export interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface ThreadSummary {
  id: string;
  snippet: string;
  messageCount: number;
  participants: string[];
  subject: string;
  lastMessageDate: string;
}

export interface Thread extends ThreadSummary {
  messages: Message[];
}

export interface Label {
  id: string;
  name: string;
  type: "system" | "user";
  messageCount?: number;
  color?: { background: string; text: string };
}

export interface DraftSummary {
  id: string;
  to: string[];
  subject: string;
  snippet: string;
  updatedAt: string;
}

export interface MoistError {
  error:
    | "not_found"
    | "rate_limited"
    | "auth_failed"
    | "invalid_request"
    | "api_error";
  message: string;
  details?: unknown;
  retryAfter?: number;
}

export interface AuthStatus {
  authenticated: boolean;
  email?: string;
  scopes?: string[];
  expiresAt?: string;
  error?: string;
}

export interface TokenData {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  token_type: string;
  scope: string;
}
