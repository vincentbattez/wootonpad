// VIN-156: the Plain Terminal button on a Remote Project opens an interactive shell on its Host. A
// Host that is Unreachable (its Project greyed) has nothing to connect to, so the Terminal option in
// the New Session popover is disabled. This renders the real <template> with hand-supplied bindings
// and asserts against the genuine `:disabled` markup, so the gate is checkable rather than read by
// eye. The Claude options stay enabled — reachability gating here is scoped to the Plain Terminal.

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

const POPOVER = 'src/vue/dialogs/NewSessionPopover.vue';
const noop = () => {};

function bindings(over = {}) {
  return {
    popover: { project: { projectPath: '/p' } },
    popoverStyle: {},
    terminalDisabled: false,
    CLAUDE_SVG: '', TERMINAL_SVG: '',
    choose: noop,
    ...over,
  };
}

test('the Terminal option is enabled when the Host is reachable', async () => {
  const html = await renderTemplate(POPOVER, { bindings: bindings({ terminalDisabled: false }) });
  assert.ok(html.includes('popover-option-terminal'), 'Terminal option present');
  assert.ok(!/<button[^>]*popover-option-terminal[^>]*disabled/.test(html), 'not disabled when reachable');
});

test('the Terminal option is disabled when the Remote Host is Unreachable (VIN-156)', async () => {
  const html = await renderTemplate(POPOVER, { bindings: bindings({ terminalDisabled: true }) });
  assert.ok(/<button[^>]*popover-option-terminal[^>]*disabled/.test(html), 'Terminal disabled when Unreachable');
  // the Claude options are not swallowed by the Plain Terminal's gate
  assert.ok(!/<button[^>]*popover-option"[^>]*disabled/.test(html), 'Claude option stays enabled');
});
