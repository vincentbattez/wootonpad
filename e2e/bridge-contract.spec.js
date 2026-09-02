const { test, expect } = require('./app-fixture');

// The frozen legacy renderer (public/app.js and its siblings) reaches the Vue layer
// only through the window.vue* bridge objects and the window.vueStore facade. That
// surface is the acceptance surface of the whole VIN-107 refactor: "any step that
// changes it is wrong by construction". Today a rename on either side is caught only
// at runtime, by a blank panel; this spec enumerates the surface explicitly and
// asserts it from inside the renderer, so a missing or renamed method or store field
// fails in CI instead.
//
// The two tables below ARE the contract. They mirror src/vue/bridge.js, the bridges
// App.vue installs on mount, and the aggregate facade in src/vue/store.js. A diff on
// them is a deliberate contract change and must be reviewed as one.
//
// Sixteen bridge globals: the fifteen method-bearing objects below plus window.vueStore
// (the field facade asserted separately). Counts are noted per object so the total —
// 54 methods — is legible; the PRD's headline 46/12 predates the VIN-92/98/102 store
// slicing and is superseded by the live surface written down here.
const BRIDGE_METHODS = {
  // window.vueSidebar: the Session/Project tree, live PTY sets, filters, search and header.
  vueSidebar: [
    'setProjects', 'setActivePtyIds', 'setActiveSession', 'setBusy', 'addAttention',
    'setResponseReady', 'clearNotifications', 'setFilters', 'setSearch', 'setVisibility',
    'setHeaderSession', 'setHeaderPtyTitle', 'setHeaderShellProfile', 'setHeaderAccount',
    'clearHeader',
  ], // 15
  // window.vuePlans: the Plans list and which plan is open.
  vuePlans: ['setPlans', 'setActive', 'clearActive'], // 3
  // window.vueMemory: the Agent Files tree, active-file highlight and search filter.
  vueMemory: ['setMemories', 'setFilter', 'setActive', 'clearActive'], // 4
  // window.vueAccounts: the Accounts panel list, active account and usage.
  vueAccounts: ['setAccounts', 'setActiveAccount', 'setUsage'], // 3
  // window.vueAccountDropdown: the sidebar account switcher.
  vueAccountDropdown: ['setAccounts', 'setActiveAccount', 'setUsage', 'close'], // 4
  // window.vueStatusBar: the three status-bar slots and their auto-clear timers.
  vueStatusBar: ['setInfo', 'setActivity', 'setUpdater'], // 3
  // window.vueGrid: the Session-overview cards teleported into the vanilla grid.
  vueGrid: ['addCard', 'updateCard', 'removeCard', 'clearAll'], // 4
  // window.vueProjects: the Projects panel plus the lazy per-project info queue.
  vueProjects: ['setProjects', 'setSearch', 'clearActive', 'updateProjectInfo'], // 4
  // window.vueJsonlViewer: the Message History viewer.
  vueJsonlViewer: ['open'], // 1
  // window.vueApp: the sidebar tab switch.
  vueApp: ['setTab'], // 1
  // window.vuePlanViewer / window.vueMemoryViewer: stubbed in main.js, filled by App.vue.
  vuePlanViewer: ['open'], // 1
  vueMemoryViewer: ['open'], // 1
  // window.vueDialogs: the four launch dialogs plus the Area dialog, filled by App.vue.
  vueDialogs: ['openNewSession', 'openResumeSession', 'openAddProject', 'openPopover', 'openAreaDialog'], // 5
  // window.vueProjectViewer: the Project Viewer, installed by App.vue on mount.
  vueProjectViewer: ['open', 'close', 'setTab'], // 3
  // window.vueStats: the Stats panel, installed by App.vue on mount.
  vueStats: ['load', 'invalidate'], // 2
};

// window.vueStore: the aggregate facade whose fields the frozen renderer addresses by
// name (public/app.js and public/grid-view.js). Every field delegates to a feature
// slice, so slicing the store must not drop any of these names.
const STORE_FIELDS = [
  'activeTab', 'loadingStatus', 'accountSwitching', 'settingsOpen', 'showStats',
  'showJsonl', 'planViewerOpen', 'memoryViewerOpen', 'gridViewActive', 'gridViewerCount',
  'projects',
];

test.describe('legacy bridge contract', () => {
  test('every bridge global exposes its methods, present and callable', async ({ sandbox }) => {
    const { page } = sandbox;
    // App.vue installs vueProjectViewer / vueStats / vueDialogs / vuePlanViewer /
    // vueMemoryViewer in its onMounted hook. Wait until the last of those is wired
    // so the assertion never races the mount.
    await page.waitForFunction(() => typeof window.vueStats?.load === 'function');

    const missing = await page.evaluate((contract) => {
      const gaps = [];
      for (const [name, methods] of Object.entries(contract)) {
        const obj = window[name];
        if (!obj) { gaps.push(name + ' (missing global)'); continue; }
        for (const method of methods) {
          if (typeof obj[method] !== 'function') gaps.push(name + '.' + method);
        }
      }
      return gaps;
    }, BRIDGE_METHODS);

    // An empty list is the whole contract intact; any entry names the break.
    expect(missing).toEqual([]);
  });

  test('the store facade carries every frozen-renderer field', async ({ sandbox }) => {
    const { page } = sandbox;
    await page.waitForFunction(() => !!window.vueStore);

    const missing = await page.evaluate((fields) => {
      const store = window.vueStore;
      if (!store) return ['vueStore (missing global)'];
      // `in` catches the field whether its current value is null, false or '' —
      // a renamed field disappears from the facade and fails here.
      return fields.filter((field) => !(field in store));
    }, STORE_FIELDS);

    expect(missing).toEqual([]);
  });
});
