import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { APP_DIRNAME, type RefInfo } from "@iatlas-browser/shared";

export interface StoredSnapshotRefs {
  refs: Record<string, RefInfo>;
  tabId: number;
  title?: string;
  url?: string;
  updatedAt: number;
}

interface DirectCdpRefState {
  targets: Record<string, StoredSnapshotRefs>;
}

export class DirectCdpRefStore {
  private readonly statePath: string;
  private state: DirectCdpRefState = { targets: {} };

  constructor() {
    const appDir = join(homedir(), APP_DIRNAME);
    mkdirSync(appDir, { recursive: true });
    this.statePath = join(appDir, "direct-cdp-refs.json");
    this.state = this.load();
  }

  get(targetId: string, ref: string): RefInfo | null {
    const entry = this.state.targets[targetId];
    if (!entry) {
      return null;
    }

    const normalizedRef = ref.startsWith("@") ? ref.slice(1) : ref;
    return entry.refs[normalizedRef] ?? null;
  }

  getSnapshot(targetId: string): StoredSnapshotRefs | null {
    return this.state.targets[targetId] ?? null;
  }

  save(targetId: string, snapshot: StoredSnapshotRefs): void {
    this.state.targets[targetId] = snapshot;
    this.persist();
  }

  clear(targetId: string): void {
    if (!this.state.targets[targetId]) {
      return;
    }
    delete this.state.targets[targetId];
    this.persist();
  }

  retain(targetIds: Iterable<string>): void {
    const keep = new Set(targetIds);
    let changed = false;

    for (const targetId of Object.keys(this.state.targets)) {
      if (!keep.has(targetId)) {
        delete this.state.targets[targetId];
        changed = true;
      }
    }

    if (changed) {
      this.persist();
    }
  }

  private load(): DirectCdpRefState {
    if (!existsSync(this.statePath)) {
      return { targets: {} };
    }

    try {
      const raw = readFileSync(this.statePath, "utf-8");
      const parsed = JSON.parse(raw) as Partial<DirectCdpRefState>;
      return {
        targets: parsed.targets ?? {},
      };
    } catch {
      return { targets: {} };
    }
  }

  private persist(): void {
    writeFileSync(this.statePath, `${JSON.stringify(this.state, null, 2)}\n`, "utf-8");
  }
}
