// Linear access for the sandcastle orchestrator — issue trees, eligibility, state.
//
// Everything goes through the `linear` CLI (see .linear.toml), which already
// holds the workspace credentials. We use `linear api` for reads because the
// orchestrator needs the parent/children edges the higher-level commands don't
// expose.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "./config.mts";

const exec = promisify(execFile);

const INELIGIBLE_STATE_TYPES = new Set(["completed", "canceled", "duplicate"]);

export interface Issue {
  id: string;
  title: string;
  description: string;
  url: string;
  stateName: string;
  stateType: string;
  labels: string[];
  parent: string | null;
  children: Issue[];
}

/** An issue is workable when it carries the agent label and isn't closed out. */
export function isEligible(issue: Issue): boolean {
  return (
    issue.labels.includes(config.linear.label) &&
    !INELIGIBLE_STATE_TYPES.has(issue.stateType)
  );
}

/** Leaves are the work items; intermediate nodes are specs (see implement-prompt). */
export function leavesOf(root: Issue): Issue[] {
  if (root.children.length === 0) return [root];
  return root.children.flatMap(leavesOf);
}

export function descendantIds(root: Issue): Set<string> {
  const ids = new Set<string>();
  const walk = (node: Issue) => {
    for (const child of node.children) {
      ids.add(child.id);
      walk(child);
    }
  };
  walk(root);
  return ids;
}

async function linearApi<T>(
  query: string,
  variables: Record<string, string> = {},
): Promise<T> {
  const args = ["api", query];
  for (const [key, value] of Object.entries(variables)) {
    args.push("--variable", `${key}=${value}`);
  }

  const { stdout } = await exec("linear", args, { maxBuffer: 32 * 1024 * 1024 });
  const payload = JSON.parse(stdout);

  if (payload.errors?.length) {
    throw new Error(`Linear API: ${JSON.stringify(payload.errors)}`);
  }

  return payload.data as T;
}

interface RawIssue {
  identifier: string;
  title: string;
  description: string | null;
  url: string;
  state: { name: string; type: string };
  labels: { nodes: { name: string }[] };
  parent: { identifier: string } | null;
  children: { nodes: { identifier: string }[] };
}

const ISSUE_FIELDS = `
  identifier
  title
  description
  url
  state { name type }
  labels { nodes { name } }
  parent { identifier }
  children { nodes { identifier } }
`;

async function fetchIssue(id: string): Promise<RawIssue> {
  const data = await linearApi<{ issue: RawIssue | null }>(
    `query($id:String!){issue(id:$id){${ISSUE_FIELDS}}}`,
    { id },
  );

  if (!data.issue) throw new Error(`Issue ${id} not found in Linear`);
  return data.issue;
}

function toIssue(raw: RawIssue, children: Issue[]): Issue {
  return {
    id: raw.identifier,
    title: raw.title,
    description: raw.description ?? "",
    url: raw.url,
    stateName: raw.state.name,
    stateType: raw.state.type,
    labels: raw.labels.nodes.map((l) => l.name),
    parent: raw.parent?.identifier ?? null,
    children,
  };
}

/**
 * Fetch an issue and its full subtree. Children are resolved one request per
 * node — trees are small (a handful of issues) and this keeps the query flat
 * instead of hard-coding a nesting depth.
 */
export async function fetchIssueTree(id: string): Promise<Issue> {
  const raw = await fetchIssue(id);
  const children = await Promise.all(
    raw.children.nodes.map((child) => fetchIssueTree(child.identifier)),
  );
  return toIssue(raw, children);
}

/**
 * Roots to work when no IDs are given: every eligible issue in the project,
 * walked up to its topmost ancestor. Walking up matters because a parent spec
 * is often already Done while its children are still open.
 */
export async function discoverRootIds(): Promise<string[]> {
  // A project scope is optional — some repos select on label alone.
  const { project, label } = config.linear;
  const projectParam = project ? ",$project:String!" : "";
  const projectFilter = project ? "project:{name:{eq:$project}}," : "";

  const data = await linearApi<{
    issues: { nodes: { identifier: string; parent: { identifier: string } | null }[] };
  }>(
    `query($label:String!${projectParam}){
      issues(first:250,filter:{
        ${projectFilter}
        state:{type:{nin:["completed","canceled"]}},
        labels:{name:{eq:$label}}
      }){nodes{identifier parent{identifier}}}
    }`,
    project ? { project, label } : { label },
  );

  const roots = new Set<string>();
  for (const node of data.issues.nodes) {
    let current = node.identifier;
    let parent = node.parent?.identifier ?? null;
    while (parent) {
      current = parent;
      parent = (await fetchIssue(current)).parent?.identifier ?? null;
    }
    roots.add(current);
  }

  return [...roots].sort();
}

export async function setState(id: string, state: string): Promise<void> {
  await exec("linear", ["issue", "update", id, "--state", state]);
}

/**
 * Progress reporting, not control flow — a workspace whose states are named
 * differently must not take a run down with it.
 */
export async function trySetState(id: string, state: string): Promise<void> {
  try {
    await setState(id, state);
  } catch (cause) {
    console.error(
      `[${id}] could not move to "${state}": ${(cause as Error).message}`,
    );
  }
}
