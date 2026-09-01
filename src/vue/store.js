import { sessionsStore } from './stores/sessions.js';
import { sidebarStore } from './stores/sidebar.js';
import { areasStore } from './stores/areas.js';
import { layoutStore } from './stores/layout.js';
import { headerStore } from './stores/header.js';
import { avatarsStore } from './stores/avatars.js';

// The flat ~50-field reactive object is now cut into feature slices, so each
// feature owns its own piece of state. `store` is an aggregate facade that
// preserves every original field name: each field reads and writes straight
// through to its owning slice, so `public/app.js` — frozen — keeps addressing
// `window.vueStore.projects`, `window.vueStore.activeTab` and the rest by name.
//
// The facade delegates rather than copies: a getter reads the slice's reactive
// value (so a component reading `store.activeTab` tracks `layoutStore.activeTab`),
// and a setter writes it back (so `window.vueStore.activeTab = x` triggers the
// same effects). Reading a Set or Map field returns the slice's reactive proxy,
// so `store.attentionSessions.add(id)` mutates the tracked collection.
export const slices = { sessionsStore, sidebarStore, areasStore, layoutStore, headerStore, avatarsStore };

export const store = {};
for (const slice of Object.values(slices)) {
  for (const key of Object.keys(slice)) {
    Object.defineProperty(store, key, {
      enumerable: true,
      configurable: true,
      get: () => slice[key],
      set: (value) => { slice[key] = value; },
    });
  }
}

export { sessionsStore, sidebarStore, areasStore, layoutStore, headerStore, avatarsStore };
