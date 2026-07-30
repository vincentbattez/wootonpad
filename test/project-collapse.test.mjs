import test from 'node:test';
import assert from 'node:assert/strict';

import { isStaleProject } from '../src/vue/project-collapse.mjs';

const NOW = Date.parse('2026-07-30T12:00:00Z');
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString();

test('a project with no sessions is not stale', () => {
  assert.equal(isStaleProject({ sessions: [] }, 3, NOW), false);
  assert.equal(isStaleProject({}, 3, NOW), false);
});

test('a project whose most recent session is within the age window is not stale', () => {
  const project = { sessions: [{ modified: daysAgo(10) }, { modified: daysAgo(1) }] };
  assert.equal(isStaleProject(project, 3, NOW), false);
});

test('a project whose most recent session is older than the age window is stale', () => {
  const project = { sessions: [{ modified: daysAgo(10) }, { modified: daysAgo(4) }] };
  assert.equal(isStaleProject(project, 3, NOW), true);
});

test('one unusable modified timestamp does not mask an otherwise stale project', () => {
  for (const bad of ['not a date', undefined, null, '']) {
    const project = { sessions: [{ modified: bad }, { modified: daysAgo(10) }] };
    assert.equal(isStaleProject(project, 3, NOW), true, `bad timestamp: ${String(bad)}`);
  }
});

test('an unusable timestamp is not read as recent activity', () => {
  const project = { sessions: [{ modified: daysAgo(10) }, { modified: 'not a date' }] };
  assert.equal(isStaleProject(project, 3, NOW), true);
});

test('a project whose sessions all have unusable timestamps is not stale', () => {
  assert.equal(isStaleProject({ sessions: [{ modified: undefined }, { modified: 'nope' }] }, 3, NOW), false);
});

test('the age window boundary is exclusive', () => {
  const project = { sessions: [{ modified: daysAgo(3) }] };
  assert.equal(isStaleProject(project, 3, NOW), false);
});
