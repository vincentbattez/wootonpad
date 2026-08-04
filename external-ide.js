// Single place where the decision to launch an External IDE is made.
// Pure Node — no fs, no Electron: the caller injects the resolved shell and
// whether the Project folder still exists (see docs/adr/0003).

const { isWslShell, windowsToWslPath, shellArgs } = require('./shell-profiles');

const PLACEHOLDER = '{path}';

// Own basename: a Windows shell path must still be recognised when the resolver
// is exercised on a POSIX host.
function shellName(shellPath) {
  return shellPath.split(/[\\/]/).pop().toLowerCase();
}

function posixQuote(value) {
  return "'" + value.split("'").join("'\\''") + "'";
}

// Quoting is the builder's job, never the user's — so the style follows the shell.
function quoteForShell(shellPath, value) {
  if (isWslShell(shellPath)) return posixQuote(value);
  const base = shellName(shellPath);
  if (base.includes('powershell') || base.includes('pwsh')) {
    return "'" + value.split("'").join("''") + "'";
  }
  if (base === 'cmd.exe' || base === 'cmd') {
    return '"' + value.split('"').join('""') + '"';
  }
  return posixQuote(value);
}

function resolveIdeLaunch(settings = {}, env = {}) {
  const template = typeof settings.externalIdeCommand === 'string' ? settings.externalIdeCommand.trim() : '';
  if (!template) return { ok: false, reason: 'not-configured' };
  if (!env.folderExists) return { ok: false, reason: 'missing-folder' };

  const shellPath = env.shellPath || '/bin/sh';
  const projectPath = settings.projectPath || '';
  const target = isWslShell(shellPath) ? windowsToWslPath(projectPath) : projectPath;
  const quoted = quoteForShell(shellPath, target);

  // split/join, not replace: a path may contain $& and friends.
  const commandLine = template.includes(PLACEHOLDER)
    ? template.split(PLACEHOLDER).join(quoted)
    : template + ' ' + quoted;

  return { ok: true, shell: shellPath, args: shellArgs(shellPath, commandLine, env.shellExtraArgs) };
}

module.exports = { resolveIdeLaunch };
