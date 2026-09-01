// The row mappers for the agent-files panels. Plans and memory share one Dumb row, so each is
// flattened to the same model here — in one place — rather than in the two containers that read
// them. Pure: the date formatter is injected, so these run under node:test with no Vue.

// A schedule memory file is one whose name marks it as a scheduled agent run; only those carry
// the run-now button.
function isSchedule(file) {
  return file.filename.startsWith('schedule-');
}

export function planRow(plan, { activePlan, fmtDate }) {
  return {
    key: plan.filename,
    title: plan.title || plan.filename,
    subtitle: plan.filename,
    meta: fmtDate(plan.modified),
    active: activePlan === plan.filename,
    variant: 'plan',
    runnable: false,
  };
}

export function memoryRow(file, { activeFile, runningFile, doneFile, fmtDate }) {
  const schedule = isSchedule(file);
  return {
    key: file.filePath,
    title: file.filename,
    subtitle: file.displayPath,
    meta: fmtDate(file.modified),
    active: activeFile === file.filePath,
    // The frozen renderer queries these rows by id; keep the sanitisation byte-identical.
    itemId: 'mf-' + file.filePath.replace(/[^a-zA-Z0-9]/g, '_'),
    variant: schedule ? 'schedule' : 'memory',
    runnable: schedule,
    runState: file.filePath === runningFile ? 'running' : (file.filePath === doneFile ? 'done' : 'idle'),
  };
}
