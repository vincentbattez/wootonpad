import { reactive } from 'vue';

export const store = reactive({
  // Project/session data
  projects: [],

  // Session runtime state
  activePtyIds: new Set(),
  activeSessionId: null,
  sessionBusyState: new Map(),
  attentionSessions: new Set(),
  responseReadySessions: new Set(),
  lastActivityTime: new Map(),
  pendingSessions: new Set(),

  // Filter state
  showStarredOnly: false,
  showRunningOnly: false,
  showTodayOnly: false,
  showArchived: false,
  searchMatchIds: null,
  searchMatchProjectPaths: null,

  // Project collapse overrides: projectPath → bool. Absent = fall back to staleness.
  collapsedProjects: {},

  // Areas: the user-authored tree above Projects in the sidebar.
  areas: [],
  areaAssignments: [],
  renamingAreaId: null,

  // Visibility settings
  visibleSessionCount: 10,
  sessionMaxAgeDays: 3,

  // Header state (active session context)
  headerSession: null,
  headerPtyTitle: null,
  headerShellProfile: null,
  headerAccount: null,
  headerAccounts: [],

  // App layout state
  activeTab: 'sessions',
  sidebarCollapsed: false,
  loadingStatus: '',
  accountSwitching: false,
  searchQuery: '',
  searchTitlesOnly: false,

  // Settings panel
  settingsOpen: false,
  settingsScope: 'global',       // 'global' | 'project'
  settingsProjectPath: null,

  // Main area panel visibility (Vue-owned — do not touch via innerHTML/style directly)
  showStats: false,
  showJsonl: false,
  planViewerOpen: false,
  memoryViewerOpen: false,
  gridViewActive: false,
  gridViewerCount: '',

  // Project avatars: projectPath → data: URL string
  avatarDataUrls: {},
  // Area avatars: areaId → data: URL string (null/absent = fall back to initials and colour)
  areaAvatarDataUrls: {},
});
