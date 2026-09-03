// Telling a dead battery from a broken engine.
//
// When the 5-hour Claude window closes, the runner throws — `claude-code
// exited with code 1: You've hit your session limit · resets 12:10am (UTC)`.
// Left alone, that reads like any other crash: the leaf is retried, recorded
// `failed`, the round re-plans and the next leaf dies the same way, and every
// issue drops back to `Todo` as though the work had failed. It had not started.
//
// An interruption is not a reasoning failure. It is never retried within the
// run, never handed to a fallback agent, and never resets an issue's state:
// it short-circuits to the entry point, which records when to come back.

/** The platform stopped the run; nothing about the work itself is known. */
export class InterruptedError extends Error {
  readonly reason: string;
  /** When the platform said it would let us back in, if it said. */
  readonly resumeAfter: Date | null;

  constructor(
    reason: string,
    resumeAfter: Date | null = null,
    options?: { cause?: unknown },
  ) {
    super(`interrupted: ${reason}`, options);
    this.name = "InterruptedError";
    this.reason = reason;
    this.resumeAfter = resumeAfter;
  }
}

export const isInterruption = (cause: unknown): cause is InterruptedError =>
  cause instanceof InterruptedError;

const QUOTA_PATTERNS = [
  /hit your (?:session|usage|weekly|daily) limit/i,
  /usage limit (?:reached|exceeded)/i,
  /rate[ -]?limit(?:ed| exceeded| reached)/i,
  /out of (?:extra )?usage/i,
];

/** The line that says the quota closed, or null when `text` says nothing of the sort. */
export function quotaLine(text: string): string | null {
  for (const line of text.split("\n")) {
    if (QUOTA_PATTERNS.some((pattern) => pattern.test(line))) return line.trim();
  }
  return null;
}

/**
 * `resets 12:10am (UTC)` → the next such wall-clock time after `now`. Only the
 * shape Claude Code prints today is parsed; anything else is null and the
 * caller falls back to a fixed pause.
 */
export function parseResetTime(text: string, now: Date): Date | null {
  const match = text.match(/resets\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*\((UTC)\)/i);
  if (!match) return null;

  let hours = Number(match[1]) % 12;
  if (match[3]!.toLowerCase() === "pm") hours += 12;
  const minutes = Number(match[2] ?? "0");

  const at = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hours, minutes),
  );
  if (at <= now) at.setUTCDate(at.getUTCDate() + 1);
  return at;
}

const errorText = (cause: unknown): string =>
  cause instanceof Error
    ? [cause.message, errorText(cause.cause)].join("\n")
    : cause === undefined || cause === null
      ? ""
      : String(cause);

/**
 * Translate a thrown error into an interruption when the quota is what threw
 * it. Anything else passes through unchanged — this is the *only* place a
 * crash is allowed to become an interruption, so the heuristics stay in one
 * spot.
 */
export function asInterruption(
  cause: unknown,
  now: Date = new Date(),
): InterruptedError | null {
  if (isInterruption(cause)) return cause;

  const line = quotaLine(errorText(cause));
  if (line === null) return null;

  return new InterruptedError(line, parseResetTime(line, now), { cause });
}

/**
 * Duration sensor. A leaf that exhausts 100 iterations takes tens of minutes;
 * one cut down by the quota returns in seconds with nothing to show. The
 * runner usually throws instead, but not always — an agent that starts and is
 * refused each turn just runs out of iterations.
 */
export function looksLikeQuotaWall(options: {
  outcome: string;
  durationMs: number;
  committed: boolean;
  fastFailMs: number;
}): boolean {
  return (
    options.outcome === "exhausted" &&
    !options.committed &&
    options.durationMs < options.fastFailMs
  );
}
