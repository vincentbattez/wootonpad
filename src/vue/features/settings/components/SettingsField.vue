<template>
  <div class="settings-field" :class="fieldClass">
    <div class="settings-field-info">
      <!-- Override-capable fields carry the label and the "use global default" toggle in a
           header row; the toggle itself only appears when editing a Project's overrides. -->
      <template v-if="overridable">
        <div class="settings-field-header">
          <span class="settings-label">{{ label }}</span>
          <label v-if="isProject" class="settings-use-global">
            <input type="checkbox" :checked="useGlobal" @change="$emit('update:useGlobal', $event.target.checked)" />
            Use global default
          </label>
        </div>
        <div class="settings-description"><slot name="description">{{ description }}</slot></div>
      </template>
      <!-- Plain (global-only) fields have no override toggle: label then description. -->
      <template v-else>
        <span class="settings-label">{{ label }}</span>
        <div class="settings-description"><slot name="description">{{ description }}</slot></div>
      </template>
    </div>
    <div class="settings-field-control" :class="controlClass">
      <slot />
    </div>
  </div>
</template>

<script setup>
// The inherit-from-global / override-per-Project pattern, encoded once. Every setting is an
// entry wrapping its own control in the default slot; the field draws the label, the optional
// "use global default" checkbox and the description around it. Dumb: it takes props and emits
// `update:useGlobal`, so the edge Container owns whether a field is overridden.
defineProps({
  label: { type: String, default: '' },
  description: { type: String, default: '' },
  // Whether this field supports the global/override toggle (Claude CLI, launch and run
  // options do; the global-only Application/Git/Integrations/Updates fields do not).
  overridable: { type: Boolean, default: false },
  // Whether the panel is editing a Project (the toggle only shows then).
  isProject: { type: Boolean, default: false },
  // The toggle state: true when this field inherits the global value.
  useGlobal: { type: Boolean, default: false },
  // Extra classes on the field wrapper (settings-field-wide, settings-field-secondary, …).
  fieldClass: { type: [String, Array, Object], default: '' },
  // Extra classes on the control wrapper (settings-font-control, settings-field-control--full).
  controlClass: { type: [String, Array, Object], default: '' },
});

defineEmits(['update:useGlobal']);
</script>
