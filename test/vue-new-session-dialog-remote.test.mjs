// VIN-155: on a Remote Project the New Session dialog keeps permission mode, worktree, pre-launch
// and add-dirs, but hides the Chrome toggle (a headless Host has no display, and the VIN-151 spike
// left --chrome unproven). This renders the real <template> with hand-supplied bindings and asserts
// against the genuine `v-if="!isRemote"` markup, so the gate is checkable rather than read by eye.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parse, compileTemplate } from '@vue/compiler-sfc';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

async function renderTemplate(relPath, { components = {}, bindings = {} }) {
  const src = readFileSync(join(root, relPath), 'utf8');
  const { descriptor } = parse(src);
  const { code, errors } = compileTemplate({ source: descriptor.template.content, id: 'test', filename: relPath });
  assert.deepEqual(errors, [], `template compile errors in ${relPath}`);
  const tmp = join(root, 'test', `.tmp-render-${randomUUID()}.mjs`);
  writeFileSync(tmp, code);
  let render;
  try {
    ({ render } = await import(`./${tmp.slice(join(root, 'test').length + 1)}`));
  } finally {
    rmSync(tmp, { force: true });
  }
  const app = createSSRApp({ render, components, setup: () => bindings });
  const ctx = {};
  const html = await renderToString(app, ctx);
  return html + Object.values(ctx.teleports || {}).join('');
}

const DIALOG = 'src/vue/dialogs/NewSessionDialog.vue';
const stub = { template: '<div></div>' };
const slotStub = { template: '<div><slot/></div>' };
const noop = () => {};

function bindings(over = {}) {
  return {
    request: { project: { projectPath: '/p' } },
    isRemote: false,
    mode: null, danger: false, chrome: false, worktree: false, worktreeName: '',
    preLaunch: '', addDirs: '',
    close: noop, start: noop, onWorktreeInput: noop, shortPath: () => 'p',
    ...over,
  };
}

const stubs = { SbDialog: slotStub, SbSwitch: stub, PermissionModeGrid: stub };

test('the Chrome toggle shows on a local New Session', async () => {
  const html = await renderTemplate(DIALOG, { components: stubs, bindings: bindings({ isRemote: false }) });
  assert.ok(html.includes('Chrome'), 'Chrome field present locally');
});

test('the Chrome toggle is hidden on a Remote New Session (VIN-155)', async () => {
  const html = await renderTemplate(DIALOG, { components: stubs, bindings: bindings({ isRemote: true }) });
  assert.ok(!html.includes('Chrome'), 'Chrome field hidden on remote');
  // the kept options are still offered
  assert.ok(html.includes('Worktree'), 'Worktree kept');
  assert.ok(html.includes('Pre-launch Command'), 'Pre-launch kept');
  assert.ok(html.includes('Additional Directories'), 'Add-dirs kept');
});
