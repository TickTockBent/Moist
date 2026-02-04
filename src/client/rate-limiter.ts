/**
 * Simple rate limiter for Gmail API quota management.
 * Gmail per-user rate limit: 250 quota units/second.
 */

const WINDOW_MS = 1000; // 1-second window
const MAX_UNITS_PER_WINDOW = 250;

// Quota costs for common Gmail operations
export const QUOTA_COSTS: Record<string, number> = {
  "messages.list": 5,
  "messages.get": 5,
  "messages.send": 100,
  "messages.trash": 5,
  "messages.delete": 10,
  "messages.modify": 5,
  "threads.list": 10,
  "threads.get": 10,
  "threads.trash": 5,
  "labels.list": 1,
  "drafts.list": 5,
  "drafts.create": 10,
  "drafts.delete": 10,
  "drafts.send": 100,
  "users.getProfile": 1,
};

interface UsageEntry {
  timestamp: number;
  units: number;
}

const usageLog: UsageEntry[] = [];

function pruneOldEntries(): void {
  const cutoff = Date.now() - WINDOW_MS;
  while (usageLog.length > 0 && usageLog[0].timestamp < cutoff) {
    usageLog.shift();
  }
}

function currentUsage(): number {
  pruneOldEntries();
  return usageLog.reduce((sum, entry) => sum + entry.units, 0);
}

export function checkQuota(operation: string): {
  allowed: boolean;
  retryAfter?: number;
} {
  const cost = QUOTA_COSTS[operation] || 5;
  const used = currentUsage();

  if (used + cost > MAX_UNITS_PER_WINDOW) {
    // Calculate when the oldest entry will expire
    const oldestTimestamp = usageLog.length > 0 ? usageLog[0].timestamp : Date.now();
    const retryAfter = Math.ceil((oldestTimestamp + WINDOW_MS - Date.now()) / 1000);
    return { allowed: false, retryAfter: Math.max(1, retryAfter) };
  }

  return { allowed: true };
}

export function recordUsage(operation: string): void {
  const cost = QUOTA_COSTS[operation] || 5;
  usageLog.push({ timestamp: Date.now(), units: cost });
}

export async function withRateLimit<T>(
  operation: string,
  fn: () => Promise<T>,
): Promise<T> {
  const check = checkQuota(operation);
  if (!check.allowed) {
    throw new RateLimitError(check.retryAfter || 1);
  }
  recordUsage(operation);
  return fn();
}

export class RateLimitError extends Error {
  public retryAfter: number;

  constructor(retryAfter: number) {
    super(`Gmail API quota exceeded. Retry after ${retryAfter} seconds.`);
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
}
