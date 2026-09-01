// A Proxy that fronts a live browser global (window.api, window.__sb, …) so the Vue
// layer imports a stable binding instead of reaching through the global. `read` returns
// the current global, or undefined when it is not installed yet.
//
// The global is read fresh on every access: it may not exist when this module first
// evaluates (node:test has no window, the preload/legacy renderer install their bridge
// later) and may be replaced afterwards. The returned Proxy is always defined, so a call
// guards the method — `svc.foo?.()` — and a missing global or method stays a no-op.

export function globalProxy(read) {
  return new Proxy(Object.create(null), {
    get(_t, prop) {
      const bridge = read();
      if (!bridge) return undefined;
      const value = bridge[prop];
      return typeof value === 'function' ? value.bind(bridge) : value;
    },
    has(_t, prop) {
      const bridge = read();
      return !!bridge && prop in bridge;
    },
  });
}
