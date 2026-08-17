#!/usr/bin/env node
// Ad-hoc signs the freshly built arm64 app, copies it into /Applications and launches it.
// A copy, not a symlink: Raycast and Spotlight don't follow symlinked bundles.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const appPath = path.resolve(__dirname, '..', 'dist', 'mac-arm64', 'WootonPad.app');
const installPath = '/Applications/WootonPad.app';

if (!fs.existsSync(appPath)) {
  console.error(`Build output not found: ${appPath}`);
  process.exit(1);
}

execFileSync('codesign', ['--sign', '-', '--force', '--deep', appPath], { stdio: 'inherit' });

execFileSync('osascript', ['-e', 'quit app "WootonPad"'], { stdio: 'ignore' });
fs.rmSync(installPath, { recursive: true, force: true });
execFileSync('ditto', [appPath, installPath], { stdio: 'inherit' });

// Force LaunchServices to re-index so Raycast/Spotlight pick the new bundle up.
execFileSync(
  '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister',
  ['-f', installPath],
  { stdio: 'inherit' },
);

execFileSync('open', [installPath], { stdio: 'inherit' });
console.log(`Installed ${installPath}`);
