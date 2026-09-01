import { onMounted, onUnmounted } from 'vue';

// The keyboard contract shared by every dialog: while open, Escape closes and Enter submits —
// except Enter is left alone when focus sits in a field, so typing a return in an input does not
// trip the primary action. isOpen is read on each keystroke so the same listener serves the
// dialog across every open/close cycle.
export function useDialogKeys(isOpen, { onEscape, onEnter } = {}) {
  function handler(e) {
    if (!isOpen()) return;
    if (e.key === 'Escape' && onEscape) { onEscape(); return; }
    if (e.key === 'Enter' && onEnter && !e.target.matches('input, select, textarea')) { onEnter(); return; }
  }
  onMounted(() => document.addEventListener('keydown', handler));
  onUnmounted(() => document.removeEventListener('keydown', handler));
}
