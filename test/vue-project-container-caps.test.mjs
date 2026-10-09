import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parse, compileTemplate } from '@vue/compiler-sfc';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';

// A real-template renderer test. The capability *data* is covered by session-cache-sources; this
// exercises the markup that consumes it — the context-menu gates (`v-if="caps.run !== false"` …),
// the greyed-when-Unreachable class and the remote badge — so "the UI hides what it does not
// declare" (VIN-154) is checkable rather than a matter of reading the template by eye.
//
// We compile only each SFC's <template> and SSR-render it with child components stubbed and the
// bindings supplied by hand. That keeps the heavy <script setup> (store, services, composables)
// out of node while still asserting against the genuine conditional markup from the source file.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Compile a component's <template>, render it to HTML (teleported content included) with the given
// stub components and setup bindings. Returns the concatenated main + teleported markup.
async function renderTemplate(relPath, { components = {}, bindings = {} }) {
  const src = readFileSync(join(root, relPath), 'utf8');
  const { descriptor } = parse(src);
  const { code, errors } = compileTemplate({
    source: descriptor.template.content,
    id: 'test',
    filename: relPath,
  });
  assert.deepEqual(errors, [], `template compile errors in ${relPath}`);

  // The compiled render function imports helpers from "vue" by bare specifier, so it must live in a
  // real file inside the repo for node to resolve them against the repo's node_modules.
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
const stub = { template: '<div></div>' };
const slotStub = { template: '<div><slot/></div>' };

function localProject(over = {}) {
  return { projectPath: '/home/me/proj', sessions: [], remote: false, hostId: null, capabilities: null, ...over };
}
function remoteProject(over = {}) {
  return {
    projectPath: 'ssh://mac-mini/home/me/proj', sessions: [], remote: true, hostId: 'mac-mini',
    hostName: 'mac-mini',
    capabilities: { run: false, externalIde: false, projectFolder: false, projectViewer: false, launch: false },
    ...over,
  };
}

function containerBindings(project) {
  return {
    isWorktree: false, project,
    caps: project.capabilities || {},
    canLaunch: (project.capabilities?.launch !== false),
    collapsed: false, shortName: 'proj', hasActiveSession: false, isRenaming: false, folderId: 'project-x',
    menu: { open: { value: true }, style: { value: '' } },
    gearSvg: '', archiveSvg: '', codeSvg: '', playSvg: '', folderSvg: '', pencilSvg: '', eyeOffSvg: '', closeSvg: '',
    runTooltip: '', ideTooltip: '',
    toggle: noop, refreshCommands: noop, openMenu: noop, onRename: noop, onCancelRename: noop,
    runFromMenu: noop, ideFromMenu: noop, folderFromMenu: noop, renameFromMenu: noop,
    settingsFromMenu: noop, archiveAllFromMenu: noop, hideFromMenu: noop, hideWorktreeFromMenu: noop,
    visibleItems: [], olderItems: [], archivedVisible: [], archivedOlder: [], worktrees: [],
    activePtyIds: new Set(), activeSessionId: null, sessionBusyState: new Map(),
    attentionSessions: new Set(), needsInputSessions: new Set(), unreadSessions: new Set(), searchMatchIds: null,
  };
}

const CONTAINER = 'src/vue/features/projects/containers/ProjectContainer.vue';
const containerStubs = { WorktreeHeader: stub, ProjectHeader: stub, ProjectList: stub, ProjectContainer: stub };

test('a local Project shows every context-menu action', async () => {
  const html = await renderTemplate(CONTAINER, {
    components: containerStubs,
    bindings: containerBindings(localProject()),
  });
  assert.ok(html.includes('project-run-btn'), 'Run shown');
  assert.ok(html.includes('project-ide-btn'), 'External IDE shown');
  assert.ok(html.includes('project-folder-btn'), 'Project Folder shown');
  assert.ok(html.includes('project-rename-btn'), 'Rename shown (ungated)');
});

test('a Remote Project hides the unsupported context-menu actions', async () => {
  const html = await renderTemplate(CONTAINER, {
    components: containerStubs,
    bindings: containerBindings(remoteProject()),
  });
  assert.ok(!html.includes('project-run-btn'), 'Run hidden');
  assert.ok(!html.includes('project-ide-btn'), 'External IDE hidden');
  assert.ok(!html.includes('project-folder-btn'), 'Project Folder hidden');
  // Ungated actions still render — hiding is scoped to the undeclared capabilities.
  assert.ok(html.includes('project-rename-btn'), 'Rename still shown');
});

test('a Remote Project carries the remote class; greyed when Unreachable', async () => {
  const reachable = await renderTemplate(CONTAINER, {
    components: containerStubs,
    bindings: containerBindings(remoteProject()),
  });
  assert.ok(reachable.includes('remote-project'), 'remote-project class present');
  assert.ok(!reachable.includes('remote-unreachable'), 'not greyed while reachable');

  const unreachable = await renderTemplate(CONTAINER, {
    components: containerStubs,
    bindings: containerBindings(remoteProject({ greyed: true })),
  });
  assert.ok(unreachable.includes('remote-unreachable'), 'greyed when Unreachable');

  const local = await renderTemplate(CONTAINER, {
    components: containerStubs,
    bindings: containerBindings(localProject()),
  });
  assert.ok(!local.includes('remote-project'), 'local carries no remote class');
});

const HEADER = 'src/vue/features/projects/components/ProjectHeader.vue';

function headerBindings(project) {
  return {
    project, shortName: 'proj', editing: false, dropHover: false, collapsed: false,
    hasActiveSession: false, headerId: 'header-x',
    // A Remote Project declares launch:false; the real prop defaults true for a local Project.
    canLaunch: (project.capabilities?.launch !== false),
    chevronSvg: '', dotsSvg: '', plusSvg: '<svg class="plus-icon"></svg>', remoteSvg: '<svg class="remote-icon"></svg>',
    submit: noop, cancel: noop, onDragStart: noop, onDragEnd: noop, onDragOver: noop, onDragLeave: noop, onDrop: noop,
  };
}

test('the remote badge renders only on a Remote Project', async () => {
  const headerStubs = { ProjectAvatar: stub, SbEditableLabel: slotStub };
  const remote = await renderTemplate(HEADER, { components: headerStubs, bindings: headerBindings(remoteProject()) });
  assert.ok(remote.includes('project-remote-badge'), 'badge shown on remote');

  const local = await renderTemplate(HEADER, { components: headerStubs, bindings: headerBindings(localProject()) });
  assert.ok(!local.includes('project-remote-badge'), 'no badge on local');
});

test('the New-session button is hidden on a Remote Project, shown on a local one', async () => {
  const headerStubs = { ProjectAvatar: stub, SbEditableLabel: slotStub };
  // A Remote Project cannot launch a Session yet (next ticket), so no launch path is offered.
  const remote = await renderTemplate(HEADER, { components: headerStubs, bindings: headerBindings(remoteProject()) });
  assert.ok(!remote.includes('project-new-btn'), 'New-session button hidden on remote');

  const local = await renderTemplate(HEADER, { components: headerStubs, bindings: headerBindings(localProject()) });
  assert.ok(local.includes('project-new-btn'), 'New-session button shown on local');
});
