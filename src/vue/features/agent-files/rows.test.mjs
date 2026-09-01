import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planRow, memoryRow } from './rows.mjs';

// The row mappers turn a Plan or a memory file into the flat model the Dumb row renders. Pure —
// the date formatter is injected — so the mapping (title fallbacks, the schedule variant, the
// sanitised DOM id and the run state) is asserted against fixed inputs with no Vue and no DOM.
const fmt = (d) => `@${d}`;

test('planRow prefers the title and falls back to the filename', () => {
  assert.deepEqual(
    planRow({ filename: 'p.md', title: 'Plan', modified: 7 }, { activePlan: 'p.md', fmtDate: fmt }),
    { key: 'p.md', title: 'Plan', subtitle: 'p.md', meta: '@7', active: true, variant: 'plan', runnable: false },
  );
});

test('planRow with no title shows the filename and is inactive when unselected', () => {
  const row = planRow({ filename: 'p.md', modified: 1 }, { activePlan: 'other.md', fmtDate: fmt });
  assert.equal(row.title, 'p.md');
  assert.equal(row.active, false);
});

test('memoryRow marks a plain file as the memory variant with no run button', () => {
  const row = memoryRow(
    { filename: 'CLAUDE.md', filePath: '/proj/CLAUDE.md', displayPath: 'proj', modified: 3 },
    { activeFile: '/proj/CLAUDE.md', runningFile: null, doneFile: null, fmtDate: fmt },
  );
  assert.deepEqual(row, {
    key: '/proj/CLAUDE.md',
    title: 'CLAUDE.md',
    subtitle: 'proj',
    meta: '@3',
    active: true,
    itemId: 'mf-_proj_CLAUDE_md',
    variant: 'memory',
    runnable: false,
    runState: 'idle',
  });
});

test('memoryRow marks a schedule file as runnable and reflects its run state', () => {
  const file = { filename: 'schedule-daily.md', filePath: '/s/schedule-daily.md', displayPath: 's', modified: 2 };
  const running = memoryRow(file, { activeFile: null, runningFile: '/s/schedule-daily.md', doneFile: null, fmtDate: fmt });
  assert.equal(running.variant, 'schedule');
  assert.equal(running.runnable, true);
  assert.equal(running.runState, 'running');

  const done = memoryRow(file, { activeFile: null, runningFile: null, doneFile: '/s/schedule-daily.md', fmtDate: fmt });
  assert.equal(done.runState, 'done');
});
