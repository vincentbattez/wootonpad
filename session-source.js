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
function createSource({ id, projectsDir, accountId, hostId = null }) {
  if (!id) throw new Error('createSource: id is required');
  if (!projectsDir) throw new Error('createSource: projectsDir is required');
  const resolvedHostId = hostId || null;
  const resolvedAccountId = accountId || 'default';
  return {
    id,
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
    // The inverse of qualifyFolder: a database folder key back to the on-disk folder name, so a
    // reader (the JSONL viewer) can find the file under this source's projectsDir. Identity
    // locally; a remote source strips exactly its own host prefix, and leaves a key that is not
    // its own untouched rather than mangling it.
    rawFolder(folderKey) {
      if (!resolvedHostId) return folderKey;
      const prefix = `ssh://${resolvedHostId}/`;
      const key = String(folderKey);
      return key.startsWith(prefix) ? key.slice(prefix.length) : folderKey;
    },
    // A folder identifier belongs to this source. Lets eviction find a source's
    // folders in the Account-agnostic cache_meta / search tables.
    //
    // Ownership is structural, not conventional: a remote source claims only its
    // own host-qualified keys, and a local source claims only bare (non-ssh://)
    // keys. So a local eviction can never swallow a remote source's rows even
    // though cache_meta and search are not Account-scoped — no reliance on the
    // two sources carrying distinct accountIds.
    ownsFolder(folderKey) {
      return resolvedHostId
        ? String(folderKey).startsWith(`ssh://${resolvedHostId}/`)
        : !String(folderKey).startsWith('ssh://');
    },
  };
}

/**
 * Build the Local Host's Source from the shared init context (VIN-152).
 *
 * One Source shape across the codebase: session-cache and session-transitions
 * both bind the local source through here rather than hand-rolling the same
 * `createSource({ ... })` literal, so the local binding can only drift in one
 * place.
 */
function localSourceFromCtx(ctx) {
  const id = ctx.accountId || 'default';
  return createSource({ id, projectsDir: ctx.PROJECTS_DIR, accountId: id });
}

module.exports = { createSource, localSourceFromCtx };
