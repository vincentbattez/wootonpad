// Every time the deterministic route gave way, as one JSON object per line.
//
// ADR 0013 makes the exception path a converging loop: an agent unblocks the
// run *and* leaves a record, so that class of failure can be scripted next time
// round. Without the record the loop never closes — the run recovers, nobody
// learns, and the same conflict is paid for in tokens every week.
//
// A failed write is swallowed on purpose: an incident is a note to a human, and
// dropping the run to file one would defeat the point of recovering at all.

import { appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SANDCASTLE_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const LOG = join(SANDCASTLE_DIR, "incidents.jsonl");

export type IncidentKind =
  /** A leaf's own work stopped merging into its base and was dropped. */
  | "leaf-restarted"
  /** A wave base needed judgement to assemble. */
  | "wave-base-escalated"
  /** An integration branch conflicted or went red and needed an agent. */
  | "integration-escalated"
  /** An integration branch shipped unfinished, or without every leaf. */
  | "shipped-incomplete"
  /** A leaf spent its wall-clock budget without finishing. */
  | "leaf-timeout";

export interface Incident {
  kind: IncidentKind;
  rootId: string;
  /** The leaf it happened on, when it happened on one. */
  leafId?: string;
  /** What a human needs to know to script this case away. */
  detail: string;
}

export function fileIncident(incident: Incident): void {
  try {
    appendFileSync(
      LOG,
      `${JSON.stringify({ at: new Date().toISOString(), ...incident })}\n`,
    );
  } catch {
    // See above: never fatal.
  }
}
