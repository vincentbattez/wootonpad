// External IDE launching.
//
// The resolver half (KNOWN_IDES + resolveIdeLaunch) requires nothing beyond
// this file, so `node --test` can load it. The launcher half pulls in
// child_process and shell-profiles lazily — both stay outside the Electron ABI.

const KNOWN_IDES = [
  { id: 'vscode', label: 'Visual Studio Code', bundleId: 'com.microsoft.VSCode' },
  { id: 'cursor', label: 'Cursor', bundleId: 'com.todesktop.230313mzl4w4u92' },
  { id: 'zed', label: 'Zed', bundleId: 'dev.zed.Zed' },
  { id: 'webstorm', label: 'WebStorm', bundleId: 'com.jetbrains.WebStorm' },
  { id: 'intellij', label: 'IntelliJ IDEA', bundleId: 'com.jetbrains.intellij' },
  { id: 'pycharm', label: 'PyCharm', bundleId: 'com.jetbrains.pycharm' },
];

const NOT_CONFIGURED_MESSAGE = 'No external IDE is configured.';

function shellQuote(value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'";
}

// (settings, dir) → what to run. Pure: no spawn, no filesystem.
function resolveIdeLaunch(settings, dir, platform = process.platform) {
  const ideId = (settings || {}).externalIde;
  if (!ideId) return { ok: false, code: 'not-configured', message: NOT_CONFIGURED_MESSAGE };

  if (ideId === 'custom') {
    const command = String((settings || {}).externalIdeCommand || '').trim();
    if (!command) return { ok: false, code: 'not-configured', message: NOT_CONFIGURED_MESSAGE };
    return {
      ok: true,
      mode: 'custom',
      ideLabel: 'your custom command',
      command: command + ' ' + shellQuote(dir),
    };
  }

  const ide = KNOWN_IDES.find(i => i.id === ideId);
  if (!ide) return { ok: false, code: 'not-configured', message: NOT_CONFIGURED_MESSAGE };

  // `open -b` and bundle ids are macOS-only; elsewhere the Custom… option is the way.
  if (platform !== 'darwin') {
    return {
      ok: false,
      code: 'unsupported-platform',
      ideLabel: ide.label,
      message: `Opening ${ide.label} from the IDE list is only supported on macOS. Use the "Custom…" option and enter a command instead.`,
    };
  }

  return {
    ok: true,
    mode: 'bundle',
    ideLabel: ide.label,
    file: '/usr/bin/open',
    args: ['-b', ide.bundleId, dir],
  };
}

// Spawns detached and races the child's own exit against a deadline: a shim that
// fails (`command not found` → 127) or an absent bundle reports back in
// milliseconds, while an IDE that stays in the foreground is treated as success.
function spawnRace(file, args, ideLabel, timeoutMs) {
  const { spawn } = require('child_process');
  return new Promise(resolve => {
    let settled = false;
    let timer = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };

    let child;
    try {
      child = spawn(file, args, { detached: true, stdio: 'ignore' });
    } catch (err) {
      return finish({ ok: false, code: 'launch-failed', ideLabel, message: `Could not open ${ideLabel}: ${err.message}` });
    }

    timer = setTimeout(() => finish({ ok: true, ideLabel }), timeoutMs);
    child.on('error', err => finish({
      ok: false, code: 'launch-failed', ideLabel,
      message: `Could not open ${ideLabel}: ${err.message}`,
    }));
    child.on('exit', code => finish(code === 0
      ? { ok: true, ideLabel }
      : { ok: false, code: 'launch-failed', ideLabel, message: `Could not open ${ideLabel} — the launch command exited with code ${code}. Check that it is installed.` }));
    child.unref();
  });
}

async function launchIde(settings, dir, options = {}) {
  const platform = options.platform || process.platform;
  const resolved = resolveIdeLaunch(settings, dir, platform);
  if (!resolved.ok) return resolved;

  if (resolved.mode === 'bundle') {
    return spawnRace(resolved.file, resolved.args, resolved.ideLabel, 10000);
  }

  // Custom commands need the login shell: Electron launched from Finder does not
  // inherit the user's PATH.
  const { resolveShell, shellArgs } = require('./shell-profiles');
  const shell = resolveShell(options.shellProfileId || 'auto');
  return spawnRace(shell.path, shellArgs(shell.path, resolved.command), resolved.ideLabel, 2000);
}

module.exports = { KNOWN_IDES, resolveIdeLaunch, launchIde, shellQuote };
