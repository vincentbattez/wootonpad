// The Session State: the single thing the State Dot renders, one value of four at a time.
// Pure — no Vue, no DOM, no I/O — so the precedence is arbitrated here, in one testable place,
// and never again in a stylesheet's cascade of `:not()` and `!important`.
//
// Three of the four states are read off signals the app already carries; the fourth, `done`,
// is declared, never inferred (ADR 0015). `isRunning` (a live PTY) is deliberately not a
// signal: a process being alive is an implementation detail — the Stop button carries it —
// not work in progress. It is accepted in the argument bag and ignored so callers need not
// strip it.
//
// The name `sleeping` is the domain word ("this Session asks nothing of anyone"); it is not
// the backend's low-level `idle` (OSC 0: "the CLI shows no spinner"). Two words, two things.

/**
 * @param {{ type?: string, done?: boolean, isBusy?: boolean, isAttention?: boolean }} signals
 * @returns {'working'|'needsInput'|'done'|'sleeping'|null}
 *   `null` for a Plain Terminal or a Run Terminal — they have no `.jsonl`, so no Session State.
 */
export function sessionStateFor({ type, done = false, isBusy = false, isAttention = false } = {}) {
  if (type === 'terminal' || type === 'run-terminal') return null;
  if (isBusy) return 'working';
  if (isAttention) return 'needsInput';
  if (done) return 'done';
  return 'sleeping';
}
