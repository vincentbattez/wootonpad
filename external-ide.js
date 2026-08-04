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

// What to show the user out of a failed launch. Running through a login shell
// means stderr opens with whatever the rc files print — mise, nvm, ssh-agent —
// so the command's own error is the last line, not the first.
function launchErrorMessage(stderr, exitCode) {
  const lastLine = String(stderr || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .pop();
  if (!lastLine) return exitCode ? `exited with code ${exitCode}` : 'launch failed';
  return lastLine.length > 300 ? '…' + lastLine.slice(-300) : lastLine;
}

module.exports = { resolveIdeLaunch, launchErrorMessage };
