const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveIdeLaunch, launchErrorMessage } = require('../external-ide');

// The command line the shell is asked to run is always the last argument.
function commandLine(result) {
  return result.args[result.args.length - 1];
}

const ZSH = { shellPath: '/bin/zsh', folderExists: true };

test('no command configured yields not-configured', () => {
  assert.deepEqual(
    resolveIdeLaunch({ externalIdeCommand: '', projectPath: '/tmp/proj' }, ZSH),
    { ok: false, reason: 'not-configured' }
  );
  assert.deepEqual(
    resolveIdeLaunch({ projectPath: '/tmp/proj' }, ZSH),
    { ok: false, reason: 'not-configured' }
  );
  assert.deepEqual(
    resolveIdeLaunch({ externalIdeCommand: '   ', projectPath: '/tmp/proj' }, ZSH),
    { ok: false, reason: 'not-configured' }
  );
});

test('an empty command wins over a missing folder', () => {
  const out = resolveIdeLaunch({ externalIdeCommand: '', projectPath: '/gone' }, { shellPath: '/bin/zsh', folderExists: false });
  assert.equal(out.reason, 'not-configured');
});

test('a missing folder yields missing-folder and builds no command', () => {
  const out = resolveIdeLaunch(
    { externalIdeCommand: 'code {path}', projectPath: '/gone' },
    { shellPath: '/bin/zsh', folderExists: false }
  );
  assert.deepEqual(out, { ok: false, reason: 'missing-folder' });
});

test('a command without {path} receives the path as its last argument', () => {
  const out = resolveIdeLaunch({ externalIdeCommand: 'code', projectPath: '/tmp/proj' }, ZSH);
  assert.equal(out.ok, true);
  assert.match(commandLine(out), /^code '\/tmp\/proj'$/);
});

test('{path} is substituted where the user put it', () => {
  const out = resolveIdeLaunch({ externalIdeCommand: 'code -n {path} --wait', projectPath: '/tmp/proj' }, ZSH);
  assert.equal(commandLine(out), "code -n '/tmp/proj' --wait");
});

test('every occurrence of {path} is substituted', () => {
  const out = resolveIdeLaunch({ externalIdeCommand: 'cd {path} && code {path}', projectPath: '/tmp/proj' }, ZSH);
  assert.equal(commandLine(out), "cd '/tmp/proj' && code '/tmp/proj'");
});

test('a path containing a space stays one argument', () => {
  const out = resolveIdeLaunch({ externalIdeCommand: 'code', projectPath: '/tmp/my projects/app' }, ZSH);
  assert.equal(commandLine(out), "code '/tmp/my projects/app'");
});

test('a path containing an apostrophe is escaped', () => {
  const out = resolveIdeLaunch({ externalIdeCommand: 'code', projectPath: "/tmp/vincent's app" }, ZSH);
  assert.equal(commandLine(out), "code '/tmp/vincent'\\''s app'");
});

test('a path containing regexp replacement patterns is substituted literally', () => {
  const out = resolveIdeLaunch({ externalIdeCommand: 'code {path}', projectPath: "/tmp/$&$'x" }, ZSH);
  assert.equal(commandLine(out), "code '/tmp/$&$'\\''x'");
});

test('the resolved shell is handed back with the arguments it expects', () => {
  const out = resolveIdeLaunch({ externalIdeCommand: 'code', projectPath: '/tmp/proj' }, ZSH);
  assert.equal(out.shell, '/bin/zsh');
  assert.deepEqual(out.args.slice(0, 3), ['-l', '-i', '-c']);
});

test('a WSL shell receives a translated path and the distribution arguments', () => {
  const out = resolveIdeLaunch(
    { externalIdeCommand: 'code', projectPath: 'C:\\Users\\vincent\\app' },
    { shellPath: 'wsl.exe', folderExists: true, shellExtraArgs: ['-d', 'Ubuntu'] }
  );
  assert.equal(commandLine(out), "code '/mnt/c/Users/vincent/app'");
  assert.deepEqual(out.args.slice(0, 2), ['-d', 'Ubuntu']);
});

test('PowerShell quotes by doubling the apostrophe', () => {
  const out = resolveIdeLaunch(
    { externalIdeCommand: 'code', projectPath: "C:\\Users\\vincent's app" },
    { shellPath: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', folderExists: true }
  );
  assert.equal(commandLine(out), "code 'C:\\Users\\vincent''s app'");
  assert.deepEqual(out.args.slice(0, 2), ['-NoLogo', '-Command']);
});

test('cmd.exe quotes with double quotes', () => {
  const out = resolveIdeLaunch(
    { externalIdeCommand: 'code', projectPath: 'C:\\my projects\\app' },
    { shellPath: 'C:\\WINDOWS\\system32\\cmd.exe', folderExists: true }
  );
  assert.equal(commandLine(out), 'code "C:\\my projects\\app"');
  assert.deepEqual(out.args.slice(0, 1), ['/C']);
});

// A real failure captured from the app: the login shell sources mise, which
// printed a multi-line template error before the command's own failure.
const MISE_NOISE = `Identity added: /Users/x/.ssh/id_github (x@example.com)
warning: unused env vars: __MISE_ZSH_CHPWD_RAN, __MISE_ZSH_PRECMD_RUN
 --> __tera_one_off:1:7
  |
1 | {{env.LAB_FOLDER}}/norauto/wsc/front
  |       ^^^^^^^^^^
mise ERROR Version: 2026.7.18 macos-arm64 (2026-07-30)
mise ERROR Run with --verbose or MISE_VERBOSE=1 for more information
zsh: command not found: webstorm
`;

test('the error shown is the command failure, not the login shell chatter', () => {
  assert.equal(launchErrorMessage(MISE_NOISE, 127), 'zsh: command not found: webstorm');
});

test('a silent failure falls back to the exit code', () => {
  assert.equal(launchErrorMessage('', 127), 'exited with code 127');
  assert.equal(launchErrorMessage('   \n\n  ', 127), 'exited with code 127');
});

test('an overlong single line is truncated from the front, keeping the end', () => {
  const out = launchErrorMessage('x'.repeat(400) + 'command not found: foo', 127);
  assert.equal(out.startsWith('…'), true);
  assert.equal(out.endsWith('command not found: foo'), true);
  assert.equal(out.length, 301);
});
