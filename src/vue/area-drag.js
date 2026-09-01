// Sidebar drag-and-drop filing (VIN-78). The decisions — where a drop lands and whether it would
// form a cycle — live in the pure area-tree module; this file only tracks the dragged row, talks
// to the main process, and mirrors the result into the store so the sidebar updates at once.

import { store } from './store.js';
import { api } from './shared/services/api.js';
import { buildSidebarTree, resolveDrop } from './area-tree.mjs';

// The row being dragged: { type: 'area' | 'project', id }. id is an Area id or a Project path.
let dragged = null;

export function isDragging() {
  return dragged != null;
}

export function startDrag(type, id, ev) {
  dragged = { type, id };
  if (ev?.dataTransfer) {
    ev.dataTransfer.effectAllowed = 'move';
    // Firefox/Electron require some payload for a drag to begin; the id is enough.
    try { ev.dataTransfer.setData('text/plain', id); } catch {}
  }
}

export function endDrag() {
  dragged = null;
}

// The full normal-view tree, so drop resolution sees every Area and filed Project regardless of
// the active filter (dragging happens in normal view).
function currentTree() {
  return buildSidebarTree({
    areas: store.areas,
    assignments: store.areaAssignments,
    projects: store.projects,
  });
}

// Drop the dragged row onto the row identified by targetId (an Area id or a Project path), or the
// root when targetId is null. Returns true when something was filed, false on a no-op or rejection.
export async function dropOnTarget(targetId) {
  const item = dragged;
  dragged = null;
  if (!item) return false;

  const { areaId, rejected } = resolveDrop({ tree: currentTree(), draggedId: item.id, targetId });
  if (rejected) return false;

  if (item.type === 'project') return fileProject(item.id, areaId ?? null);
  return moveArea(item.id, areaId ?? null);
}

async function fileProject(projectPath, areaId) {
  const current = store.areaAssignments.find(a => a.projectPath === projectPath)?.areaId ?? null;
  if (current === areaId) return false;
  const result = await api.fileProject?.(projectPath, areaId).catch(() => null);
  if (!result?.ok) return false;
  const rest = store.areaAssignments.filter(a => a.projectPath !== projectPath);
  store.areaAssignments = areaId == null ? rest : [...rest, { projectPath, areaId }];
  return true;
}

async function moveArea(id, parentId) {
  const area = store.areas.find(a => a.id === id);
  if (!area) return false;
  if ((area.parentId ?? null) === (parentId ?? null)) return false;
  const result = await api.moveArea?.(id, parentId).catch(() => null);
  // The main process re-checks the cycle guard; a rejected move leaves the store untouched.
  if (!result?.ok) return false;
  store.areas = store.areas.map(a =>
    a.id === id ? { ...a, parentId: result.parentId ?? null, position: result.position } : a);
  return true;
}
