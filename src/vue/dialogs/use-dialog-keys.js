import { onMounted, onUnmounted } from 'vue';
import { topDialogFor } from './dialog-store.js';

// Escape closes and Enter submits, but only for the topmost open dialog, and Enter is left alone
// when focus sits in a field so typing a return does not trip the primary action.
export function useDialogKeys(name, { onEscape, onEnter } = {}) {
  function handler(e) {
    if (e.key === 'Escape' && onEscape) {
      if (topDialogFor('Escape') === name) onEscape();
      return;
    }
    if (e.key === 'Enter' && onEnter && !e.target?.matches?.('input, select, textarea')) {
      if (topDialogFor('Enter') === name) onEnter();
    }
  }
  onMounted(() => document.addEventListener('keydown', handler));
  onUnmounted(() => document.removeEventListener('keydown', handler));
}
