// The Session State: what a row's State Dot renders, and the only thing it renders.
// One value at a time out of four — `sleeping`, `needsInput`, `working`, `done` — so the
// precedence between contradictory signals is arbitrated here, in one readable order,
// instead of in a cascade of `:not()` selectors and `!important` in the stylesheet.
// Pure — no Vue, no DOM, no I/O.

// Precedence, highest first. `working` wins over everything: a Session that is producing
// something is not waiting for anyone, and a stale `done` on a Session that resumed work is
// the one lie the State Dot must never tell (ADR 0015).
export const SESSION_STATES = ['working', 'needsInput', 'done', 'sleeping'];

// A Plain Terminal and a Run Terminal have no Session State: no `.jsonl`, no turn, nothing
// that could want something from the human.
const STATELESS_TYPES = new Set(['terminal', 'run-terminal']);

// The same question the list asks to pick a row component: neither kind of internal terminal
// has a `.jsonl` behind it, so neither carries a Session State.
export function isTerminalLike(session) {
  return STATELESS_TYPES.has(session?.type);
}

/**
 * @param {object} signals
 * @param {string} [signals.type]        Session type; a terminal-like row has no state.
 * @param {boolean} [signals.done]       The declared, persisted `done` flag (ADR 0015).
 * @param {boolean} [signals.isBusy]     The CLI busy signal (OSC 0 spinner / OSC 9;4).
 * @param {boolean} [signals.isAttention] The needs-input signal: the OSC 9 approval /
 *   permission / plan-mode notification, or a turn that just ended off-focus.
 * @returns {'working'|'needsInput'|'done'|'sleeping'|null}
 */
export function sessionStateFor({ type, done, isBusy, isAttention } = {}) {
  if (STATELESS_TYPES.has(type)) return null;
  if (isBusy) return 'working';
  if (isAttention) return 'needsInput';
  if (done) return 'done';
  return 'sleeping';
}

// The State Dot's single class. One class per state, so the stylesheet arbitrates nothing.
const DOT_CLASSES = {
  working: 'session-state-dot--working',
  needsInput: 'session-state-dot--needs-input',
  done: 'session-state-dot--done',
  sleeping: 'session-state-dot--sleeping',
};

export function stateDotClass(state) {
  return DOT_CLASSES[state] || null;
}
