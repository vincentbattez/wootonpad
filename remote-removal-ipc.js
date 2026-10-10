// remote-removal-ipc.js — the adapter that forgets a removed Remote Host or Account (VIN-161).
//
// remote-removal.js is the pure core (which keys belong to a Host, and the confirmation text). This
// is the thin side that applies the deletions: it evicts the Host's cached Sessions and search
// entries, drops its per-Project rows (Area filing, Git Snapshot cache, avatars) and per-Project
// settings, and deletes its rsync mirror from disk — so after removal nothing of that Host/Account
// remains on the client (AC1). It never shells out and never touches the Host: Sessions still
// running there keep running (AC2); the Host itself is only ever dropped from the local store.
//
// Every boundary (the session cache, the four db purges, the mirror root and fs) is injected, so
// main.js only wires it and the whole purge is exercised by node:test with fakes and no Electron,
// no sqlite and no disk (CODING_STANDARDS: keep new logic out of main.js). See docs/adr/0016.

const path = require('path');
const remoteRemoval = require('./remote-removal');
const remoteMirror = require('./remote-mirror');

// Build the adapter over its injected boundaries. `sessionCache` drops the live mirror Source (and
// with it the Host's cache + search); the four `delete*` functions are db.js's prefix/account
// purges; `mirrorRoot`/`fs` locate and delete the on-disk mirror. All are required — a forgotten
// wiring must fail loudly here, not silently leave a Host half-forgotten (CODING_STANDARDS).
function createRemoteRemoval({
  sessionCache,
  deleteRemoteCacheByFolderPrefix,
  deleteCachedSessionsByAccount,
  deleteProjectDataByPathPrefix,
  deleteSettingsByKeyPrefix,
  mirrorRoot,
  fs = require('fs'),
  log = console,
}) {
  for (const [name, dep] of Object.entries({
    sessionCache, deleteRemoteCacheByFolderPrefix, deleteCachedSessionsByAccount,
    deleteProjectDataByPathPrefix, deleteSettingsByKeyPrefix,
  })) {
    if (!dep) throw new Error(`createRemoteRemoval: ${name} is required`);
  }
  if (!mirrorRoot) throw new Error('createRemoteRemoval: mirrorRoot is required');

  function removeDir(dir) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (e) {
      log.warn && log.warn(`[remote-removal] could not delete mirror ${dir}: ${e.message}`);
    }
  }

  // Forget everything about a removed Remote Host on this client (AC1). The live mirror Source is
  // unregistered first (which evicts its cache + search), then a prefix purge catches any residue of
  // a non-active Account that was once mirrored, then the per-Project rows, per-Project settings and
  // the whole mirror directory (all Accounts) go. Nothing here reaches the Host.
  function purgeHost(hostId) {
    const prefix = remoteRemoval.hostKeyPrefix(hostId);        // ssh://<hostId>/
    try { sessionCache.unregisterSource(remoteMirror.sourceId(hostId)); } catch (e) {
      log.warn && log.warn(`[remote-removal] unregister source for ${hostId}: ${e.message}`);
    }
    deleteRemoteCacheByFolderPrefix(prefix);
    deleteProjectDataByPathPrefix(prefix);
    deleteSettingsByKeyPrefix('project:' + prefix);
    removeDir(path.join(mirrorRoot, hostId));
  }

  // Forget one non-Default Account: its cached Sessions (scoped by its cache accountId) and its
  // mirror directory. The Host's per-Project rows and settings are keyed by Project path, shared
  // across its Accounts, so they stay for the surviving Accounts. The Default Account is never
  // removed (CONTEXT.md), so a 'default' id is a no-op guard.
  function purgeAccount(hostId, accountId) {
    if (!accountId || accountId === 'default') return;
    deleteCachedSessionsByAccount(remoteMirror.cacheAccountId(hostId, accountId));
    removeDir(path.join(mirrorRoot, hostId, accountId));
  }

  return { purgeHost, purgeAccount };
}

module.exports = { createRemoteRemoval };
