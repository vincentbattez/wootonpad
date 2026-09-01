import { sessionsStore } from './stores/sessions.js';
import { sidebarStore } from './stores/sidebar.js';
import { areasStore } from './stores/areas.js';
import { layoutStore } from './stores/layout.js';
import { headerStore } from './stores/header.js';
import { avatarsStore } from './stores/avatars.js';

// `store` is a facade over the feature slices: every field delegates to its owning
// slice by getter/setter, so `public/app.js` — frozen — keeps addressing
// `window.vueStore.<field>` by name and reactivity is preserved in both directions.
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
