// The one wrapper over window.__sb — the callbacks the frozen legacy renderer installs
// for the Vue layer to call back into it (open a Session, run a Project, switch account…).
// Components import `sb` instead of threading `callbacks` prop objects down the tree, or
// reaching for the global directly.
//
// `sb` is a live Proxy over the global (see globalProxy): each access reads window.__sb
// fresh, so a call before the legacy renderer installs it — or with it gone — stays a
// no-op through `?.`, matching the old `window.__sb?.foo?.()` call-sites.

import { globalProxy } from './global-proxy.js';

export const sb = globalProxy(() => (typeof window !== 'undefined' && window.__sb) || undefined);
