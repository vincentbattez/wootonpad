// --- Terminal themes ---
//
// The `switchboard` key is the house preset and MUST NOT be renamed: a saved
// `terminalTheme` setting points at it, and a rename without a settings migration
// would silently reset a user's choice on update. The house presets are re-tuned
// onto the Radix neutral ramp so the terminal blends with the app chrome — dark
// background `#121113`, light background `#fdfcfd`. `auto` (the default) resolves
// to `switchboard` in dark mode and `switchboardLight` in light mode; see appearance.js.
//
// The six third-party presets below (Ghostty, Tokyo Night, Catppuccin Mocha,
// Dracula, Nord, Solarized Dark) are recognisable themes chosen deliberately and
// are left untouched — they were never meant to match the chrome.
const TERMINAL_THEMES = {
  switchboard: {
    label: 'Switchboard (dark)',
    background: '#121113', foreground: '#eeeef0', cursor: '#e93d51', selectionBackground: '#3a3550',
    black: '#211f26', red: '#e5484d', green: '#30a46c', yellow: '#ffc53d', blue: '#5472e4', magenta: '#8e4ec6', cyan: '#3db9cf', white: '#b9bbc6',
    brightBlack: '#6f6d78', brightRed: '#ff6369', brightGreen: '#3dd68c', brightYellow: '#ffe066', brightBlue: '#8da4ef', brightMagenta: '#bf7af0', brightCyan: '#7ce3f0', brightWhite: '#eeeef0',
  },
  switchboardLight: {
    label: 'Switchboard (light)',
    background: '#fdfcfd', foreground: '#211f26', cursor: '#e5484d', cursorAccent: '#fdfcfd', selectionBackground: '#d3d1f5', selectionForeground: '#211f26',
    black: '#211f26', red: '#ce2c31', green: '#2a7e3b', yellow: '#9a6700', blue: '#3a5ccc', magenta: '#8145b5', cyan: '#0c7792', white: '#8b8d98',
    brightBlack: '#6f6d78', brightRed: '#e5484d', brightGreen: '#30a46c', brightYellow: '#b8860b', brightBlue: '#5472e4', brightMagenta: '#9c5fd0', brightCyan: '#107d98', brightWhite: '#1c2024',
  },
  solarizedLight: {
    label: 'Solarized Light',
    background: '#fdf6e3', foreground: '#657b83', cursor: '#657b83', cursorAccent: '#fdf6e3', selectionBackground: '#eee8d5', selectionForeground: '#586e75',
    black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900', blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5',
    brightBlack: '#002b36', brightRed: '#cb4b16', brightGreen: '#586e75', brightYellow: '#657b83', brightBlue: '#839496', brightMagenta: '#6c71c4', brightCyan: '#93a1a1', brightWhite: '#fdf6e3',
  },
  catppuccinLatte: {
    label: 'Catppuccin Latte',
    background: '#eff1f5', foreground: '#4c4f69', cursor: '#dc8a78', cursorAccent: '#eff1f5', selectionBackground: '#acb0be', selectionForeground: '#4c4f69',
    black: '#5c5f77', red: '#d20f39', green: '#40a02b', yellow: '#df8e1d', blue: '#1e66f5', magenta: '#ea76cb', cyan: '#179299', white: '#acb0be',
    brightBlack: '#6c6f85', brightRed: '#d20f39', brightGreen: '#40a02b', brightYellow: '#df8e1d', brightBlue: '#1e66f5', brightMagenta: '#ea76cb', brightCyan: '#179299', brightWhite: '#bcc0cc',
  },
  ghostty: {
    label: 'Ghostty',
    background: '#292c33', foreground: '#ffffff', cursor: '#ffffff', cursorAccent: '#363a43', selectionBackground: '#ffffff', selectionForeground: '#292c33',
    black: '#1d1f21', red: '#bf6b69', green: '#b7bd73', yellow: '#e9c880', blue: '#88a1bb', magenta: '#ad95b8', cyan: '#95bdb7', white: '#c5c8c6',
    brightBlack: '#666666', brightRed: '#c55757', brightGreen: '#bcc95f', brightYellow: '#e1c65e', brightBlue: '#83a5d6', brightMagenta: '#bc99d4', brightCyan: '#83beb1', brightWhite: '#eaeaea',
  },
  tokyoNight: {
    label: 'Tokyo Night',
    background: '#1a1b26', foreground: '#c0caf5', cursor: '#c0caf5', selectionBackground: '#33467c',
    black: '#15161e', red: '#f7768e', green: '#9ece6a', yellow: '#e0af68', blue: '#7aa2f7', magenta: '#bb9af7', cyan: '#7dcfff', white: '#a9b1d6',
    brightBlack: '#414868', brightRed: '#f7768e', brightGreen: '#9ece6a', brightYellow: '#e0af68', brightBlue: '#7aa2f7', brightMagenta: '#bb9af7', brightCyan: '#7dcfff', brightWhite: '#c0caf5',
  },
  catppuccinMocha: {
    label: 'Catppuccin Mocha',
    background: '#1e1e2e', foreground: '#cdd6f4', cursor: '#f5e0dc', selectionBackground: '#45475a',
    black: '#45475a', red: '#f38ba8', green: '#a6e3a1', yellow: '#f9e2af', blue: '#89b4fa', magenta: '#f5c2e7', cyan: '#94e2d5', white: '#bac2de',
    brightBlack: '#585b70', brightRed: '#f38ba8', brightGreen: '#a6e3a1', brightYellow: '#f9e2af', brightBlue: '#89b4fa', brightMagenta: '#f5c2e7', brightCyan: '#94e2d5', brightWhite: '#a6adc8',
  },
  dracula: {
    label: 'Dracula',
    background: '#282a36', foreground: '#f8f8f2', cursor: '#f8f8f2', selectionBackground: '#44475a',
    black: '#21222c', red: '#ff5555', green: '#50fa7b', yellow: '#f1fa8c', blue: '#bd93f9', magenta: '#ff79c6', cyan: '#8be9fd', white: '#f8f8f2',
    brightBlack: '#6272a4', brightRed: '#ff6e6e', brightGreen: '#69ff94', brightYellow: '#ffffa5', brightBlue: '#d6acff', brightMagenta: '#ff92df', brightCyan: '#a4ffff', brightWhite: '#ffffff',
  },
  nord: {
    label: 'Nord',
    background: '#2e3440', foreground: '#d8dee9', cursor: '#d8dee9', selectionBackground: '#434c5e',
    black: '#3b4252', red: '#bf616a', green: '#a3be8c', yellow: '#ebcb8b', blue: '#81a1c1', magenta: '#b48ead', cyan: '#88c0d0', white: '#e5e9f0',
    brightBlack: '#4c566a', brightRed: '#bf616a', brightGreen: '#a3be8c', brightYellow: '#ebcb8b', brightBlue: '#81a1c1', brightMagenta: '#b48ead', brightCyan: '#8fbcbb', brightWhite: '#eceff4',
  },
  solarizedDark: {
    label: 'Solarized Dark',
    background: '#002b36', foreground: '#839496', cursor: '#839496', selectionBackground: '#073642',
    black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900', blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5',
    brightBlack: '#002b36', brightRed: '#cb4b16', brightGreen: '#586e75', brightYellow: '#657b83', brightBlue: '#839496', brightMagenta: '#6c71c4', brightCyan: '#93a1a1', brightWhite: '#fdf6e3',
  },
};

if (typeof window !== 'undefined') {
  window.TERMINAL_THEMES = TERMINAL_THEMES;
}

let currentThemeName = 'switchboard';
function getTerminalTheme() {
  return TERMINAL_THEMES[currentThemeName] || TERMINAL_THEMES.switchboard;
}
let TERMINAL_THEME = getTerminalTheme();

// Consumed by the node:test runner, which has no `window`.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TERMINAL_THEMES, getTerminalTheme };
}
