// The one wrapper over window.api — the preload IPC bridge the main process exposes.
// Components and composables import `api` instead of reaching through the global, so a
// later move of the bridge is a change in one file. The frozen legacy renderer keeps
// calling window.api directly; this only fronts the Vue side.
//
// A Proxy over the live global rather than a captured reference: window.api may not be
// installed yet when this module first evaluates (node:test has no window at all), and
// the preload can replace it. Each access reads it fresh. `api` is always defined, so a
// call guards the method — `api.foo?.()` — where the old code guarded the global with
// `window.api?.foo()`; a missing method stays a no-op.

function target() {
  return (typeof window !== 'undefined' && window.api) || undefined;
}

export const api = new Proxy(Object.create(null), {
  get(_t, prop) {
    const bridge = target();
    if (!bridge) return undefined;
    const value = bridge[prop];
    return typeof value === 'function' ? value.bind(bridge) : value;
  },
  has(_t, prop) {
    const bridge = target();
    return !!bridge && prop in bridge;
  },
});
