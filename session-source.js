/**
 * A Source the session cache indexes.
 *
 * The cache and session-transition detection used to be bound to one projects
 * directory and one Account — the Local Host's. Remote Hosts (VIN-150) need
 * several sources indexed side by side: the Local Host's active Account plus
 * each Remote Host's active Account mirror. A Source makes that binding an
 * explicit value:
 *
 *   - `projectsDir` — the on-disk directory whose folders this source indexes.
 *   - `accountId`   — the Account the sessions belong to (session_cache scope).
 *   - `qualifyProjectPath(rawPath)` — how a raw project path (the cwd read from a
 *       .jsonl) becomes a Project key: identity for the Local Host, and
 *       `ssh://<hostId>/<path>` for a Remote Host (ADR 0016), so the same path on
 *       two Hosts stays two Projects.
 *   - `qualifyFolder(folder)` — how an on-disk folder name becomes the cache's
 *       folder identifier. Identity locally, namespaced by host remotely, so two
 *       sources with identically named folders never collide in cache_meta or the
 *       search index (neither of which is Account-scoped on its own).
 *
 * The on-disk folder name is kept raw for filesystem access; only the identifier
 * written to the database is qualified.
 */
function createSource({ id, projectsDir, accountId, hostId = null } = {}) {
  const resolvedHostId = hostId || null;
  const resolvedAccountId = accountId || 'default';
  return {
    id: id || resolvedAccountId,
    projectsDir,
    accountId: resolvedAccountId,
    hostId: resolvedHostId,
    qualifyProjectPath(rawPath) {
      if (!rawPath || !resolvedHostId) return rawPath;
      return `ssh://${resolvedHostId}${rawPath.startsWith('/') ? '' : '/'}${rawPath}`;
    },
    qualifyFolder(folder) {
      return resolvedHostId ? `ssh://${resolvedHostId}/${folder}` : folder;
    },
    // A folder identifier belongs to this source. Lets eviction find a remote
    // source's folders in the Account-agnostic cache_meta / search tables.
    ownsFolder(folderKey) {
      return resolvedHostId ? String(folderKey).startsWith(`ssh://${resolvedHostId}/`) : true;
    },
  };
}

module.exports = { createSource };
