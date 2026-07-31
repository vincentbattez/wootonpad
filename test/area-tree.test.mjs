import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSidebarTree, removeArea } from '../src/vue/area-tree.mjs';

const project = (path) => ({ projectPath: path, sessions: [] });

// Shape of a node, flattened to a readable label for order assertions.
const labels = (nodes) => nodes.map(n => (n.type === 'area' ? `area:${n.name}` : `project:${n.projectPath}`));

test('with no areas the projects stay flat, in the order they came in', () => {
  const projects = [project('/a'), project('/b'), project('/c')];
  const tree = buildSidebarTree({ areas: [], assignments: [], projects });
  assert.deepEqual(labels(tree), ['project:/a', 'project:/b', 'project:/c']);
});

test('areas render before the ungrouped projects at the root', () => {
  const areas = [{ id: 'w', name: 'Work', parentId: null, position: 0 }];
  const projects = [project('/a'), project('/b')];
  const tree = buildSidebarTree({ areas, assignments: [], projects });
  assert.deepEqual(labels(tree), ['area:Work', 'project:/a', 'project:/b']);
});

test('root areas follow their manual position, not their insertion order', () => {
  const areas = [
    { id: 'b', name: 'Second', parentId: null, position: 1 },
    { id: 'a', name: 'First', parentId: null, position: 0 },
  ];
  const tree = buildSidebarTree({ areas, assignments: [], projects: [] });
  assert.deepEqual(labels(tree), ['area:First', 'area:Second']);
});

test('inside an area, sub-areas come before projects and projects keep their recency order', () => {
  const areas = [
    { id: 'w', name: 'Work', parentId: null, position: 0 },
    { id: 'c', name: 'Commerce', parentId: 'w', position: 0 },
  ];
  const projects = [project('/recent'), project('/older')];
  const assignments = [
    { projectPath: '/older', areaId: 'w' },
    { projectPath: '/recent', areaId: 'w' },
  ];
  const [work] = buildSidebarTree({ areas, assignments, projects });
  assert.deepEqual(labels(work.children), ['area:Commerce', 'project:/recent', 'project:/older']);
});

test('an area holds sub-areas and projects side by side at arbitrary depth', () => {
  const areas = [
    { id: 'w', name: 'Work', parentId: null, position: 0 },
    { id: 'c', name: 'Commerce', parentId: 'w', position: 0 },
    { id: 'd', name: 'Deep', parentId: 'c', position: 0 },
  ];
  const projects = [project('/shop'), project('/leaf')];
  const assignments = [
    { projectPath: '/shop', areaId: 'c' },
    { projectPath: '/leaf', areaId: 'd' },
  ];
  const [work] = buildSidebarTree({ areas, assignments, projects });
  const commerce = work.children[0];
  assert.deepEqual(labels(commerce.children), ['area:Deep', 'project:/shop']);
  assert.deepEqual(labels(commerce.children[0].children), ['project:/leaf']);
});

test('a grouped project is not repeated among the ungrouped ones', () => {
  const areas = [{ id: 'w', name: 'Work', parentId: null, position: 0 }];
  const projects = [project('/grouped'), project('/ungrouped')];
  const assignments = [{ projectPath: '/grouped', areaId: 'w' }];
  const tree = buildSidebarTree({ areas, assignments, projects });
  assert.deepEqual(labels(tree), ['area:Work', 'project:/ungrouped']);
  assert.deepEqual(labels(tree[0].children), ['project:/grouped']);
});

test('an empty area stays visible in normal view', () => {
  const areas = [{ id: 'w', name: 'Work', parentId: null, position: 0 }];
  const tree = buildSidebarTree({ areas, assignments: [], projects: [] });
  assert.deepEqual(labels(tree), ['area:Work']);
});

test('an area with no visible descendant is hidden while a filter is active', () => {
  const areas = [
    { id: 'w', name: 'Work', parentId: null, position: 0 },
    { id: 'e', name: 'Empty', parentId: null, position: 1 },
  ];
  const projects = [project('/a')];
  const assignments = [{ projectPath: '/a', areaId: 'w' }];
  const tree = buildSidebarTree({ areas, assignments, projects, filters: { active: true } });
  assert.deepEqual(labels(tree), ['area:Work']);
});

test('an area kept by a deeply nested project survives the filter along with its ancestors', () => {
  const areas = [
    { id: 'w', name: 'Work', parentId: null, position: 0 },
    { id: 'c', name: 'Commerce', parentId: 'w', position: 0 },
    { id: 'x', name: 'Nothing', parentId: 'w', position: 1 },
  ];
  const projects = [project('/deep')];
  const assignments = [{ projectPath: '/deep', areaId: 'c' }];
  const tree = buildSidebarTree({ areas, assignments, projects, filters: { active: true } });
  assert.deepEqual(labels(tree), ['area:Work']);
  assert.deepEqual(labels(tree[0].children), ['area:Commerce']);
});

test('an empty area named in keepAreaIds survives a filter, along with its ancestors', () => {
  const areas = [
    { id: 'w', name: 'Work', parentId: null, position: 0 },
    { id: 'n', name: 'New Area', parentId: 'w', position: 0 },
    { id: 'x', name: 'Nothing', parentId: null, position: 1 },
  ];
  const filters = { active: true, keepAreaIds: ['n'] };
  const tree = buildSidebarTree({ areas, assignments: [], projects: [], filters });
  assert.deepEqual(labels(tree), ['area:Work']);
  assert.deepEqual(labels(tree[0].children), ['area:New Area']);
});

test('two areas under different parents may carry the same name', () => {
  const areas = [
    { id: 'w', name: 'Work', parentId: null, position: 0 },
    { id: 'p', name: 'Perso', parentId: null, position: 1 },
    { id: 'c1', name: 'Commerce', parentId: 'w', position: 0 },
    { id: 'c2', name: 'Commerce', parentId: 'p', position: 0 },
  ];
  const tree = buildSidebarTree({ areas, assignments: [], projects: [] });
  assert.deepEqual(labels(tree[0].children), ['area:Commerce']);
  assert.deepEqual(labels(tree[1].children), ['area:Commerce']);
  assert.equal(tree[0].children[0].id, 'c1');
  assert.equal(tree[1].children[0].id, 'c2');
});

test('an assignment pointing at an absent project does not appear and does not throw', () => {
  const areas = [{ id: 'w', name: 'Work', parentId: null, position: 0 }];
  const assignments = [{ projectPath: '/gone', areaId: 'w' }, { projectPath: '/here', areaId: 'w' }];
  const tree = buildSidebarTree({ areas, assignments, projects: [project('/here')] });
  assert.deepEqual(labels(tree[0].children), ['project:/here']);
});

test('an assignment pointing at an absent area leaves its project ungrouped', () => {
  const projects = [project('/orphan')];
  const assignments = [{ projectPath: '/orphan', areaId: 'nope' }];
  const tree = buildSidebarTree({ areas: [], assignments, projects });
  assert.deepEqual(labels(tree), ['project:/orphan']);
});

test('an area whose parent is missing is shown at the root rather than lost', () => {
  const areas = [{ id: 'c', name: 'Commerce', parentId: 'gone', position: 0 }];
  const tree = buildSidebarTree({ areas, assignments: [], projects: [] });
  assert.deepEqual(labels(tree), ['area:Commerce']);
});

test('a cycle among areas does not hang and does not throw', () => {
  const areas = [
    { id: 'a', name: 'A', parentId: 'b', position: 0 },
    { id: 'b', name: 'B', parentId: 'a', position: 0 },
    { id: 'r', name: 'Root', parentId: null, position: 0 },
  ];
  const tree = buildSidebarTree({ areas, assignments: [], projects: [] });
  assert.deepEqual(labels(tree), ['area:Root']);
});

test('the persisted collapsed flag is honoured in normal view and ignored under a filter', () => {
  const areas = [{ id: 'w', name: 'Work', parentId: null, position: 0, collapsed: 1 }];
  const projects = [project('/a')];
  const assignments = [{ projectPath: '/a', areaId: 'w' }];
  const [normal] = buildSidebarTree({ areas, assignments, projects });
  assert.equal(normal.collapsed, true);
  const [filtered] = buildSidebarTree({ areas, assignments, projects, filters: { active: true } });
  assert.equal(filtered.collapsed, false);
});

test('a sub-area collapse is computed independently of its parent', () => {
  const areas = [
    { id: 'w', name: 'Work', parentId: null, position: 0, collapsed: 0 },
    { id: 'c', name: 'Commerce', parentId: 'w', position: 0, collapsed: 1 },
  ];
  const [work] = buildSidebarTree({ areas, assignments: [], projects: [] });
  assert.equal(work.collapsed, false);
  assert.equal(work.children[0].collapsed, true);
});

test('a collapsed parent leaves an expanded sub-area expanded', () => {
  const areas = [
    { id: 'w', name: 'Work', parentId: null, position: 0, collapsed: 1 },
    { id: 'c', name: 'Commerce', parentId: 'w', position: 0, collapsed: 0 },
  ];
  const [work] = buildSidebarTree({ areas, assignments: [], projects: [] });
  assert.equal(work.collapsed, true);
  assert.equal(work.children[0].collapsed, false);
});

test('missing inputs are tolerated', () => {
  assert.deepEqual(buildSidebarTree({}), []);
  assert.deepEqual(buildSidebarTree(), []);
});

// ── removeArea: one-level promotion (VIN-81) ──────────────────────────────
// Deleting an Area is never destructive: its sub-Areas and Projects move up one level to
// become siblings of what contained the Area, in the same result. Nothing cascades.

const byId = (areas) => new Map(areas.map(a => [a.id, a]));

test('deleting a mid-level area promotes its sub-areas to its own parent', () => {
  const areas = [
    { id: 'w', name: 'Work', parentId: null, position: 0 },
    { id: 'c', name: 'Commerce', parentId: 'w', position: 0 },
    { id: 'd', name: 'Deep', parentId: 'c', position: 0 },
  ];
  const { areas: next } = removeArea(areas, [], 'c');
  assert.equal(next.find(a => a.id === 'c'), undefined);
  // Deep moves up to Work, Commerce's parent.
  assert.equal(byId(next).get('d').parentId, 'w');
});

test('deleting a mid-level area re-files its projects into its own parent', () => {
  const areas = [
    { id: 'w', name: 'Work', parentId: null, position: 0 },
    { id: 'c', name: 'Commerce', parentId: 'w', position: 0 },
  ];
  const assignments = [
    { projectPath: '/shop', areaId: 'c' },
    { projectPath: '/other', areaId: 'w' },
  ];
  const { assignments: next } = removeArea(areas, assignments, 'c');
  assert.deepEqual(
    next.sort((a, b) => a.projectPath.localeCompare(b.projectPath)),
    [{ projectPath: '/other', areaId: 'w' }, { projectPath: '/shop', areaId: 'w' }],
  );
});

test('deleting a root area promotes its sub-areas to the root', () => {
  const areas = [
    { id: 'w', name: 'Work', parentId: null, position: 0 },
    { id: 'c', name: 'Commerce', parentId: 'w', position: 0 },
  ];
  const { areas: next } = removeArea(areas, [], 'w');
  assert.equal(next.find(a => a.id === 'w'), undefined);
  assert.equal(byId(next).get('c').parentId, null);
});

test('deleting a root area unfiles its projects (no assignment survives at the root)', () => {
  const areas = [{ id: 'w', name: 'Work', parentId: null, position: 0 }];
  const assignments = [{ projectPath: '/shop', areaId: 'w' }];
  const { areas: nextAreas, assignments: next } = removeArea(areas, assignments, 'w');
  assert.deepEqual(nextAreas, []);
  // A root Project has no Area, so the assignment is dropped — the Project is not lost, it is unfiled.
  assert.deepEqual(next, []);
});

test('promotion is one level only: a deeper project keeps its area', () => {
  const areas = [
    { id: 'w', name: 'Work', parentId: null, position: 0 },
    { id: 'c', name: 'Commerce', parentId: 'w', position: 0 },
    { id: 'd', name: 'Deep', parentId: 'c', position: 0 },
  ];
  const assignments = [{ projectPath: '/leaf', areaId: 'd' }];
  const { assignments: next } = removeArea(areas, assignments, 'c');
  // Deleting Commerce does not touch Deep's project — only Commerce's direct children move.
  assert.deepEqual(next, [{ projectPath: '/leaf', areaId: 'd' }]);
});

test('promoted sub-areas are appended after the new parent existing sub-areas, in manual order', () => {
  const areas = [
    { id: 'w', name: 'Work', parentId: null, position: 0 },
    { id: 'k', name: 'Kept', parentId: 'w', position: 0 },
    { id: 'c', name: 'Commerce', parentId: 'w', position: 1 },
    { id: 'a', name: 'Alpha', parentId: 'c', position: 0 },
    { id: 'b', name: 'Beta', parentId: 'c', position: 1 },
  ];
  const { areas: next } = removeArea(areas, [], 'c');
  const work = buildSidebarTree({ areas: next, assignments: [], projects: [] })[0];
  assert.deepEqual(work.children.map(n => n.name), ['Kept', 'Alpha', 'Beta']);
});

test('removing an unknown area changes nothing and does not throw', () => {
  const areas = [{ id: 'w', name: 'Work', parentId: null, position: 0 }];
  const assignments = [{ projectPath: '/a', areaId: 'w' }];
  const { areas: nextAreas, assignments: nextAssignments } = removeArea(areas, assignments, 'nope');
  assert.deepEqual(nextAreas, areas);
  assert.deepEqual(nextAssignments, assignments);
});

test('removeArea does not mutate its inputs', () => {
  const areas = [
    { id: 'w', name: 'Work', parentId: null, position: 0 },
    { id: 'c', name: 'Commerce', parentId: 'w', position: 0 },
  ];
  const assignments = [{ projectPath: '/shop', areaId: 'c' }];
  removeArea(areas, assignments, 'c');
  assert.equal(areas.find(a => a.id === 'c').parentId, 'w');
  assert.equal(byId(areas).get('c').parentId, 'w');
  assert.deepEqual(assignments, [{ projectPath: '/shop', areaId: 'c' }]);
});

test('removeArea tolerates missing inputs', () => {
  assert.deepEqual(removeArea(), { areas: [], assignments: [] });
  assert.deepEqual(removeArea([], [], 'x'), { areas: [], assignments: [] });
});
