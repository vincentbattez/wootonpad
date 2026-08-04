// Available monospace fonts for terminal sessions.
// Each entry: { label, family } — family is passed directly to xterm's fontFamily option.
// 'Symbols Nerd Font Mono' is appended everywhere: Chromium won't fall back reliably
// for Private Use Area glyphs (statusline icons), so the symbol font must be named.
const NF_FALLBACK = "'Symbols Nerd Font Mono', 'Symbols Nerd Font'";

window.TERMINAL_FONTS = {
  'default':          { label: 'System Default',     family: `'SF Mono', Menlo, 'Cascadia Code', ${NF_FALLBACK}, monospace` },
  'meslo-nerd':       { label: 'MesloLGS Nerd Font', family: `'MesloLGS Nerd Font Mono', 'MesloLGS Nerd Font', ${NF_FALLBACK}, monospace` },
  'hack-nerd':        { label: 'Hack Nerd Font',     family: `'Hack Nerd Font Mono', 'Hack Nerd Font', ${NF_FALLBACK}, monospace` },
  'jetbrains-mono':   { label: 'JetBrains Mono',     family: `'JetBrains Mono', ${NF_FALLBACK}, monospace` },
  'fira-code':        { label: 'Fira Code',          family: `'Fira Code', ${NF_FALLBACK}, monospace` },
  'source-code-pro':  { label: 'Source Code Pro',    family: `'Source Code Pro', ${NF_FALLBACK}, monospace` },
  'mononoki':         { label: 'mononoki',           family: `'mononoki', ${NF_FALLBACK}, monospace` },
  'disket-mono':      { label: 'Disket Mono',        family: `'Disket Mono', ${NF_FALLBACK}, monospace` },
  'liberation-mono':  { label: 'Liberation Mono',    family: `'Liberation Mono', ${NF_FALLBACK}, monospace` },
  'luculent':         { label: 'Luculent',           family: `'Luculent', ${NF_FALLBACK}, monospace` },
  'meslo':            { label: 'Meslo LG',           family: `'Meslo LG', ${NF_FALLBACK}, monospace` },
};
