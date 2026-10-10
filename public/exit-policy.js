// exit-policy.js — when a session's PTY exits, does its tab survive a crash?
//
// Loaded as a plain browser global before app.js, and required by the node:test runner (which has no
// `window`) through the guarded module.exports at the foot — the same dual shape as
// terminal-themes.js — so the policy below is tested away from the renderer and the DOM.

// A crashed tab is either kept (so the user can read the error and relaunch in place) or forgotten
// (destroyed, then respawned by the next click on Run, ADR 0006). keepTabOnCrash decides the first;
// forgetOnExit decides whether an exit — crash or clean — drops the row.
const EXIT_POLICIES = {
  'terminal': { keepTabOnCrash: false, forgetOnExit: true },
  'run-terminal': { keepTabOnCrash: false, forgetOnExit: false },
  // Claude sessions: only a no-op pending one (never wrote a .jsonl) is forgotten.
  default: { keepTabOnCrash: true, forgetOnExit: 'pendingOnly' },
};

// The shell reports an interrupt as 128+signal; that is deliberate, not a crash.
const INTERRUPT_EXIT_CODES = new Set([130, 143]);
function isCrashExit(exitCode, exitInfo) {
  if (exitCode === 0 || exitInfo?.stoppedByUser) return false;
  return !exitInfo?.signal && !INTERRUPT_EXIT_CODES.has(exitCode);
}

// A Plain Terminal on a Remote Host (VIN-156) is the one 'terminal' that must keep its tab on a
// crash. Its PTY is an ssh client, so a failed launch (unreachable Host, a bad Project path) exits
// non-zero, and the Host's diagnostic is written by main.js *asynchronously* (the probe resolves
// seconds later). The local 'terminal' policy forgets the tab the instant the process exits, so that
// late diagnostic would land on a session that no longer exists and be dropped — taking even the raw
// ssh error with it. Keeping the tab on a crash (like a Claude Session) holds the buffer open long
// enough for both the raw error and the Host diagnostic to show. Whether a session IS a remote Plain
// Terminal is decided in the main process and handed in (ADR 0017: the renderer does not re-derive it
// from the ssh:// Project key), never read from the key here.
function keepTabOnCrash(type, remotePlainTerminal) {
  const policy = EXIT_POLICIES[type] || EXIT_POLICIES.default;
  return policy.keepTabOnCrash || !!remotePlainTerminal;
}

if (typeof window !== 'undefined') {
  window.EXIT_POLICIES = EXIT_POLICIES;
}

// Consumed by the node:test runner, which has no `window`.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { EXIT_POLICIES, INTERRUPT_EXIT_CODES, isCrashExit, keepTabOnCrash };
}
