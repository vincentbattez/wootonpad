import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSidebarTree } from '../src/vue/area-tree.mjs';

const project = (path) => ({ projectPath: path, sessions: [] });

// Shape of a node, flattened to a readable label for order assertions.
const labels = (nodes) => nodes.map(n => (n.type === 'area' ? `area:${n.name}` : `project:${n.projectPath}`));

test('with no areas the projects stay flat, in the order they came in', () => {
  const projects = [project('/a'), project('/b'), project('/c')];
  const tree = buildSidebarTree({ areas: [], assignments: [], projects });
  assert.deepEqual(labels(tree), ['project:/a', 'project:/b', 'project:/c']);
});

test('areas render before the unfiled projects at the root', () => {
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

test('a filed project is not repeated among the unfiled ones', () => {
  const areas = [{ id: 'w', name: 'Work', parentId: null, position: 0 }];
  const projects = [project('/filed'), project('/loose')];
  const assignments = [{ projectPath: '/filed', areaId: 'w' }];
  const tree = buildSidebarTree({ areas, assignments, projects });
  assert.deepEqual(labels(tree), ['area:Work', 'project:/loose']);
  assert.deepEqual(labels(tree[0].children), ['project:/filed']);
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

test('an assignment pointing at an absent area leaves its project unfiled', () => {
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

test('missing inputs are tolerated', () => {
  assert.deepEqual(buildSidebarTree({}), []);
  assert.deepEqual(buildSidebarTree(), []);
});
