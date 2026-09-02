<template>
  <div class="settings-panel">
    <div class="settings-panel-header">
      <span class="settings-panel-title">{{ title }}</span>
    </div>

    <div class="settings-panel-body">
      <div v-if="loading" class="settings-loading">Loading…</div>
      <div v-else class="settings-form">

        <!-- ── Claude CLI Options ───────────────────────────────── -->
        <div class="settings-section">
          <div class="settings-section-title">Claude CLI Options</div>

          <SettingsField label="Permission Mode" overridable :is-project="isProject"
            :use-global="useGlobal.permissionMode" @update:use-global="useGlobal.permissionMode = $event">
            <template #description>Permission mode passed to the <code>claude</code> command</template>
            <select class="settings-select" v-model="form.permissionMode" :disabled="isProject && useGlobal.permissionMode">
              <option value="">Default (none)</option>
              <option value="acceptEdits">Accept Edits</option>
              <option value="plan">Plan Mode</option>
              <option value="dontAsk">Don't Ask</option>
              <option value="bypassPermissions">Bypass</option>
            </select>
          </SettingsField>

          <SettingsField label="Worktree" description="Enable worktree for new sessions" overridable :is-project="isProject"
            :use-global="useGlobal.worktree" @update:use-global="useGlobal.worktree = $event">
            <SbSwitch v-model="form.worktree" :disabled="isProject && useGlobal.worktree" />
          </SettingsField>

          <SettingsField label="Worktree Name" description="Custom name for worktree branches" overridable :is-project="isProject"
            :use-global="useGlobal.worktreeName" @update:use-global="useGlobal.worktreeName = $event">
            <input type="text" class="settings-input" v-model="form.worktreeName"
              placeholder="auto" :disabled="isProject && useGlobal.worktreeName" style="width:140px" />
          </SettingsField>

          <SettingsField label="Chrome" description="Enable Chrome browser automation" overridable :is-project="isProject"
            :use-global="useGlobal.chrome" @update:use-global="useGlobal.chrome = $event">
            <SbSwitch v-model="form.chrome" :disabled="isProject && useGlobal.chrome" />
          </SettingsField>

          <SettingsField label="Additional Directories" description="Extra directories to include in Claude sessions"
            overridable :is-project="isProject" field-class="settings-field-wide"
            :use-global="useGlobal.addDirs" @update:use-global="useGlobal.addDirs = $event">
            <input type="text" class="settings-input" v-model="form.addDirs"
              placeholder="/path/to/dir1, /path/to/dir2" :disabled="isProject && useGlobal.addDirs" />
          </SettingsField>
        </div>

        <!-- ── Session Launch ──────────────────────────────────── -->
        <div class="settings-section">
          <div class="settings-section-title">Session Launch</div>

          <SettingsField label="Pre-launch Command" description="Prepended to the claude command (e.g. &quot;aws-vault exec profile --&quot;)"
            overridable :is-project="isProject" field-class="settings-field-wide"
            :use-global="useGlobal.preLaunchCmd" @update:use-global="useGlobal.preLaunchCmd = $event">
            <input type="text" class="settings-input" v-model="form.preLaunchCmd"
              placeholder="e.g. aws-vault exec profile --" :disabled="isProject && useGlobal.preLaunchCmd" />
          </SettingsField>
        </div>

        <!-- ── External IDE ────────────────────────────────────── -->
        <div class="settings-section">
          <div class="settings-section-title">External IDE</div>

          <SettingsField label="Launch Command" overridable :is-project="isProject" field-class="settings-field-wide"
            :use-global="useGlobal.externalIdeCommand" @update:use-global="useGlobal.externalIdeCommand = $event">
            <template #description>
              Run to open a Project folder. Use {path} to place the folder, or omit it and it is appended.
              Do not quote {path} yourself.
            </template>
            <input type="text" class="settings-input" v-model="form.externalIdeCommand" list="external-ide-presets"
              placeholder="e.g. code {path}" :disabled="isProject && useGlobal.externalIdeCommand" />
            <datalist id="external-ide-presets">
              <option v-for="preset in externalIdePresets" :key="preset.command" :value="preset.command">{{ preset.name }}</option>
            </datalist>
          </SettingsField>
        </div>

        <!-- ── Run Project ─────────────────────────────────────── -->
        <div class="settings-section">
          <div class="settings-section-title">Run Project</div>

          <SettingsField label="Run Command" overridable :is-project="isProject" field-class="settings-field-wide"
            :use-global="useGlobal.runCommand" @update:use-global="useGlobal.runCommand = $event">
            <template #description>
              Typed into a Run Terminal opened in the Project Folder. Sent verbatim — write it as you would type it.
            </template>
            <input type="text" class="settings-input" v-model="form.runCommand"
              placeholder="e.g. npm run dev" :disabled="isProject && useGlobal.runCommand" />
          </SettingsField>
        </div>

        <!-- ── Application (global only) ──────────────────────── -->
        <template v-if="!isProject">
          <div class="settings-section">
            <div class="settings-section-title">Application</div>

            <SettingsField label="Theme" description="Appearance of the whole application">
              <select class="settings-select" v-model="form.theme">
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="system">System</option>
              </select>
            </SettingsField>

            <SettingsField label="Neutral tone" description="Tint of the greys. Mauve is the default; the others are provided as-is."
              field-class="settings-field-secondary">
              <select class="settings-select" v-model="form.neutralTone">
                <option value="mauve">Mauve</option>
                <option value="gray">Gray</option>
                <option value="slate">Slate</option>
                <option value="sage">Sage</option>
                <option value="olive">Olive</option>
                <option value="sand">Sand</option>
              </select>
            </SettingsField>

            <SettingsField label="Terminal Theme" description="Color theme for terminal sessions. Auto follows the app's light/dark theme.">
              <select class="settings-select" v-model="form.terminalTheme">
                <option value="auto">Auto (match app theme)</option>
                <option v-for="(theme, key) in terminalThemes" :key="key" :value="key">{{ theme.label }}</option>
              </select>
            </SettingsField>

            <SettingsField label="Terminal Font" description="Monospace font for terminal sessions"
              field-class="settings-field-wide" control-class="settings-font-control">
              <select class="settings-select" v-model="form.monoFont">
                <option v-for="(font, key) in terminalFonts" :key="key" :value="key">{{ font.label }}</option>
              </select>
              <span class="settings-font-preview" :style="{ fontFamily: terminalFonts[form.monoFont]?.family }">
                fn main() { println!("Hello, 世界"); }
              </span>
            </SettingsField>

            <SettingsField label="App Font" description="Font for the application interface (sidebar, labels, viewer)"
              field-class="settings-field-wide" control-class="settings-font-control">
              <select class="settings-select" v-model="form.uiFont">
                <option v-for="(font, key) in terminalFonts" :key="key" :value="key">{{ font.label }}</option>
              </select>
              <span class="settings-font-preview" :style="{ fontFamily: terminalFonts[form.uiFont]?.family }">
                Wooton Pad — 42 sessions
              </span>
            </SettingsField>

            <SettingsField label="Shell Profile" description="Shell used for terminal and Claude sessions. Changes take effect for new sessions only.">
              <select class="settings-select" v-model="form.shellProfile">
                <option value="auto">Auto (detect)</option>
                <option v-for="p in shellProfiles" :key="p.id" :value="p.id">{{ p.name }}</option>
              </select>
            </SettingsField>

            <SettingsField label="Max Visible Sessions" description="Show up to this many sessions before collapsing the rest behind &quot;+N older&quot;">
              <input type="number" class="settings-input settings-input-compact"
                v-model.number="form.visibleSessionCount" min="1" max="100" />
            </SettingsField>

            <SettingsField label="Session Max Age (days)" description="Sessions older than this are hidden behind &quot;+N older&quot; even if under the count limit">
              <input type="number" class="settings-input settings-input-compact"
                v-model.number="form.sessionMaxAgeDays" min="1" max="365" />
            </SettingsField>

            <SettingsField label="IDE Emulation" description="Emulate an IDE so Claude can open files and diffs in a side panel. Disable to use your own IDE instead. Changes take effect for new sessions only.">
              <SbSwitch v-model="form.mcpEmulation" />
            </SettingsField>

            <SettingsField label="Show Avatars" description="Show project initials avatars on session groups and grid cards">
              <SbSwitch v-model="form.showAvatars" />
            </SettingsField>
          </div>

          <!-- ── Git ───────────────────────────────────────────── -->
          <div class="settings-section">
            <div class="settings-section-title">Git</div>
            <SettingsField label="Commit Message Prompt"
              description="Instruction sent to Claude CLI when generating a commit message. The git diff is appended automatically. Leave empty to use the default."
              field-class="settings-field--column" control-class="settings-field-control--full">
              <textarea
                class="settings-textarea"
                v-model="form.commitMessagePrompt"
                placeholder="Enter prompt…"
                rows="5"
              ></textarea>
              <button class="settings-reset-btn" @click="form.commitMessagePrompt = ''" v-if="form.commitMessagePrompt">Reset to default</button>
            </SettingsField>
          </div>

          <!-- ── Integrations ──────────────────────────────────────── -->
          <div class="settings-section">
            <div class="settings-section-title">Integrations</div>
            <SettingsField label="GitLab Token" description="Personal access token for GitLab API (read_api scope). Used for downloading project avatars.">
              <input
                type="password"
                class="settings-input"
                v-model="form.gitlabToken"
                placeholder="glpat-…"
                autocomplete="off"
              >
            </SettingsField>
          </div>

          <!-- ── Updates ────────────────────────────────────────── -->
          <div class="settings-section">
            <div class="settings-section-title">Updates</div>
            <SettingsField label="Version">
              <template #description>
                <span v-if="appVersion">v{{ appVersion }}</span>
                <span v-if="updateStatus" class="settings-update-status"> — {{ updateStatus }}</span>
                <a
                  v-if="newVersion"
                  class="settings-update-link"
                  href="#"
                  @click.prevent="$emit('open-releases')"
                >Download v{{ newVersion }} ↗</a>
              </template>
              <SbButton variant="secondary" size="sm" @click="$emit('check-updates')">Check for Updates</SbButton>
            </SettingsField>
          </div>
        </template>

        <!-- ── Action buttons ─────────────────────────────────── -->
        <div class="settings-btn-row">
          <SbButton variant="secondary" size="sm" @click="$emit('cancel')">Cancel</SbButton>
          <SbButton :variant="'primary'" size="sm" @click="$emit('save')" :disabled="saveState === 'saved'">
            {{ saveState === 'saved' ? '✓ Saved' : 'Save Settings' }}
          </SbButton>
          <SbButton v-if="isProject" variant="danger" size="sm" @click="$emit('remove-project')">Hide Project</SbButton>
          <span v-if="ideNotice" class="settings-notice">{{ ideNotice }}</span>
        </div>

      </div>
    </div>
  </div>
</template>

<script setup>
import SettingsField from './SettingsField.vue';
import SbSwitch from '../../../shared/ui/SbSwitch.vue';
import SbButton from '../../../shared/ui/SbButton.vue';

// The Settings panel, made Dumb: every setting is a SettingsField entry wrapping its own
// control. It holds no service and no store — the reactive `form` and `useGlobal` objects
// are handed down by the edge Container and bound with v-model, and the action buttons emit.
defineProps({
  title: { type: String, default: '' },
  loading: { type: Boolean, default: true },
  isProject: { type: Boolean, default: false },
  form: { type: Object, required: true },
  useGlobal: { type: Object, required: true },
  saveState: { type: String, default: 'idle' },
  ideNotice: { type: String, default: '' },
  appVersion: { type: String, default: '' },
  updateStatus: { type: String, default: '' },
  newVersion: { type: String, default: '' },
  shellProfiles: { type: Array, default: () => [] },
  terminalThemes: { type: Object, default: () => ({}) },
  terminalFonts: { type: Object, default: () => ({}) },
  externalIdePresets: { type: Array, default: () => [] },
});

defineEmits(['save', 'cancel', 'remove-project', 'check-updates', 'open-releases']);
</script>
