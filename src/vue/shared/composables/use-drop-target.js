import { ref } from 'vue';
import { store } from '../../store.js';
import { api } from '../services/api.js';
import { buildSidebarTree, resolveDrop } from '../../area-tree.mjs';

// The sidebar's drag-and-drop filing (VIN-78), written once for the three rows that share the
// same drop semantics: the Project row, the Area row and the sidebar root. The decisions — where
// a drop lands and whether it would form a cycle — live in the pure area-tree module; this
// composable tracks the dragged row, talks to the main process, mirrors the result into the store
// so the sidebar updates at once, and hands each caller the hover flag and the DOM handlers to
// bind. The dragged row is module-level state, shared across every drop target on screen.

// The row being dragged: { type: 'area' | 'project', id }. id is an Area id or a Project path.
let dragged = null;

export function isDragging() {
  return dragged != null;
}

function startDrag(type, id, ev) {
  dragged = { type, id };
  if (ev?.dataTransfer) {
    ev.dataTransfer.effectAllowed = 'move';
    // Firefox/Electron require some payload for a drag to begin; the id is enough.
    try { ev.dataTransfer.setData('text/plain', id); } catch {}
  }
}

function endDrag() {
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
async function dropOnTarget(targetId) {
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

// One drop target. Pass `type` + `id` for a draggable row (a Project path or an Area id); omit
// them for a plain drop zone like the sidebar root, which files onto null. `guardHover` gates the
// hover highlight on an in-flight drag — the Project row and the root only light up for a row being
// dragged, the Area row lights up for anything (it also accepts an OS image file). `onFileDrop`,
// when given, is offered a dropped image file before the row-move resolution runs.
export function useDropTarget({ type, id, guardHover = true, onFileDrop = null } = {}) {
  const dropHover = ref(false);
  const resolveId = typeof id === 'function' ? id : () => id;

  function onDragStart(ev) {
    if (type) startDrag(type, resolveId(), ev);
  }
  function onDragEnd() {
    endDrag();
    dropHover.value = false;
  }
  function onDragOver() {
    if (!guardHover || isDragging()) dropHover.value = true;
  }
  function onDragLeave() {
    dropHover.value = false;
  }
  async function onDrop(ev) {
    dropHover.value = false;
    if (onFileDrop) {
      const file = [...(ev?.dataTransfer?.files || [])].find(f => f.type.startsWith('image/'));
      if (file) { await onFileDrop(file); return; }
      if (!isDragging()) return;
    }
    await dropOnTarget(type ? resolveId() : null);
  }

  return { dropHover, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop, isDragging };
}
