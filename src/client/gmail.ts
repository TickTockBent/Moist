import { google, type gmail_v1 } from "googleapis";
import { getOAuth2Client } from "../auth/oauth.js";
import { withRateLimit, RateLimitError } from "./rate-limiter.js";
import type {
  Message,
  MessageSummary,
  ThreadSummary,
  Thread,
  Label,
  DraftSummary,
  Attachment,
  MoistError,
} from "../types.js";

function getGmailClient(): gmail_v1.Gmail {
  return google.gmail({ version: "v1", auth: getOAuth2Client() });
}

// Helper to extract header value from Gmail message
function getHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string,
): string {
  if (!headers) return "";
  const header = headers.find(
    (h) => h.name?.toLowerCase() === name.toLowerCase(),
  );
  return header?.value || "";
}

// Helper to parse address lists like "a@b.com, c@d.com"
function parseAddressList(value: string): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Helper to extract body from MIME parts
function extractBody(payload: gmail_v1.Schema$MessagePart | undefined): {
  text?: string;
  html?: string;
} {
  if (!payload) return {};

  const result: { text?: string; html?: string } = {};

  // Single part message
  if (payload.body?.data) {
    const decoded = Buffer.from(payload.body.data, "base64url").toString(
      "utf-8",
    );
    if (payload.mimeType === "text/plain") {
      result.text = decoded;
    } else if (payload.mimeType === "text/html") {
      result.html = decoded;
    }
    return result;
  }

  // Multipart message - recurse into parts
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data && !result.text) {
        result.text = Buffer.from(part.body.data, "base64url").toString(
          "utf-8",
        );
      } else if (
        part.mimeType === "text/html" &&
        part.body?.data &&
        !result.html
      ) {
        result.html = Buffer.from(part.body.data, "base64url").toString(
          "utf-8",
        );
      } else if (
        part.mimeType?.startsWith("multipart/") &&
        part.parts
      ) {
        const nested = extractBody(part);
        if (nested.text && !result.text) result.text = nested.text;
        if (nested.html && !result.html) result.html = nested.html;
      }
    }
  }

  return result;
}

// Helper to extract attachments metadata from MIME parts
function extractAttachments(
  payload: gmail_v1.Schema$MessagePart | undefined,
): Attachment[] {
  const attachments: Attachment[] = [];
  if (!payload?.parts) return attachments;

  for (const part of payload.parts) {
    if (part.filename && part.filename.length > 0 && part.body?.attachmentId) {
      attachments.push({
        id: part.body.attachmentId,
        filename: part.filename,
        mimeType: part.mimeType || "application/octet-stream",
        size: part.body.size || 0,
      });
    }
    // Recurse into nested multipart
    if (part.parts) {
      attachments.push(
        ...extractAttachments(part),
      );
    }
  }

  return attachments;
}

// Convert raw Gmail message to our MessageSummary
function toMessageSummary(
  msg: gmail_v1.Schema$Message,
): MessageSummary {
  const headers = msg.payload?.headers;
  const attachments = extractAttachments(msg.payload);

  return {
    id: msg.id || "",
    threadId: msg.threadId || "",
    snippet: msg.snippet || "",
    from: getHeader(headers, "From"),
    to: parseAddressList(getHeader(headers, "To")),
    subject: getHeader(headers, "Subject"),
    date: getHeader(headers, "Date")
      ? new Date(getHeader(headers, "Date")).toISOString()
      : new Date(parseInt(msg.internalDate || "0", 10)).toISOString(),
    labelIds: msg.labelIds || [],
    hasAttachments: attachments.length > 0,
  };
}

// Convert raw Gmail message to our full Message
function toMessage(msg: gmail_v1.Schema$Message): Message {
  const summary = toMessageSummary(msg);
  const headers = msg.payload?.headers || [];
  const body = extractBody(msg.payload);
  const attachments = extractAttachments(msg.payload);

  const headerMap: Record<string, string> = {};
  for (const h of headers) {
    if (h.name && h.value) {
      headerMap[h.name] = h.value;
    }
  }

  return {
    ...summary,
    body,
    cc: parseAddressList(getHeader(headers, "Cc")),
    bcc: parseAddressList(getHeader(headers, "Bcc")),
    attachments: attachments.length > 0 ? attachments : undefined,
    headers: headerMap,
  };
}

// Build a raw MIME email message for sending
function buildRawMessage(options: {
  to: string | string[];
  subject: string;
  body: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  references?: string;
  inReplyTo?: string;
}): string {
  const toList = Array.isArray(options.to) ? options.to.join(", ") : options.to;
  const lines: string[] = [
    `To: ${toList}`,
    `Subject: ${options.subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
  ];

  if (options.cc) {
    const ccList = Array.isArray(options.cc)
      ? options.cc.join(", ")
      : options.cc;
    lines.push(`Cc: ${ccList}`);
  }

  if (options.bcc) {
    const bccList = Array.isArray(options.bcc)
      ? options.bcc.join(", ")
      : options.bcc;
    lines.push(`Bcc: ${bccList}`);
  }

  if (options.inReplyTo) {
    lines.push(`In-Reply-To: ${options.inReplyTo}`);
  }

  if (options.references) {
    lines.push(`References: ${options.references}`);
  }

  lines.push("", options.body);

  return Buffer.from(lines.join("\r\n"))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Creates a MoistError from a caught exception
export function toMoistError(err: unknown): MoistError {
  if (err instanceof RateLimitError) {
    return {
      error: "rate_limited",
      message: err.message,
      retryAfter: err.retryAfter,
    };
  }

  if (err instanceof Error) {
    const message = err.message;

    if (message.includes("401") || message.includes("invalid_grant")) {
      return {
        error: "auth_failed",
        message: "Authentication failed. Please re-authenticate.",
      };
    }
    if (message.includes("404") || message.includes("notFound")) {
      return {
        error: "not_found",
        message: "Resource not found.",
      };
    }
    if (message.includes("429") || message.includes("rateLimitExceeded")) {
      return {
        error: "rate_limited",
        message: "Gmail API rate limit exceeded.",
        retryAfter: 60,
      };
    }
    if (message.includes("400") || message.includes("invalidArgument")) {
      return {
        error: "invalid_request",
        message: message,
      };
    }

    return {
      error: "api_error",
      message: message,
      details: err,
    };
  }

  return {
    error: "api_error",
    message: "An unknown error occurred",
    details: err,
  };
}

// ==================== Messages ====================

export async function listMessages(options?: {
  query?: string;
  maxResults?: number;
  pageToken?: string;
  labelIds?: string[];
}): Promise<{ messages: MessageSummary[]; nextPageToken?: string }> {
  const gmail = getGmailClient();

  const listResult = await withRateLimit("messages.list", () =>
    gmail.users.messages.list({
      userId: "me",
      q: options?.query,
      maxResults: Math.min(options?.maxResults || 20, 100),
      pageToken: options?.pageToken,
      labelIds: options?.labelIds,
    }),
  );

  const messageIds = listResult.data.messages || [];
  if (messageIds.length === 0) {
    return { messages: [], nextPageToken: undefined };
  }

  // Fetch full details for each message (needed for headers)
  const messages: MessageSummary[] = [];
  for (const msg of messageIds) {
    if (!msg.id) continue;
    const detail = await withRateLimit("messages.get", () =>
      gmail.users.messages.get({
        userId: "me",
        id: msg.id!,
        format: "metadata",
        metadataHeaders: ["From", "To", "Subject", "Date"],
      }),
    );
    messages.push(toMessageSummary(detail.data));
  }

  return {
    messages,
    nextPageToken: listResult.data.nextPageToken || undefined,
  };
}

export async function getMessage(messageId: string): Promise<Message> {
  const gmail = getGmailClient();
  const result = await withRateLimit("messages.get", () =>
    gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "full",
    }),
  );
  return toMessage(result.data);
}

export async function sendMessage(options: {
  to: string | string[];
  subject: string;
  body: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  threadId?: string;
}): Promise<{ messageId: string; threadId: string }> {
  const gmail = getGmailClient();

  // If replying, fetch original message headers for In-Reply-To/References
  let inReplyTo: string | undefined;
  let references: string | undefined;

  if (options.replyTo) {
    try {
      const original = await withRateLimit("messages.get", () =>
        gmail.users.messages.get({
          userId: "me",
          id: options.replyTo!,
          format: "metadata",
          metadataHeaders: ["Message-ID", "References"],
        }),
      );
      inReplyTo = getHeader(original.data.payload?.headers, "Message-ID");
      const origReferences = getHeader(
        original.data.payload?.headers,
        "References",
      );
      references = origReferences
        ? `${origReferences} ${inReplyTo}`
        : inReplyTo;
    } catch {
      // If we can't get original headers, send without them
    }
  }

  const raw = buildRawMessage({
    ...options,
    inReplyTo,
    references,
  });

  const result = await withRateLimit("messages.send", () =>
    gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw,
        threadId: options.threadId,
      },
    }),
  );

  return {
    messageId: result.data.id || "",
    threadId: result.data.threadId || "",
  };
}

export async function trashMessage(
  messageId: string,
): Promise<{ success: boolean }> {
  const gmail = getGmailClient();
  await withRateLimit("messages.trash", () =>
    gmail.users.messages.trash({
      userId: "me",
      id: messageId,
    }),
  );
  return { success: true };
}

export async function deleteMessage(
  messageId: string,
): Promise<{ success: boolean }> {
  const gmail = getGmailClient();
  await withRateLimit("messages.delete", () =>
    gmail.users.messages.delete({
      userId: "me",
      id: messageId,
    }),
  );
  return { success: true };
}

export async function modifyLabels(
  messageId: string,
  options: { addLabelIds?: string[]; removeLabelIds?: string[] },
): Promise<{ success: boolean }> {
  const gmail = getGmailClient();
  await withRateLimit("messages.modify", () =>
    gmail.users.messages.modify({
      userId: "me",
      id: messageId,
      requestBody: {
        addLabelIds: options.addLabelIds,
        removeLabelIds: options.removeLabelIds,
      },
    }),
  );
  return { success: true };
}

// ==================== Threads ====================

export async function getThread(threadId: string): Promise<Thread> {
  const gmail = getGmailClient();
  const result = await withRateLimit("threads.get", () =>
    gmail.users.threads.get({
      userId: "me",
      id: threadId,
      format: "full",
    }),
  );

  const rawMessages = result.data.messages || [];
  const messages = rawMessages.map(toMessage);
  const participants = new Set<string>();

  for (const msg of messages) {
    if (msg.from) participants.add(msg.from);
    for (const to of msg.to) participants.add(to);
  }

  return {
    id: result.data.id || "",
    snippet: result.data.snippet || rawMessages[0]?.snippet || "",
    messageCount: messages.length,
    participants: Array.from(participants),
    subject: messages.length > 0 ? messages[0].subject : "",
    lastMessageDate:
      messages.length > 0 ? messages[messages.length - 1].date : "",
    messages,
  };
}

export async function listThreads(options?: {
  query?: string;
  maxResults?: number;
  pageToken?: string;
  labelIds?: string[];
}): Promise<{ threads: ThreadSummary[]; nextPageToken?: string }> {
  const gmail = getGmailClient();

  const listResult = await withRateLimit("threads.list", () =>
    gmail.users.threads.list({
      userId: "me",
      q: options?.query,
      maxResults: Math.min(options?.maxResults || 20, 100),
      pageToken: options?.pageToken,
      labelIds: options?.labelIds,
    }),
  );

  const threadIds = listResult.data.threads || [];
  if (threadIds.length === 0) {
    return { threads: [], nextPageToken: undefined };
  }

  // Fetch each thread for summary info
  const threads: ThreadSummary[] = [];
  for (const t of threadIds) {
    if (!t.id) continue;
    const detail = await withRateLimit("threads.get", () =>
      gmail.users.threads.get({
        userId: "me",
        id: t.id!,
        format: "metadata",
        metadataHeaders: ["From", "To", "Subject", "Date"],
      }),
    );

    const rawMsgs = detail.data.messages || [];
    const participants = new Set<string>();
    for (const msg of rawMsgs) {
      const from = getHeader(msg.payload?.headers, "From");
      const to = getHeader(msg.payload?.headers, "To");
      if (from) participants.add(from);
      for (const addr of parseAddressList(to)) participants.add(addr);
    }

    const firstMsg = rawMsgs[0];
    const lastMsg = rawMsgs[rawMsgs.length - 1];

    threads.push({
      id: detail.data.id || "",
      snippet:
        detail.data.snippet || t.snippet || "",
      messageCount: rawMsgs.length,
      participants: Array.from(participants),
      subject: firstMsg
        ? getHeader(firstMsg.payload?.headers, "Subject")
        : "",
      lastMessageDate: lastMsg
        ? new Date(
            parseInt(lastMsg.internalDate || "0", 10),
          ).toISOString()
        : "",
    });
  }

  return {
    threads,
    nextPageToken: listResult.data.nextPageToken || undefined,
  };
}

export async function trashThread(
  threadId: string,
): Promise<{ success: boolean }> {
  const gmail = getGmailClient();
  await withRateLimit("threads.trash", () =>
    gmail.users.threads.trash({
      userId: "me",
      id: threadId,
    }),
  );
  return { success: true };
}

// ==================== Labels ====================

export async function listLabels(): Promise<Label[]> {
  const gmail = getGmailClient();
  const result = await withRateLimit("labels.list", () =>
    gmail.users.labels.list({ userId: "me" }),
  );

  return (result.data.labels || []).map((label) => ({
    id: label.id || "",
    name: label.name || "",
    type: label.type === "system" ? "system" : "user",
    messageCount: label.messagesTotal || undefined,
    color: label.color
      ? {
          background: label.color.backgroundColor || "",
          text: label.color.textColor || "",
        }
      : undefined,
  }));
}

// ==================== Drafts ====================

export async function createDraft(options: {
  to: string | string[];
  subject: string;
  body: string;
  cc?: string | string[];
  bcc?: string | string[];
}): Promise<{ draftId: string }> {
  const gmail = getGmailClient();
  const raw = buildRawMessage(options);

  const result = await withRateLimit("drafts.create", () =>
    gmail.users.drafts.create({
      userId: "me",
      requestBody: {
        message: { raw },
      },
    }),
  );

  return { draftId: result.data.id || "" };
}

export async function listDrafts(options?: {
  maxResults?: number;
  pageToken?: string;
}): Promise<{ drafts: DraftSummary[]; nextPageToken?: string }> {
  const gmail = getGmailClient();

  const listResult = await withRateLimit("drafts.list", () =>
    gmail.users.drafts.list({
      userId: "me",
      maxResults: Math.min(options?.maxResults || 20, 100),
      pageToken: options?.pageToken,
    }),
  );

  const draftIds = listResult.data.drafts || [];
  if (draftIds.length === 0) {
    return { drafts: [], nextPageToken: undefined };
  }

  // Fetch each draft for details
  const drafts: DraftSummary[] = [];
  for (const d of draftIds) {
    if (!d.id) continue;
    const detail = await withRateLimit("drafts.create", () =>
      gmail.users.drafts.get({
        userId: "me",
        id: d.id!,
        format: "metadata",
      }),
    );
    const msg = detail.data.message;
    const headers = msg?.payload?.headers;

    drafts.push({
      id: d.id,
      to: parseAddressList(getHeader(headers, "To")),
      subject: getHeader(headers, "Subject"),
      snippet: msg?.snippet || "",
      updatedAt: msg?.internalDate
        ? new Date(parseInt(msg.internalDate, 10)).toISOString()
        : "",
    });
  }

  return {
    drafts,
    nextPageToken: listResult.data.nextPageToken || undefined,
  };
}

export async function deleteDraft(
  draftId: string,
): Promise<{ success: boolean }> {
  const gmail = getGmailClient();
  await withRateLimit("drafts.delete", () =>
    gmail.users.drafts.delete({
      userId: "me",
      id: draftId,
    }),
  );
  return { success: true };
}

export async function sendDraft(
  draftId: string,
): Promise<{ messageId: string; threadId: string }> {
  const gmail = getGmailClient();
  const result = await withRateLimit("drafts.send", () =>
    gmail.users.drafts.send({
      userId: "me",
      requestBody: { id: draftId },
    }),
  );

  return {
    messageId: result.data.id || "",
    threadId: result.data.threadId || "",
  };
}
