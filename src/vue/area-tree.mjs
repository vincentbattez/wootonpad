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

// Builds the ordered sidebar tree: at every level, sub-Areas first in manual order, then
// Projects in the order they arrive (already sorted by session recency upstream).
export function buildSidebarTree({ areas = [], assignments = [], projects = [], filters = {} } = {}) {
  const filterActive = !!filters.active;
  // Areas the caller wants on screen whatever the filter says — the one being named, which
  // is empty by construction and would otherwise vanish the moment it is created.
  const kept = new Set(filters.keepAreaIds || []);

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

  // Only the last assignment for a path counts; one pointing at an unknown Area unfiles it.
  const areaOfProject = new Map();
  for (const { projectPath, areaId } of assignments) {
    if (areaById.has(areaId)) areaOfProject.set(projectPath, areaId);
  }

  const projectsByArea = new Map();
  const unfiled = [];
  for (const project of projects) {
    const areaId = areaOfProject.get(project.projectPath);
    if (!areaId) { unfiled.push(project); continue; }
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
    // Under a filter an Area with nothing left to show would render as an empty shell.
    if (filterActive && node.children.length === 0 && !kept.has(area.id)) return null;
    return node;
  }

  const tree = [];
  for (const area of roots) {
    const node = build(area);
    if (node) tree.push(node);
  }
  for (const project of unfiled) tree.push(projectNode(project));
  return tree;
}
