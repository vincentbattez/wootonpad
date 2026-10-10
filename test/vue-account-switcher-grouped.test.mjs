// VIN-158: the sidebar account switcher lists Accounts grouped by Host, with a check on each Host's
// active Account; its header (the always-visible button) keeps showing the Local Host's active
// Account, as today. This renders the real <template> with hand-supplied bindings and asserts
// against the genuine markup, so the grouping and the unchanged header are checkable, not read by eye.
// The grouping maths itself lives in src/vue/features/accounts/switcher.mjs and is tested there; here
// the computed `groups`/`grouped` are handed in so the template's rendering of them is what is asserted.

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

const DROPDOWN = 'src/vue/features/accounts/components/AccountDropdown.vue';
const ITEM = 'src/vue/features/accounts/components/AccountDropdownItem.vue';

function itemBindings(over = {}) {
  return { account: { id: 'a', name: 'Work' }, isActive: false, chips: [], checkSvg: '<svg class="chk"></svg>', ...over };
}

test('the active account row carries a check; an inactive one does not (VIN-158)', async () => {
  const active = await renderTemplate(ITEM, { bindings: itemBindings({ isActive: true }) });
  const inactive = await renderTemplate(ITEM, { bindings: itemBindings({ isActive: false }) });
  assert.ok(active.includes('acct-dd-check'), 'the active row renders the check');
  assert.ok(!inactive.includes('acct-dd-check'), 'an inactive row shows no check');
});

test('a row renders its chips (a Remote Account is handed the em dash)', async () => {
  const html = await renderTemplate(ITEM, { bindings: itemBindings({ chips: ['—'] }) });
  assert.match(html, /account-chip[^>]*>—</, 'the em dash chip renders for a Remote Account');
});

// A stub for AccountDropdownItem that surfaces its props as data-attributes, so the grouping,
// the per-Host active check and the remote flag are all assertable from the rendered HTML.
const itemStub = {
  props: ['account', 'isActive', 'usage', 'remote'],
  template: '<div class="item" :data-name="account.name" :data-active="isActive ? 1 : 0" :data-remote="remote ? 1 : 0"></div>',
};
const components = { AccountDropdownItem: itemStub };

const LOCAL = [{ id: 'default', name: 'Default' }, { id: 'acc-2', name: 'Work' }];
const localGroup = (over = {}) => ({ hostId: null, name: 'Local Host', accounts: LOCAL, activeAccountId: 'default', ...over });

function bindings(over = {}) {
  return {
    accounts: LOCAL,
    activeAccountId: 'default',
    usage: {},
    open: true,
    hosts: [],
    activeName: 'Default',
    activeChips: [],
    hostSvg: '<svg></svg>',
    groups: [localGroup()],
    grouped: false,
    ...over,
  };
}

test('the header shows the active Account name and is unaffected by grouping (VIN-158)', async () => {
  const flat = await renderTemplate(DROPDOWN, { components, bindings: bindings({ activeName: 'Work' }) });
  const grouped = await renderTemplate(DROPDOWN, {
    components,
    bindings: bindings({ activeName: 'Work', grouped: true, groups: [localGroup(), { hostId: 'h1', name: 'Mini', accounts: [{ id: 'default', name: 'Default' }], activeAccountId: 'default' }] }),
  });
  for (const html of [flat, grouped]) {
    assert.match(html, /account-btn-name[^>]*>Work</, 'the header button shows the active Account');
  }
});

test('with only the Local Host the switcher is a flat list — no Host group headers add noise', async () => {
  const html = await renderTemplate(DROPDOWN, { components, bindings: bindings({ grouped: false }) });
  assert.ok(!html.includes('acct-dd-group-header'), 'no group header is rendered when nothing is remote');
  assert.equal((html.match(/class="item"/g) || []).length, 2, 'both local accounts are listed');
});

test('a Remote Host turns on grouping: a Local Host header, a Host header, and a check per Host (VIN-158)', async () => {
  const groups = [
    localGroup({ activeAccountId: 'acc-2' }),
    { hostId: 'h1', name: 'Mac Mini', accounts: [{ id: 'default', name: 'Default' }, { id: 'rb', name: 'Build' }], activeAccountId: 'rb' },
  ];
  const html = await renderTemplate(DROPDOWN, { components, bindings: bindings({ grouped: true, groups }) });
  assert.match(html, /acct-dd-group-name[^>]*>Local Host</, 'the Local Host group header shows');
  assert.match(html, /acct-dd-group-name[^>]*>Mac Mini</, 'the Remote Host group header shows');

  // The local active Account ("Work") is checked in the Local group; the Host's active Account
  // ("Build") is the checked one in its group, and Host Accounts are flagged remote.
  assert.match(html, /data-name="Work"[^>]*data-active="1"/, 'the local active Account carries its check');
  assert.match(html, /data-name="Build"[^>]*data-active="1"[^>]*data-remote="1"/, "the Host's active Account carries the check");
  assert.match(html, /data-name="Default"[^>]*data-active="0"[^>]*data-remote="1"/, "the Host's other Account is remote and unchecked");
});
