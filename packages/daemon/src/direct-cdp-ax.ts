interface AXNode {
  nodeId: string;
  ignored: boolean;
  role?: { type: string; value?: string };
  name?: { type: string; value?: string; sources?: unknown[] };
  properties?: Array<{
    name: string;
    value: { type: string; value?: unknown };
  }>;
  childIds?: string[];
  backendDOMNodeId?: number;
}

interface AXRefInfo {
  backendDOMNodeId: number;
  role: string;
  name?: string;
  nth?: number;
}

export interface AXFormatOptions {
  interactive?: boolean;
  compact?: boolean;
  maxDepth?: number;
}

export interface AXFormatResult {
  snapshot: string;
  refs: Record<string, AXRefInfo>;
}

const INTERACTIVE_ROLES = new Set([
  "button", "link", "textbox", "searchbox", "combobox", "listbox",
  "checkbox", "radio", "slider", "spinbutton", "switch",
  "tab", "menuitem", "menuitemcheckbox", "menuitemradio",
  "option", "treeitem",
]);

const SKIP_ROLES = new Set(["none", "InlineTextBox", "LineBreak", "Ignored"]);
const CONTENT_ROLES_WITH_REF = new Set(["heading", "img", "cell", "columnheader", "rowheader"]);

interface RoleNameTracker {
  counts: Map<string, number>;
  refsByKey: Map<string, string[]>;
  getKey(role: string, name?: string): string;
  getNextIndex(role: string, name?: string): number;
  trackRef(role: string, name: string | undefined, ref: string): void;
  getDuplicateKeys(): Set<string>;
}

function createRoleNameTracker(): RoleNameTracker {
  const counts = new Map<string, number>();
  const refsByKey = new Map<string, string[]>();
  return {
    counts,
    refsByKey,
    getKey(role: string, name?: string): string {
      return `${role}:${name ?? ""}`;
    },
    getNextIndex(role: string, name?: string): number {
      const key = this.getKey(role, name);
      const current = counts.get(key) ?? 0;
      counts.set(key, current + 1);
      return current;
    },
    trackRef(role: string, name: string | undefined, ref: string): void {
      const key = this.getKey(role, name);
      const refs = refsByKey.get(key) ?? [];
      refs.push(ref);
      refsByKey.set(key, refs);
    },
    getDuplicateKeys(): Set<string> {
      const duplicates = new Set<string>();
      for (const [key, refs] of refsByKey) {
        if (refs.length > 1) duplicates.add(key);
      }
      return duplicates;
    },
  };
}

function getProperty(node: AXNode, propName: string): unknown {
  const prop = node.properties?.find((entry) => entry.name === propName);
  return prop?.value?.value;
}

function truncate(text: string, max = 80): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

function indent(depth: number): string {
  return "  ".repeat(depth);
}

function getIndentLevel(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? Math.floor(match[1].length / 2) : 0;
}

export function formatDirectAXTree(
  nodes: AXNode[],
  urlMap: Map<number, string>,
  options: AXFormatOptions = {},
): AXFormatResult {
  const nodeMap = new Map<string, AXNode>();
  for (const node of nodes) {
    nodeMap.set(node.nodeId, node);
  }

  const rootNode = nodes[0];
  if (!rootNode) {
    return { snapshot: "(empty)", refs: {} };
  }

  const lines: string[] = [];
  const refs: Record<string, AXRefInfo> = {};
  const tracker = createRoleNameTracker();
  let refCounter = 0;

  function nextRef(): string {
    return String(refCounter++);
  }

  function shouldAssignRef(role: string): boolean {
    if (options.interactive) {
      return INTERACTIVE_ROLES.has(role);
    }
    return INTERACTIVE_ROLES.has(role) || CONTENT_ROLES_WITH_REF.has(role);
  }

  function traverse(nodeId: string, depth: number): void {
    const node = nodeMap.get(nodeId);
    if (!node) return;

    if (node.ignored) {
      for (const childId of node.childIds || []) {
        traverse(childId, depth);
      }
      return;
    }

    if (options.maxDepth !== undefined && depth > options.maxDepth) {
      return;
    }

    const role = node.role?.value || "";
    if (SKIP_ROLES.has(role)) {
      for (const childId of node.childIds || []) {
        traverse(childId, depth);
      }
      return;
    }

    const name = node.name?.value?.trim() || "";
    const isInteractive = INTERACTIVE_ROLES.has(role);

    if (options.interactive && !isInteractive) {
      for (const childId of node.childIds || []) {
        traverse(childId, depth);
      }
      return;
    }

    if (role === "StaticText") {
      if (name) {
        lines.push(`${indent(depth)}- text: ${truncate(name, 100)}`);
      }
      return;
    }

    if ((role === "GenericContainer" || role === "generic") && !name) {
      for (const childId of node.childIds || []) {
        traverse(childId, depth);
      }
      return;
    }

    const displayRole = `${role.charAt(0).toLowerCase()}${role.slice(1)}`;
    let line = `${indent(depth)}- ${displayRole}`;

    if (name) {
      line += ` "${truncate(name, 50)}"`;
    }

    const level = getProperty(node, "level");
    if (level !== undefined) {
      line += ` [level=${level}]`;
    }

    const hasBackendId = node.backendDOMNodeId !== undefined;
    if (shouldAssignRef(role) && hasBackendId) {
      const ref = nextRef();
      const nth = tracker.getNextIndex(role, name || undefined);
      tracker.trackRef(role, name || undefined, ref);

      line += ` [ref=${ref}]`;
      if (nth > 0) line += ` [nth=${nth}]`;

      refs[ref] = {
        backendDOMNodeId: node.backendDOMNodeId!,
        role: displayRole,
        name: name || undefined,
        nth,
      };
    }

    if (!options.interactive && role === "link" && node.backendDOMNodeId !== undefined) {
      const url = urlMap.get(node.backendDOMNodeId);
      if (url) {
        lines.push(line);
        lines.push(`${indent(depth + 1)}- /url: ${url}`);
        for (const childId of node.childIds || []) {
          traverse(childId, depth + 1);
        }
        return;
      }
    }

    lines.push(line);
    if (options.interactive) return;

    for (const childId of node.childIds || []) {
      traverse(childId, depth + 1);
    }
  }

  traverse(rootNode.nodeId, 0);

  const duplicateKeys = tracker.getDuplicateKeys();
  for (const refInfo of Object.values(refs)) {
    const key = tracker.getKey(refInfo.role, refInfo.name);
    if (!duplicateKeys.has(key)) {
      delete refInfo.nth;
    }
  }

  const cleanedLines = lines.map((line) => {
    if (line.includes("[nth=0]")) {
      return line.replace(" [nth=0]", "");
    }
    const refMatch = line.match(/\[ref=(\d+)\].*\[nth=\d+\]/);
    if (refMatch) {
      const refInfo = refs[refMatch[1]];
      if (refInfo) {
        const key = tracker.getKey(refInfo.role, refInfo.name);
        if (!duplicateKeys.has(key)) {
          return line.replace(/\s*\[nth=\d+\]/, "");
        }
      }
    }
    return line;
  });

  let snapshot = cleanedLines.join("\n");
  if (options.compact) {
    snapshot = compactTree(snapshot);
  }

  return { snapshot: snapshot || "(empty)", refs };
}

function compactTree(tree: string): string {
  const lines = tree.split("\n");
  const result: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.includes("[ref=") || line.includes("- text:") || line.includes('- /url:') || line.includes('"')) {
      result.push(line);
      continue;
    }

    const currentIndent = getIndentLevel(line);
    let hasRelevantChildren = false;
    for (let childIndex = index + 1; childIndex < lines.length; childIndex += 1) {
      const childIndent = getIndentLevel(lines[childIndex]);
      if (childIndent <= currentIndent) break;
      if (lines[childIndex].includes("[ref=") || lines[childIndex].includes('"') || lines[childIndex].includes("- text:")) {
        hasRelevantChildren = true;
        break;
      }
    }

    if (hasRelevantChildren) {
      result.push(line);
    }
  }

  return result.join("\n");
}
