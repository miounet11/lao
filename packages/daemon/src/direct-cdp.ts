import WebSocket from "ws";
import type { RefInfo, Request, Response, ResponseData } from "@iatlas-browser/shared";
import { formatDirectAXTree } from "./direct-cdp-ax.js";
import { DirectCdpRefStore } from "./direct-cdp-ref-store.js";

const DEFAULT_CDP_BASE_URLS = [
  "http://127.0.0.1:9222",
  "http://localhost:9222",
  "http://127.0.0.1:9223",
  "http://localhost:9223",
  "http://127.0.0.1:9333",
  "http://localhost:9333",
];
const CDP_DISCOVERY_TIMEOUT_MS = 1500;
const CDP_COMMAND_TIMEOUT_MS = 10000;

const DIRECT_CDP_SUPPORTED_ACTIONS = [
  "open",
  "snapshot",
  "click",
  "hover",
  "fill",
  "type",
  "eval",
  "get",
  "screenshot",
  "tab_list",
  "tab_new",
  "tab_select",
  "tab_close",
] as const;

type DirectCdpAction = (typeof DIRECT_CDP_SUPPORTED_ACTIONS)[number];

interface CdpVersionInfo {
  webSocketDebuggerUrl: string;
  Browser?: string;
}

interface CdpTargetInfo {
  id: string;
  title: string;
  url: string;
  type: string;
  webSocketDebuggerUrl?: string;
}

interface CdpAccessibilityNode {
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

interface CdpDomNode {
  nodeId: number;
  backendNodeId: number;
  nodeType: number;
  nodeName: string;
  attributes?: string[];
  children?: CdpDomNode[];
  contentDocument?: CdpDomNode;
  shadowRoots?: CdpDomNode[];
}

interface DirectCdpStatus {
  available: boolean;
  endpoint?: string;
  browser?: string;
  reason?: string;
  supportedActions: readonly string[];
}

function isDirectCdpAction(action: string): action is DirectCdpAction {
  return DIRECT_CDP_SUPPORTED_ACTIONS.includes(action as DirectCdpAction);
}

function discoveryBaseUrls(): string[] {
  const explicitList = process.env.IATLAS_BROWSER_CDP_BASE_URLS?.trim();
  const explicit = process.env.IATLAS_BROWSER_CDP_BASE_URL?.trim();
  const candidates = [
    ...(explicitList ? explicitList.split(",") : []),
    ...(explicit ? [explicit] : []),
    ...DEFAULT_CDP_BASE_URLS,
  ];

  return [...new Set(candidates.map((value) => value.trim()).filter(Boolean).map((value) => value.replace(/\/+$/, "")))];
}

interface StoredRefTarget {
  targetId: string;
  ref: RefInfo;
}

async function fetchJson<T>(url: string, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchText(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeoutId);
  }
}

class CdpSession {
  private ws: WebSocket;
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();

  private constructor(ws: WebSocket) {
    this.ws = ws;
  }

  static async connect(wsUrl: string): Promise<CdpSession> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error("CDP connection timeout"));
      }, CDP_COMMAND_TIMEOUT_MS);

      ws.on("open", () => {
        clearTimeout(timeout);
        const session = new CdpSession(ws);
        ws.on("message", (data: unknown) => session.handleMessage(String(data)));
        ws.on("error", (error: unknown) => session.failAll(error instanceof Error ? error : new Error(String(error))));
        ws.on("close", () => session.failAll(new Error("CDP connection closed")));
        resolve(session);
      });

      ws.on("error", (error: unknown) => {
        clearTimeout(timeout);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  async send<T = any>(method: string, params?: Record<string, unknown>): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timeout: ${method}`));
      }, CDP_COMMAND_TIMEOUT_MS);

      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value as T);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async close(): Promise<void> {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
  }

  private handleMessage(raw: string): void {
    const payload = JSON.parse(raw) as { id?: number; result?: any; error?: { message?: string } };
    if (payload.id === undefined) {
      return;
    }

    const pending = this.pending.get(payload.id);
    if (!pending) {
      return;
    }
    this.pending.delete(payload.id);

    if (payload.error) {
      pending.reject(new Error(payload.error.message || "Unknown CDP error"));
      return;
    }
    pending.resolve(payload.result);
  }

  private failAll(error: Error): void {
    for (const [id, pending] of this.pending) {
      this.pending.delete(id);
      pending.reject(error);
    }
  }
}

export class DirectCdpBridge {
  private selectedTargetId: string | null = null;
  private targetIdToSynthetic = new Map<string, number>();
  private syntheticToTargetId = new Map<number, string>();
  private nextSyntheticTabId = 1;
  private readonly refStore = new DirectCdpRefStore();

  async getStatus(): Promise<DirectCdpStatus> {
    try {
      const discovery = await this.discover();
      return {
        available: true,
        endpoint: discovery.baseUrl,
        browser: discovery.version.Browser,
        supportedActions: DIRECT_CDP_SUPPORTED_ACTIONS,
      };
    } catch (error) {
      return {
        available: false,
        reason: error instanceof Error ? error.message : String(error),
        supportedActions: DIRECT_CDP_SUPPORTED_ACTIONS,
      };
    }
  }

  async execute(request: Request): Promise<Response | null> {
    if (!isDirectCdpAction(request.action)) {
      return null;
    }

    try {
      const discovery = await this.discover();
      const data = await this.dispatch(discovery.baseUrl, request);
      return {
        id: request.id,
        success: true,
        data,
      };
    } catch (error) {
      return {
        id: request.id,
        success: false,
        error: this.formatError(error),
      };
    }
  }

  unsupportedMessage(): string {
    return [
      "Chrome extension not connected, and this command is not supported by direct CDP mode.",
      "",
      `Direct CDP subset: ${DIRECT_CDP_SUPPORTED_ACTIONS.join(", ")}`,
      "",
      "To use direct CDP mode, launch Chrome with:",
      "  --remote-debugging-port=9222",
      "",
      "Otherwise load the Chrome extension and reconnect it to the daemon.",
    ].join("\n");
  }

  private async discover(): Promise<{ baseUrl: string; version: CdpVersionInfo }> {
    let lastError: Error | null = null;
    for (const baseUrl of discoveryBaseUrls()) {
      try {
        const version = await fetchJson<CdpVersionInfo>(`${baseUrl}/json/version`, CDP_DISCOVERY_TIMEOUT_MS);
        if (version.webSocketDebuggerUrl) {
          return { baseUrl, version };
        }
        lastError = new Error(`Missing webSocketDebuggerUrl from ${baseUrl}/json/version`);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    throw lastError ?? new Error("CDP discovery failed");
  }

  private async dispatch(baseUrl: string, request: Request): Promise<ResponseData> {
    switch (request.action) {
      case "open":
        return this.open(baseUrl, request);
      case "eval":
        return this.eval(baseUrl, request);
      case "snapshot":
        return this.snapshot(baseUrl, request);
      case "click":
        return this.click(baseUrl, request);
      case "hover":
        return this.hover(baseUrl, request);
      case "fill":
        return this.fill(baseUrl, request);
      case "type":
        return this.type(baseUrl, request);
      case "get":
        return this.get(baseUrl, request);
      case "screenshot":
        return this.screenshot(baseUrl, request);
      case "tab_list":
        return this.tabList(baseUrl);
      case "tab_new":
        return this.tabNew(baseUrl, request);
      case "tab_select":
        return this.tabSelect(baseUrl, request);
      case "tab_close":
        return this.tabClose(baseUrl, request);
      default:
        throw new Error(`Unsupported direct CDP action: ${request.action}`);
    }
  }

  private async listPageTargets(baseUrl: string): Promise<CdpTargetInfo[]> {
    const targets = await fetchJson<CdpTargetInfo[]>(`${baseUrl}/json/list`, CDP_DISCOVERY_TIMEOUT_MS);
    const pages = targets.filter((target) => target.type === "page" && !target.url.startsWith("devtools://"));
    for (const target of pages) {
      this.ensureSyntheticTabId(target.id);
    }
    this.refStore.retain(pages.map((target) => target.id));
    return pages;
  }

  private ensureSyntheticTabId(targetId: string): number {
    const existing = this.targetIdToSynthetic.get(targetId);
    if (existing !== undefined) {
      return existing;
    }
    const tabId = this.nextSyntheticTabId++;
    this.targetIdToSynthetic.set(targetId, tabId);
    this.syntheticToTargetId.set(tabId, targetId);
    return tabId;
  }

  private resolveTargetId(targets: CdpTargetInfo[], request: Request, allowEmpty = false): string | null {
    if (typeof request.tabId === "number") {
      const targetId = this.syntheticToTargetId.get(request.tabId);
      if (!targetId) {
        throw new Error(`Unknown direct-mode tab id: ${request.tabId}`);
      }
      return targetId;
    }

    if (typeof request.index === "number") {
      const target = targets[request.index];
      if (!target) {
        throw new Error(`Tab index out of range: ${request.index}`);
      }
      return target.id;
    }

    if (request.tabId === "current" || request.tabId === undefined) {
      if (this.selectedTargetId && targets.some((target) => target.id === this.selectedTargetId)) {
        return this.selectedTargetId;
      }
      if (allowEmpty && targets.length === 0) {
        return null;
      }
      return targets[0]?.id ?? null;
    }

    throw new Error(`Unsupported direct-mode tab selector: ${String(request.tabId)}`);
  }

  private async open(baseUrl: string, request: Request): Promise<ResponseData> {
    if (!request.url) {
      throw new Error("Missing URL");
    }

    const targets = await this.listPageTargets(baseUrl);
    if (request.tabId === undefined) {
      const created = await fetchJson<CdpTargetInfo>(`${baseUrl}/json/new?${encodeURIComponent(request.url)}`, CDP_COMMAND_TIMEOUT_MS);
      const tabId = this.ensureSyntheticTabId(created.id);
      this.selectedTargetId = created.id;
      return {
        url: created.url,
        title: created.title,
        tabId,
      };
    }

    const targetId = this.resolveTargetId(targets, request, true);
    if (!targetId) {
      const created = await fetchJson<CdpTargetInfo>(`${baseUrl}/json/new?${encodeURIComponent(request.url)}`, CDP_COMMAND_TIMEOUT_MS);
      const tabId = this.ensureSyntheticTabId(created.id);
      this.selectedTargetId = created.id;
      return {
        url: created.url,
        title: created.title,
        tabId,
      };
    }

    const target = targets.find((entry) => entry.id === targetId);
    if (!target?.webSocketDebuggerUrl) {
      throw new Error("Selected tab does not expose a debugger WebSocket URL");
    }

    const session = await CdpSession.connect(target.webSocketDebuggerUrl);
    try {
      await session.send("Page.enable");
      await session.send("Page.navigate", { url: request.url });
      await this.waitForLoad(session);
      this.refStore.clear(targetId);
      const title = await this.evaluateTarget(session, "document.title");
      const url = await this.evaluateTarget(session, "window.location.href");
      this.selectedTargetId = targetId;
      return {
        url: typeof url === "string" ? url : request.url,
        title: typeof title === "string" ? title : target.title,
        tabId: this.ensureSyntheticTabId(targetId),
      };
    } finally {
      await session.close();
    }
  }

  private async eval(baseUrl: string, request: Request): Promise<ResponseData> {
    if (!request.script) {
      throw new Error("Missing script");
    }

    const { target, session } = await this.openSessionForSelectedTarget(baseUrl, request);
    try {
      const result = await this.evaluateTarget(session, request.script, true);
      this.selectedTargetId = target.id;
      return {
        result,
        tabId: this.ensureSyntheticTabId(target.id),
        url: target.url,
        title: target.title,
      };
    } finally {
      await session.close();
    }
  }

  private async snapshot(baseUrl: string, request: Request): Promise<ResponseData> {
    const { target, session } = await this.openSessionForSelectedTarget(baseUrl, request);
    try {
      await session.send("Page.enable");
      await session.send("DOM.enable");
      await session.send("Accessibility.enable");

      let axNodes: CdpAccessibilityNode[];
      if (request.selector) {
        const documentResult = await session.send<{ root: { nodeId: number } }>("DOM.getDocument", { depth: 0 });
        const queryResult = await session.send<{ nodeId: number }>("DOM.querySelector", {
          nodeId: documentResult.root.nodeId,
          selector: request.selector,
        });
        if (!queryResult.nodeId) {
          throw new Error(`Selector "${request.selector}" not found`);
        }
        const partial = await session.send<{ nodes: CdpAccessibilityNode[] }>("Accessibility.getPartialAXTree", {
          nodeId: queryResult.nodeId,
          fetchRelatives: true,
        });
        axNodes = partial.nodes;
      } else {
        const full = await session.send<{ nodes: CdpAccessibilityNode[] }>("Accessibility.getFullAXTree");
        axNodes = full.nodes;
      }

      const linkBackendIds = new Set<number>();
      for (const node of axNodes) {
        if (node.role?.value === "link" && node.backendDOMNodeId !== undefined) {
          linkBackendIds.add(node.backendDOMNodeId);
        }
      }

      const urlMap = await this.buildUrlMap(session, linkBackendIds);
      const formatted = formatDirectAXTree(axNodes, urlMap, {
        interactive: request.interactive,
        compact: request.compact,
        maxDepth: request.maxDepth,
      });

      this.selectedTargetId = target.id;
      this.refStore.save(target.id, {
        refs: formatted.refs,
        tabId: this.ensureSyntheticTabId(target.id),
        url: target.url,
        title: target.title,
        updatedAt: Date.now(),
      });
      return {
        snapshotData: {
          snapshot: formatted.snapshot,
          refs: formatted.refs,
        },
        tabId: this.ensureSyntheticTabId(target.id),
        url: target.url,
        title: target.title,
      };
    } finally {
      await session.close();
    }
  }

  private async get(baseUrl: string, request: Request): Promise<ResponseData> {
    if (request.attribute === "text") {
      const { target, session, ref } = await this.openSessionForStoredRef(baseUrl, request);
      try {
        const value = await this.evaluateOnBackendNode(
          session,
          ref.backendDOMNodeId,
          `function() {
            return (this.textContent || "").trim();
          }`,
        );
        this.selectedTargetId = target.id;
        return {
          value: value === undefined ? "" : String(value),
          tabId: this.ensureSyntheticTabId(target.id),
          url: target.url,
          title: target.title,
        };
      } finally {
        await session.close();
      }
    }

    const { target, session } = await this.openSessionForSelectedTarget(baseUrl, request);
    try {
      let value: unknown;
      if (request.attribute === "title") {
        value = await this.evaluateTarget(session, "document.title");
      } else {
        value = await this.evaluateTarget(session, "window.location.href");
      }
      this.selectedTargetId = target.id;
      return {
        value: value === undefined ? "" : String(value),
        tabId: this.ensureSyntheticTabId(target.id),
        url: target.url,
        title: target.title,
      };
    } finally {
      await session.close();
    }
  }

  private async screenshot(baseUrl: string, request: Request): Promise<ResponseData> {
    const { target, session } = await this.openSessionForSelectedTarget(baseUrl, request);
    try {
      await session.send("Page.enable");
      const result = await session.send<{ data: string }>("Page.captureScreenshot", { format: "png" });
      this.selectedTargetId = target.id;
      return {
        dataUrl: `data:image/png;base64,${result.data}`,
        tabId: this.ensureSyntheticTabId(target.id),
        url: target.url,
        title: target.title,
      };
    } finally {
      await session.close();
    }
  }

  private async click(baseUrl: string, request: Request): Promise<ResponseData> {
    const { target, session, ref } = await this.openSessionForStoredRef(baseUrl, request);
    try {
      const { x, y } = await this.getElementCenter(session, ref.backendDOMNodeId);
      await session.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "left", buttons: 1 });
      await session.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
      await session.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
      this.selectedTargetId = target.id;
      return {
        role: ref.role,
        name: ref.name,
        tabId: this.ensureSyntheticTabId(target.id),
        url: target.url,
        title: target.title,
      } as ResponseData;
    } finally {
      await session.close();
    }
  }

  private async hover(baseUrl: string, request: Request): Promise<ResponseData> {
    const { target, session, ref } = await this.openSessionForStoredRef(baseUrl, request);
    try {
      const { x, y } = await this.getElementCenter(session, ref.backendDOMNodeId);
      await session.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none" });
      this.selectedTargetId = target.id;
      return {
        role: ref.role,
        name: ref.name,
        tabId: this.ensureSyntheticTabId(target.id),
        url: target.url,
        title: target.title,
      } as ResponseData;
    } finally {
      await session.close();
    }
  }

  private async fill(baseUrl: string, request: Request): Promise<ResponseData> {
    if (request.text === undefined) {
      throw new Error("Missing text");
    }

    const { target, session, ref } = await this.openSessionForStoredRef(baseUrl, request);
    try {
      await this.focusBackendNode(session, ref.backendDOMNodeId, true);
      await session.send("Input.insertText", { text: request.text });
      this.selectedTargetId = target.id;
      return {
        role: ref.role,
        name: ref.name,
        tabId: this.ensureSyntheticTabId(target.id),
        url: target.url,
        title: target.title,
      } as ResponseData;
    } finally {
      await session.close();
    }
  }

  private async type(baseUrl: string, request: Request): Promise<ResponseData> {
    if (request.text === undefined) {
      throw new Error("Missing text");
    }

    const { target, session, ref } = await this.openSessionForStoredRef(baseUrl, request);
    try {
      await this.focusBackendNode(session, ref.backendDOMNodeId, false);
      await session.send("Input.insertText", { text: request.text });
      this.selectedTargetId = target.id;
      return {
        role: ref.role,
        name: ref.name,
        tabId: this.ensureSyntheticTabId(target.id),
        url: target.url,
        title: target.title,
      } as ResponseData;
    } finally {
      await session.close();
    }
  }

  private async tabList(baseUrl: string): Promise<ResponseData> {
    const targets = await this.listPageTargets(baseUrl);
    const activeTargetId = this.resolveTargetId(targets, { id: "status", action: "tab_list" }, true) ?? targets[0]?.id ?? null;

    const tabs = targets.map((target, index) => ({
      index,
      url: target.url,
      title: target.title,
      active: target.id === activeTargetId,
      tabId: this.ensureSyntheticTabId(target.id),
    }));

    if (activeTargetId) {
      this.selectedTargetId = activeTargetId;
    }

    return {
      tabs,
      activeIndex: tabs.findIndex((tab) => tab.active),
    };
  }

  private async tabNew(baseUrl: string, request: Request): Promise<ResponseData> {
    const created = await fetchJson<CdpTargetInfo>(
      `${baseUrl}/json/new?${encodeURIComponent(request.url || "about:blank")}`,
      CDP_COMMAND_TIMEOUT_MS,
    );
    const tabId = this.ensureSyntheticTabId(created.id);
    this.selectedTargetId = created.id;
    return {
      tabId,
      url: created.url,
      title: created.title,
    };
  }

  private async tabSelect(baseUrl: string, request: Request): Promise<ResponseData> {
    const targets = await this.listPageTargets(baseUrl);
    const targetId = this.resolveTargetId(targets, request);
    if (!targetId) {
      throw new Error("No browser tabs available");
    }
    await fetchText(`${baseUrl}/json/activate/${targetId}`, CDP_COMMAND_TIMEOUT_MS);
    const target = targets.find((entry) => entry.id === targetId);
    if (!target) {
      throw new Error("Selected tab disappeared");
    }
    this.selectedTargetId = targetId;
    return {
      tabId: this.ensureSyntheticTabId(target.id),
      url: target.url,
      title: target.title,
    };
  }

  private async tabClose(baseUrl: string, request: Request): Promise<ResponseData> {
    const targets = await this.listPageTargets(baseUrl);
    const targetId = this.resolveTargetId(targets, request);
    if (!targetId) {
      throw new Error("No browser tabs available");
    }
    const target = targets.find((entry) => entry.id === targetId);
    await fetchText(`${baseUrl}/json/close/${targetId}`, CDP_COMMAND_TIMEOUT_MS);
    if (this.selectedTargetId === targetId) {
      this.selectedTargetId = null;
    }
    this.refStore.clear(targetId);
    return {
      tabId: target ? this.ensureSyntheticTabId(target.id) : undefined,
      url: target?.url,
      title: target?.title,
    };
  }

  private async buildUrlMap(session: CdpSession, linkBackendIds: Set<number>): Promise<Map<number, string>> {
    if (linkBackendIds.size === 0) {
      return new Map();
    }

    const urlMap = new Map<number, string>();
    try {
      const result = await session.send<{ root: CdpDomNode }>("DOM.getDocument", { depth: -1, pierce: true });
      const walk = (node: CdpDomNode): void => {
        if (linkBackendIds.has(node.backendNodeId)) {
          const attrs = node.attributes || [];
          for (let index = 0; index < attrs.length; index += 2) {
            if (attrs[index] === "href") {
              urlMap.set(node.backendNodeId, attrs[index + 1]);
              break;
            }
          }
        }
        for (const child of node.children || []) walk(child);
        if (node.contentDocument) walk(node.contentDocument);
        for (const shadow of node.shadowRoots || []) walk(shadow);
      };
      walk(result.root);
    } catch {
      // Best-effort URL enrichment only.
    }
    return urlMap;
  }

  private async openSessionForSelectedTarget(baseUrl: string, request: Request): Promise<{ target: CdpTargetInfo; session: CdpSession }> {
    const targets = await this.listPageTargets(baseUrl);
    const targetId = this.resolveTargetId(targets, request);
    if (!targetId) {
      throw new Error("No browser tabs available for direct CDP mode");
    }
    const target = targets.find((entry) => entry.id === targetId);
    if (!target?.webSocketDebuggerUrl) {
      throw new Error("Selected tab does not expose a debugger WebSocket URL");
    }
    const session = await CdpSession.connect(target.webSocketDebuggerUrl);
    return { target, session };
  }

  private async openSessionForStoredRef(
    baseUrl: string,
    request: Request,
  ): Promise<{ target: CdpTargetInfo; session: CdpSession; ref: RefInfo }> {
    if (!request.ref) {
      throw new Error("Missing ref");
    }

    const targets = await this.listPageTargets(baseUrl);
    const stored = this.resolveStoredRef(targets, request);
    const target = targets.find((entry) => entry.id === stored.targetId);

    if (!target?.webSocketDebuggerUrl) {
      throw new Error("Selected ref target does not expose a debugger WebSocket URL");
    }

    const session = await CdpSession.connect(target.webSocketDebuggerUrl);
    return { target, session, ref: stored.ref };
  }

  private resolveStoredRef(targets: CdpTargetInfo[], request: Request): StoredRefTarget {
    if (!request.ref) {
      throw new Error("Missing ref");
    }

    const targetId = this.resolveTargetId(targets, request);
    if (!targetId) {
      throw new Error("No browser tabs available for direct CDP mode");
    }

    const refInfo = this.refStore.get(targetId, request.ref);
    if (!refInfo?.backendDOMNodeId) {
      const snapshot = this.refStore.getSnapshot(targetId);
      const knownRefs = snapshot ? Object.keys(snapshot.refs).slice(0, 20).map((ref) => `@${ref}`).join(", ") : "";
      throw new Error(
        snapshot
          ? `Ref "${request.ref}" not found for the selected direct-CDP tab. Known refs: ${knownRefs || "(none)"}`
          : `Ref "${request.ref}" not found for the selected direct-CDP tab. Run snapshot first to create refs for this tab.`,
      );
    }

    return {
      targetId,
      ref: refInfo,
    };
  }

  private async evaluateOnBackendNode(
    session: CdpSession,
    backendNodeId: number | undefined,
    functionDeclaration: string,
    args: unknown[] = [],
  ): Promise<unknown> {
    if (backendNodeId === undefined) {
      throw new Error("Stored ref is missing backendDOMNodeId");
    }

    const resolved = await session.send<{
      object?: {
        objectId?: string;
      };
    }>("DOM.resolveNode", { backendNodeId });

    const objectId = resolved.object?.objectId;
    if (!objectId) {
      throw new Error("Failed to resolve backend DOM node");
    }

    const response = await session.send<{
      result?: {
        value?: unknown;
        unserializableValue?: string;
      };
      exceptionDetails?: {
        text?: string;
        exception?: { description?: string };
      };
    }>("Runtime.callFunctionOn", {
      objectId,
      functionDeclaration,
      arguments: args.map((value) => ({ value })),
      awaitPromise: true,
      returnByValue: true,
    });

    if (response.exceptionDetails) {
      throw new Error(
        response.exceptionDetails.exception?.description
          || response.exceptionDetails.text
          || "Runtime.callFunctionOn failed",
      );
    }

    if (response.result?.unserializableValue !== undefined) {
      return response.result.unserializableValue;
    }

    return response.result?.value;
  }

  private async getElementCenter(
    session: CdpSession,
    backendNodeId: number | undefined,
  ): Promise<{ x: number; y: number }> {
    const center = await this.evaluateOnBackendNode(
      session,
      backendNodeId,
      `function() {
        this.scrollIntoView({ behavior: "auto", block: "center", inline: "center" });
        const rect = this.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      }`,
    );

    if (!center || typeof center !== "object") {
      throw new Error("Failed to get element center");
    }

    return center as { x: number; y: number };
  }

  private async focusBackendNode(
    session: CdpSession,
    backendNodeId: number | undefined,
    clearExistingValue: boolean,
  ): Promise<void> {
    await this.evaluateOnBackendNode(
      session,
      backendNodeId,
      `function(clearExistingValue) {
        this.scrollIntoView({ behavior: "auto", block: "center", inline: "center" });
        this.focus();

        if (!clearExistingValue) {
          return true;
        }

        if (this.isContentEditable) {
          this.textContent = "";
          this.dispatchEvent(new Event("input", { bubbles: true }));
          this.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }

        const tagName = this.tagName || "";
        if (tagName === "INPUT") {
          const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
          descriptor?.set?.call(this, "");
          this.dispatchEvent(new Event("input", { bubbles: true }));
          this.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }

        if (tagName === "TEXTAREA") {
          const descriptor = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value");
          descriptor?.set?.call(this, "");
          this.dispatchEvent(new Event("input", { bubbles: true }));
          this.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }

        return true;
      }`,
      [clearExistingValue],
    );
  }

  private async evaluateTarget(session: CdpSession, expression: string, returnByValue = true): Promise<unknown> {
    const response = await session.send<{
      result?: {
        value?: unknown;
        type?: string;
        subtype?: string;
        unserializableValue?: string;
        description?: string;
      };
      exceptionDetails?: {
        text?: string;
        exception?: { description?: string };
      };
    }>("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue,
    });

    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text || "Runtime evaluation failed");
    }

    if (response.result?.unserializableValue !== undefined) {
      return response.result.unserializableValue;
    }

    return response.result?.value;
  }

  private async waitForLoad(session: CdpSession): Promise<void> {
    try {
      await session.send("Runtime.evaluate", {
        expression: `
          document.readyState === "complete"
            ? true
            : new Promise((resolve) => {
                const done = () => resolve(true);
                window.addEventListener("load", done, { once: true });
                setTimeout(done, 3000);
              })
        `,
        awaitPromise: true,
        returnByValue: true,
      });
    } catch {
      // Best-effort wait only.
    }
  }

  private formatError(error: unknown): string {
    const detail = error instanceof Error ? error.message : String(error);
    return [
      detail,
      "",
      `Direct CDP subset: ${DIRECT_CDP_SUPPORTED_ACTIONS.join(", ")}`,
      "Enable Chrome remote debugging with: --remote-debugging-port=9222",
    ].join("\n");
  }
}
