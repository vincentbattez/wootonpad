import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parse, compileTemplate } from '@vue/compiler-sfc';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';

// Add a Remote Project by hand (VIN-157). The native folder picker can't browse another machine, so
// the dialog grows a Host picker (default Local Host, current behaviour unchanged) and, when a
// Remote Host is chosen, drops the Browse button. This exercises the genuine conditional markup from
// AddProjectDialog.vue's <template>, with the setup bindings supplied by hand, the same way the
// capability-gate test does for the project container.

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

const noop = () => {};
const slotStub = { template: '<div><slot/></div>' };
const DIALOG = 'src/vue/features/projects/dialogs/AddProjectDialog.vue';

function bindings(over = {}) {
  return {
    open: true, path: '', error: '', pathInputRef: null,
    hosts: [], hostId: '', isRemote: false,
    close: noop, add: noop, browse: noop,
    ...over,
  };
}

test('with no Remote Hosts the dialog carries no Host picker — the local flow is unchanged', async () => {
  const html = await renderTemplate(DIALOG, { components: { SbDialog: slotStub }, bindings: bindings() });
  assert.ok(!html.includes('add-project-host'), 'no Host picker when there are no Remote Hosts');
  assert.ok(html.includes('add-project-browse-btn'), 'Browse shown for the local flow');
});

test('with a Remote Host present the dialog offers a Host picker defaulting to Local Host', async () => {
  const hosts = [{ id: 'h1', name: 'Mini', sshTarget: 'mac-mini' }];
  const html = await renderTemplate(DIALOG, { components: { SbDialog: slotStub }, bindings: bindings({ hosts }) });
  assert.ok(html.includes('add-project-host'), 'a Host picker is shown');
  assert.ok(/Local Host/.test(html), 'Local Host is an option (the default)');
  assert.ok(html.includes('Mini') || html.includes('mac-mini'), 'the Remote Host is an option');
});

test('choosing a Remote Host drops the Browse button — a machine cannot be folder-picked', async () => {
  const hosts = [{ id: 'h1', name: 'Mini', sshTarget: 'mac-mini' }];
  const remote = await renderTemplate(DIALOG, {
    components: { SbDialog: slotStub }, bindings: bindings({ hosts, hostId: 'h1', isRemote: true }),
  });
  assert.ok(!remote.includes('add-project-browse-btn'), 'Browse hidden for a Remote Host');

  const local = await renderTemplate(DIALOG, {
    components: { SbDialog: slotStub }, bindings: bindings({ hosts, hostId: '', isRemote: false }),
  });
  assert.ok(local.includes('add-project-browse-btn'), 'Browse shown again when Local Host is picked');
});
