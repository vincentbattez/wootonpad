<template>
  <SbDialog :open="!!area" overlay-class="add-project-overlay" dialog-class="add-project-dialog area-dialog" @close="close">
    <h3>Area</h3>
    <div class="folder-input-row">
      <input ref="nameInputRef" type="text" class="settings-input" v-model="name"
        placeholder="Area name" autocomplete="off" spellcheck="false"
        @keydown.enter="save">
    </div>
    <!-- Image: drop an image file onto the zone; a preview shows the current image or the
         initials-and-colour fallback, with a clear-image action to return to the fallback. -->
    <div class="area-dialog-image">
      <div class="area-image-dropzone" :class="{ 'drop-target': imageHover }"
        @dragover.prevent="imageHover = true"
        @dragleave="imageHover = false"
        @drop.prevent="onImageDrop">
        <img v-if="imageUrl" class="area-image-preview" :src="imageUrl" alt="">
        <span v-else class="area-image-fallback" :style="{ background: fallback.color }">{{ fallback.initials }}</span>
        <div class="area-image-hint">Drop an image here</div>
      </div>
      <button v-if="imageUrl" class="area-image-clear-btn" @click="clearImage">Clear image</button>
    </div>
    <div class="area-dialog-actions">
      <!-- No confirmation: deleting an Area is reversible (its contents move up a level). -->
      <button class="area-dialog-delete-btn" @click="remove">Delete Area</button>
      <div class="area-dialog-actions-right">
        <button class="add-project-cancel-btn" @click="close">Cancel</button>
        <button class="add-project-add-btn" @click="save">Save</button>
      </div>
    </div>
  </SbDialog>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import SbDialog from '../../../shared/ui/SbDialog.vue';
import { useAreaAvatar } from '../../../shared/composables/use-avatar.js';
import { setAreaImageFromFile, clearAreaImage } from '../area-image.js';
import { dialogStore, closeAreaDialog } from '../../../dialogs/dialog-store.js';
import { useDialogKeys } from '../../../dialogs/use-dialog-keys.js';

const area = computed(() => dialogStore.area);
const name = ref('');
const nameInputRef = ref(null);
const imageHover = ref(false);

// The preview follows the shared avatar composable: it reads the same store cache every AreaAvatar
// does — so a drop or clear updates it at once — and fetches the stored image once when it is not
// cached yet. The fallback initials/colour track the name being edited, so clearing the image
// shows what returns.
const areaId = computed(() => area.value?.id || '');
const fallbackName = computed(() => name.value || area.value?.name || '');
const { dataUrl: imageUrl, fallback } = useAreaAvatar(areaId, fallbackName);

watch(area, async (a) => {
  if (!a) return;
  name.value = a.name || '';
  imageHover.value = false;
  await nextTick();
  nameInputRef.value?.focus();
  nameInputRef.value?.select();
});

useDialogKeys('area', { onEscape: close, onEnter: save });

async function onImageDrop(ev) {
  imageHover.value = false;
  const id = dialogStore.area?.id;
  if (!id) return;
  const file = [...(ev?.dataTransfer?.files || [])].find(f => f.type.startsWith('image/'));
  if (file) await setAreaImageFromFile(id, file);
}

async function clearImage() {
  const id = dialogStore.area?.id;
  if (id) await clearAreaImage(id);
}

function close() { closeAreaDialog(); }

function save() {
  const current = dialogStore.area;
  if (!current) return;
  const trimmed = name.value.trim();
  const cbs = current.cbs;
  close();
  // A free-form, non-unique name; an empty or unchanged name is a no-op, not a rejection.
  if (trimmed && trimmed !== current.name) cbs?.onRename?.(trimmed);
}

function remove() {
  const cbs = dialogStore.area?.cbs;
  close();
  cbs?.onDelete?.();
}
</script>
