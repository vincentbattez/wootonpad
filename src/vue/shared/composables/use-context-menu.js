import { ref, computed } from 'vue';

// The context-menu open/close/positioning, written once for the three rows that grow a
// menu (Project, Area, sidebar filter). Owns the open flag and the anchor position and
// installs the outside-click / resize dismissers while open. The SbContextMenu primitive
// renders the panel at `style`; the caller opens it from a click event.
export function useContextMenu() {
  const open = ref(false);
  const pos = ref({ top: 0, left: 0 });

  const style = computed(() => ({ top: pos.value.top + 'px', left: pos.value.left + 'px' }));

  function close() {
    if (!open.value) return;
    open.value = false;
    document.removeEventListener('click', close);
    window.removeEventListener('resize', close);
  }

  // Anchor below the trigger, kept on-screen at the left edge.
  function openAt(ev, { width = 200 } = {}) {
    if (open.value) return close();
    const rect = ev.currentTarget.getBoundingClientRect();
    pos.value = { top: rect.bottom + 4, left: Math.max(8, rect.right - width) };
    open.value = true;
    document.addEventListener('click', close);
    window.addEventListener('resize', close);
  }

  return { open, pos, style, openAt, close };
}
