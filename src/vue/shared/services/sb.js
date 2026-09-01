// The one wrapper over window.__sb — the callbacks the frozen legacy renderer installs
// for the Vue layer to call back into it (open a Session, run a Project, switch account…).
// Components import `sb` instead of threading `callbacks` prop objects down the tree, or
// reaching for the global directly.
//
// A Proxy over the live global rather than a captured reference: the legacy renderer
// installs window.__sb after this module evaluates, and node:test has no window. Each
// access reads it fresh. `sb` is always defined, so a call guards the method —
// `sb.foo?.()` — matching the old `window.__sb?.foo?.()`: a missing callback is a no-op.

function target() {
  return (typeof window !== 'undefined' && window.__sb) || undefined;
}

export const sb = new Proxy(Object.create(null), {
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
