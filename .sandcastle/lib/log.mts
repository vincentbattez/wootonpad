// Colour-coded phase tags, so a run's interleaved output reads at a glance.
//
// One colour per phase: plan orange, implement blue, review green. Integration
// keeps the terminal's default — it is sequential and never interleaved.

export type LogPhase = "plan" | "implement" | "review" | "integrate";

/** 256-colour codes, close enough to the named colours on any theme. */
const PHASE_COLOR: Record<LogPhase, number | null> = {
  plan: 208,
  implement: 39,
  review: 41,
  integrate: null,
};

/** Honour NO_COLOR and pipes — a log file should not carry escape codes. */
const enabled = process.env.NO_COLOR === undefined && process.stdout.isTTY;

function paint(phase: LogPhase, text: string): string {
  const color = PHASE_COLOR[phase];
  if (!enabled || color === null) return text;
  return `\u001b[38;5;${color}m${text}\u001b[0m`;
}

/** `[plan] [VIN-12] message`, the phase tag coloured, the rest untouched. */
function format(phase: LogPhase, message: string): string {
  return `${paint(phase, `[${phase}]`)} ${message}`;
}

export function phaseLog(phase: LogPhase, message: string): void {
  console.log(format(phase, message));
}

export function phaseError(phase: LogPhase, message: string): void {
  console.error(format(phase, message));
}
