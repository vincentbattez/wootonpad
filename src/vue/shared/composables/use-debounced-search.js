// A debounced search trigger, shared by any Feature with a search box.
//
// onInput(query) schedules onSearch(trimmedQuery) after `delay` ms; a query that
// trims to empty fires onClear immediately instead. clear() cancels any pending
// run and fires onClear now. flush(query) runs the search straight away with no
// debounce — the toggle that changes *how* a live query matches wants the result
// at once, not 200 ms later.
export function useDebouncedSearch({ onSearch, onClear, delay = 200 }) {
  let timer = null;

  function cancel() {
    if (timer) { clearTimeout(timer); timer = null; }
  }

  function onInput(rawQuery) {
    cancel();
    timer = setTimeout(() => {
      timer = null;
      const query = (rawQuery || '').trim();
      if (!query) { onClear(); return; }
      onSearch(query);
    }, delay);
  }

  function clear() {
    cancel();
    onClear();
  }

  function flush(rawQuery) {
    cancel();
    const query = (rawQuery || '').trim();
    if (query) onSearch(query);
  }

  return { onInput, clear, flush, cancel };
}
