import { ref } from 'vue';

// The inline-rename behaviour, written once for Project, Area, Session and Account rows.
// Owns the editing flag and the draft value; the SbEditableLabel primitive renders them.
// `onSubmit` receives the trimmed value, or null when the field was cleared.
export function useInlineRename(onSubmit) {
  const editing = ref(false);
  const draft = ref('');

  function start(initial) {
    draft.value = initial ?? '';
    editing.value = true;
  }

  function submit(value) {
    if (!editing.value) return;
    editing.value = false;
    const trimmed = (value ?? draft.value ?? '').trim();
    onSubmit(trimmed || null);
  }

  function cancel() {
    editing.value = false;
  }

  return { editing, draft, start, submit, cancel };
}
