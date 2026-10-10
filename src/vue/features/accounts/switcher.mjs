// VIN-158: the sidebar account switcher's read model — Accounts grouped by Host. Pulled into a pure
// module so the grouping and the "which Account is active on this Host" rule are asserted with
// node:test, with no mounting and no DOM. The switcher's header (the always-visible button) is
// unaffected: it keeps showing the Local Host's active Account, as today.

// A Host's active Account id, with the same Default-Account fallback the main process uses
// (remote-mirror.activeAccount): an unset or stale id resolves to the Default Account every Host
// carries, so the switcher never paints a check against an Account the Host no longer has.
export function activeHostAccountId(host) {
  const accounts = (host && host.accounts) || [];
  const id = host && host.activeAccountId;
  return id && accounts.some(a => a.id === id) ? id : 'default';
}

// The Host → Accounts groups the open dropdown renders: the Local Host first (the local accounts and
// their active id, handed in from the frozen renderer's switcher bridge), then one group per Remote
// Host in order, each carrying its own Accounts and its own active Account.
export function switcherGroups({ accounts = [], activeAccountId = 'default', hosts = [] } = {}) {
  const local = { hostId: null, name: 'Local Host', accounts, activeAccountId };
  const remote = (hosts || []).map(h => ({
    hostId: h.id,
    name: h.name,
    accounts: h.accounts || [],
    activeAccountId: activeHostAccountId(h),
  }));
  return [local, ...remote];
}

// The chips a switcher row shows. A Remote Account shows a single em dash — usage is out of v1 for
// Remote Hosts (VIN-158), so it is "—" rather than a blank that would read as "0 %". A Local Account
// shows its real usage chips.
import { usageChips } from './usage.mjs';
export function switcherChips(usage, remote) {
  return remote ? ['—'] : usageChips(usage);
}

// Whether to frame the list as Host groups at all. With only the Local Host the switcher stays the
// flat list it has always been — no group header, so one Account per Host adds no noise (VIN-158 AC).
export function isGrouped(hosts = []) {
  return (hosts || []).length > 0;
}
