// Areas are a user-authored tree; Projects are scan-derived and volatile. This module holds
// the ordering and visibility decisions, free of I/O, DOM and Electron.

function areaNode(area, filterActive) {
  return {
    type: 'area',
    id: area.id,
    name: area.name,
    collapsed: filterActive ? false : !!area.collapsed,
    children: [],
  };
}

function byPosition(a, b) {
  return (a.position ?? 0) - (b.position ?? 0);
}

// Every Area id reachable by walking parent→child from `roots` (the roots themselves included).
// A name match reveals a matched Area's whole subtree (VIN-80): this is that subtree closure,
// shared by the tree build here and the project filter in the sidebar.
export function subtreeAreaIds(areas = [], roots = []) {
  const ids = new Set(roots);
  if (ids.size === 0) return ids;
  const childAreaIds = new Map();
  for (const area of areas) {
    const parent = area.parentId ?? null;
    if (!childAreaIds.has(parent)) childAreaIds.set(parent, []);
    childAreaIds.get(parent).push(area.id);
  }
  const stack = [...ids];
  while (stack.length) {
    for (const childId of childAreaIds.get(stack.pop()) || []) {
      if (!ids.has(childId)) { ids.add(childId); stack.push(childId); }
    }
  }
  return ids;
}

// Builds the ordered sidebar tree: at every level, sub-Areas first in manual order, then
// Projects in the order they arrive (already sorted by session recency upstream).
export function buildSidebarTree({ areas = [], assignments = [], projects = [], filters = {} } = {}) {
  const filterActive = !!filters.active;
  // Areas the caller wants on screen whatever the filter says — the one being named, which
  // is empty by construction and would otherwise vanish the moment it is created.
  const kept = new Set(filters.keepAreaIds || []);
  // A name match (VIN-80) shows the matched Area expanded with its whole subtree, so every Area in
  // that subtree is revealed past the empty-shell rule below.
  const revealed = subtreeAreaIds(areas, filters.matchedAreaIds || []);

  const areaById = new Map(areas.map(a => [a.id, a]));
  const childAreas = new Map();
  const roots = [];
  for (const area of [...areas].sort(byPosition)) {
    const parent = area.parentId != null && areaById.has(area.parentId) ? area.parentId : null;
    if (parent === null) roots.push(area);
    else {
      if (!childAreas.has(parent)) childAreas.set(parent, []);
      childAreas.get(parent).push(area);
    }
  }

  // An assignment pointing at an Area that is gone leaves its Project ungrouped.
  const areaOfProject = new Map();
  for (const { projectPath, areaId } of assignments) {
    if (areaById.has(areaId)) areaOfProject.set(projectPath, areaId);
  }

  const projectsByArea = new Map();
  const ungrouped = [];
  for (const project of projects) {
    const areaId = areaOfProject.get(project.projectPath);
    if (!areaId) { ungrouped.push(project); continue; }
    if (!projectsByArea.has(areaId)) projectsByArea.set(areaId, []);
    projectsByArea.get(areaId).push(project);
  }

  const projectNode = (project) => ({ type: 'project', projectPath: project.projectPath, project });

  // `seen` breaks cycles left by a corrupt parent chain: an Area is rendered at most once.
  const seen = new Set();
  function build(area) {
    if (seen.has(area.id)) return null;
    seen.add(area.id);
    const node = areaNode(area, filterActive);
    for (const child of childAreas.get(area.id) || []) {
      const built = build(child);
      if (built) node.children.push(built);
    }
    for (const project of projectsByArea.get(area.id) || []) {
      node.children.push(projectNode(project));
    }
    // Under a filter an Area with nothing left to show would render as an empty shell — unless it
    // is kept (a fresh one being named) or revealed by a name match, which shows its subtree whole.
    if (filterActive && node.children.length === 0 && !kept.has(area.id) && !revealed.has(area.id)) return null;
    return node;
  }

  const tree = [];
  for (const area of roots) {
    const node = build(area);
    if (node) tree.push(node);
  }
  for (const project of ungrouped) tree.push(projectNode(project));
  return tree;
}

// Deleting an Area is never destructive (VIN-81): its direct children move up exactly one level
// to become siblings of what contained the Area — its parent, or the root if it was a root Area —
// in the same result. Nothing cascades. Sub-Areas are appended after the new parent's existing
// sub-Areas, in their own manual order. A Project promoted to the root has no Area, so its
// assignment is dropped: the Project is unfiled, not lost. Fresh arrays out; inputs untouched.
export function removeArea(areas = [], assignments = [], areaId) {
  const target = areas.find(a => a.id === areaId);
  if (!target) return { areas: areas.map(a => ({ ...a })), assignments: assignments.map(a => ({ ...a })) };
  const newParent = target.parentId ?? null;

  // Promoted sub-Areas land after the new parent's existing sub-Areas, keeping their own order.
  let nextPos = areas
    .filter(a => a.id !== areaId && (a.parentId ?? null) === newParent)
    .reduce((max, a) => Math.max(max, a.position ?? 0), -1) + 1;
  const promoted = new Map();
  for (const child of areas
    .filter(a => (a.parentId ?? null) === areaId)
    .sort(byPosition)) {
    promoted.set(child.id, nextPos++);
  }

  const nextAreas = areas
    .filter(a => a.id !== areaId)
    .map(a => promoted.has(a.id) ? { ...a, parentId: newParent, position: promoted.get(a.id) } : { ...a });

  const nextAssignments = [];
  for (const assignment of assignments) {
    if (assignment.areaId !== areaId) { nextAssignments.push({ ...assignment }); continue; }
    // Promoting into a parent Area re-files the Project there; promoting to the root unfiles it.
    if (newParent !== null) nextAssignments.push({ ...assignment, areaId: newParent });
  }

  return { areas: nextAreas, assignments: nextAssignments };
}

// Locate a node in a built tree by its id — an Area's `id` or a Project's `projectPath` — and
// report the id of its nearest Area ancestor (null at the root). Returns null when nothing matches.
function locate(nodes, id, areaAncestor = null) {
  for (const node of nodes) {
    const nodeId = node.type === 'area' ? node.id : node.projectPath;
    if (nodeId === id) return { node, areaAncestor };
    if (node.type === 'area') {
      const hit = locate(node.children, id, node.id);
      if (hit) return hit;
    }
  }
  return null;
}

// Every Area id nested anywhere below an Area node (excluding itself).
function descendantAreaIds(root) {
  const ids = new Set();
  const walk = (node) => {
    for (const child of node.children || []) {
      if (child.type === 'area') { ids.add(child.id); walk(child); }
    }
  };
  walk(root);
  return ids;
}

// Filing is direct manipulation (VIN-78): a drop resolves to where the dragged row lands, not to
// the exact pixel it hit. `resolveDrop` reads the built tree and answers with the enclosing Area:
//   { areaId }         — file the dragged Project, or re-parent the dragged Area, here (null = root)
//   { rejected: true } — an Area dropped onto itself or into its own descendant would form a cycle
// A drop always resolves upward to the nearest enclosing Area rather than being rejected — in a
// dense tree non-target rows are most of the surface. Dropping on a Session, Slug or Worktree row
// is expressed by passing that row's Project (or Area) as the target; a target the renderer could
// not map to a tree node, and the empty space below the list, both resolve to the root. The cycle
// guard here is the first line of defence and is re-checked in the main process on the move call.
export function resolveDrop({ tree = [], draggedId, targetId } = {}) {
  let areaId = null;
  if (targetId != null) {
    const hit = locate(tree, targetId);
    if (hit) areaId = hit.node.type === 'area' ? hit.node.id : hit.areaAncestor;
  }

  const dragged = draggedId != null ? locate(tree, draggedId) : null;
  if (dragged && dragged.node.type === 'area') {
    if (areaId === draggedId) return { rejected: true };
    if (areaId != null && descendantAreaIds(dragged.node).has(areaId)) return { rejected: true };
  }

  return { areaId };
}
