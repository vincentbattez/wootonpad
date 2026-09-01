// The one wrapper over window.api — the preload IPC bridge the main process exposes.
// Components and composables import `api` instead of reaching through the global, so a
// later move of the bridge is a change in one file. The frozen legacy renderer keeps
// calling window.api directly; this only fronts the Vue side.
//
// `api` is a live Proxy over the global (see globalProxy): each access reads window.api
// fresh, so a call before the preload installs it — or after it is replaced — stays a
// no-op through `?.`, matching the old `window.api?.foo?.()` call-sites.

import { globalProxy } from './global-proxy.js';

export const api = globalProxy(() => (typeof window !== 'undefined' && window.api) || undefined);
