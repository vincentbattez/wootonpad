// remote-removal.js — the pure core of removing a Remote Host or one of its Accounts (VIN-161).
//
// Removing a Remote Host, or one of its non-Default Accounts, forgets everything about it on the
// client and never touches the Host itself; Sessions still running there keep running. This module
// owns the two decisions worth testing away from Electron, the disk and the network: which persisted
// keys belong to a Host (so the adapter knows exactly what to forget), and the confirmation text that
// names how many Sessions are live and promises removal won't stop them (CONTEXT.md; the issue).
//
// Nothing here deletes anything or opens a socket. The adapter (remote-removal-ipc.js) applies the
// deletions over its injected db / fs / session-cache boundaries; the live count comes from
// remote-hosts-ipc over SSH. See docs/adr/0016.

// Every Remote Project key (ssh://<hostId>/<path>) and every cache folder key (ssh://<hostId>/<folder>)
// of a Host shares this one prefix — the single definition the Source qualifies keys with
// (session-source.js), so a removal selects exactly the Host's rows and never a sibling Host's.
function hostKeyPrefix(hostId) {
  return `ssh://${hostId}/`;
}

// A Remote Project key or a cache folder key belongs to this Host.
function keyBelongsToHost(key, hostId) {
  return typeof key === 'string' && key.startsWith(hostKeyPrefix(hostId));
}

// A per-Project settings key (stored under `project:<projectPath>`) belongs to this Host.
function settingKeyBelongsToHost(settingKey, hostId) {
  return typeof settingKey === 'string' && settingKey.startsWith('project:' + hostKeyPrefix(hostId));
}

// Split an array of project keys (or records carrying one) into what to keep and what the removal
// forgets. `keyOf` reads the key out of a record; it defaults to identity for a plain string array.
function partitionHostKeys(arr, hostId, keyOf = x => x) {
  const kept = [];
  const removed = [];
  for (const item of arr || []) {
    (keyBelongsToHost(keyOf(item), hostId) ? removed : kept).push(item);
  }
  return { kept, removed };
}

// The confirmation shown before a removal (AC3). It names how many Sessions are live on the Host and
// that removal will not stop them; when the Host is Unreachable (or not yet probed) the count is
// unknown and the message says so rather than claiming zero. `accountName` set means one Account is
// being removed rather than the whole Host — the Host keeps its other Accounts and their data.
//
// `reachable` (true | false | undefined=not-yet-probed) is required, not a defaulted option: the
// count's whole meaning hinges on it (a missing value would silently pick the "can't tell how many"
// branch), so a caller that forgets it must fail loudly rather than get a misleading message
// (CODING_STANDARDS.md). Passing `reachable: undefined` explicitly is the legitimate not-yet-probed
// state; omitting the key altogether is the programming error that throws.
//
// The count is the whole Host's live Session total, never one Account's: Sessions share the Host's
// single tmux socket and their names carry no Account (remote-launch.js), so an Account's Sessions
// can't be told apart. The Account-scope wording below is phrased so the number is never read as
// Account-specific (the Spec's "how many Sessions are live on that … Account").
function describeRemoval(opts) {
  if (!opts || !('reachable' in opts)) {
    throw new Error('describeRemoval: reachable is required (true | false | undefined=not-yet-probed)');
  }
  const { hostName, accountName = null, liveCount = null, reachable } = opts;
  const header = accountName
    ? `Remove the Account "${accountName}" from ${hostName}?`
    : `Remove the Remote Host "${hostName}"?`;

  let sessions;
  if (reachable !== true) {
    // Unreachable, or probed as not-yet-known: the live tmux list can't be read, so the count is
    // genuinely unknown — never reported as zero (AC3).
    sessions =
      `${hostName} is Unreachable, so WootonPad can't tell how many Sessions are running there. `
      + `Any that are will keep running — removing ${accountName ? 'the Account' : 'the Host'} never stops them.`;
  } else if (!liveCount) {
    sessions = `No Sessions are running on ${hostName}.`;
  } else {
    const n = liveCount === 1 ? '1 Session is' : `${liveCount} Sessions are`;
    sessions = accountName
      // Host-wide, not Account-scoped (see above): say so, so the user doesn't read the count as this
      // one Account's. Removal still never stops any of them (AC2).
      ? `${n} running on ${hostName} (across all its Accounts) — removing this Account will not stop any of them.`
      : `${n} still running on ${hostName} — they will not be stopped.`;
  }

  const forget = accountName
    ? `WootonPad will forget this Account's mirror and its cached Sessions on this client. `
      + `The Account on the Host is untouched.`
    : `WootonPad will forget everything it knows about this Host on this client — its Remote Projects, `
      + `cached Sessions, search entries and mirror. The Host itself is untouched, and re-adding it `
      + `later rediscovers everything, live Sessions included.`;

  return `${header}\n\n${sessions}\n\n${forget}`;
}

module.exports = {
  hostKeyPrefix, keyBelongsToHost, settingKeyBelongsToHost, partitionHostKeys, describeRemoval,
};
