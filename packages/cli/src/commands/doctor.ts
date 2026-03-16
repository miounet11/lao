import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  APP_DIRNAME,
  APP_NAME,
  APP_VERSION,
  DAEMON_BASE_URL,
  type DaemonStatus,
} from "@iatlas-browser/shared";
import { getDaemonPath } from "../daemon-manager.js";

export interface DoctorOptions {
  json?: boolean;
}

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

interface DoctorReport {
  app: string;
  version: string;
  daemonUrl: string;
  daemonPath: string;
  extensionDir: string;
  appDir: string;
  checks: CheckResult[];
  daemonStatus?: DaemonStatus;
}

function getPackageRoot(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = dirname(currentFile);
  const publishedLayoutRoot = resolve(currentDir, "..");
  const workspaceLayoutRoot = resolve(currentDir, "../../..");

  if (existsSync(join(publishedLayoutRoot, "extension"))) {
    return publishedLayoutRoot;
  }

  if (existsSync(join(workspaceLayoutRoot, "extension"))) {
    return workspaceLayoutRoot;
  }

  return publishedLayoutRoot;
}

async function getDaemonStatus(): Promise<DaemonStatus | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const response = await fetch(`${DAEMON_BASE_URL}/status`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!response.ok) return null;
    return (await response.json()) as DaemonStatus;
  } catch {
    return null;
  }
}

export async function doctorCommand(
  options: DoctorOptions = {}
): Promise<void> {
  const extensionDir = join(getPackageRoot(), "extension");
  const appDir = join(homedir(), APP_DIRNAME);
  const daemonPath = getDaemonPath();
  const daemonStatus = await getDaemonStatus();

  const checks: CheckResult[] = [
    {
      name: "daemon binary",
      ok: existsSync(daemonPath),
      detail: daemonPath,
    },
    {
      name: "extension build",
      ok: existsSync(extensionDir),
      detail: extensionDir,
    },
    {
      name: "app directory",
      ok: existsSync(appDir),
      detail: appDir,
    },
    {
      name: "daemon reachable",
      ok: daemonStatus !== null,
      detail: daemonStatus ? "HTTP status endpoint OK" : `Cannot reach ${DAEMON_BASE_URL}`,
    },
    {
      name: "extension connected",
      ok: daemonStatus?.extensionConnected === true,
      detail: daemonStatus
        ? daemonStatus.extensionConnected
          ? "Extension SSE connection is active"
          : "Daemon is up, but the Chrome extension is not connected"
        : "Daemon not reachable",
    },
    {
      name: "direct CDP fallback",
      ok: daemonStatus?.directCdpAvailable === true,
      detail: daemonStatus
        ? daemonStatus.directCdpAvailable
          ? `${daemonStatus.directCdpEndpoint}${daemonStatus.directCdpBrowser ? ` (${daemonStatus.directCdpBrowser})` : ""}`
          : daemonStatus.directCdpReason ?? "Not available"
        : "Daemon not reachable",
    },
  ];

  const report: DoctorReport = {
    app: APP_NAME,
    version: APP_VERSION,
    daemonUrl: DAEMON_BASE_URL,
    daemonPath,
    extensionDir,
    appDir,
    checks,
    daemonStatus: daemonStatus ?? undefined,
  };

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`${APP_NAME} doctor`);
  console.log(`version: ${APP_VERSION}`);
  console.log(`daemon:  ${DAEMON_BASE_URL}`);
  console.log(`binary:  ${daemonPath}`);
  console.log(`ext dir: ${extensionDir}`);
  console.log(`app dir: ${appDir}`);
  console.log("");

  for (const check of checks) {
    const marker = check.ok ? "OK " : "NO ";
    console.log(`${marker} ${check.name}: ${check.detail}`);
  }

  if (daemonStatus) {
    console.log("");
    console.log(`pending requests: ${daemonStatus.pendingRequests}`);
    console.log(`uptime: ${daemonStatus.uptime}s`);
    if (daemonStatus.directCdpAvailable && daemonStatus.directCdpActions?.length) {
      console.log(`direct CDP actions: ${daemonStatus.directCdpActions.join(", ")}`);
    }
  }

  if (checks.some((check) => !check.ok)) {
    console.log("");
    console.log("next steps:");
    console.log(`- Start the daemon with: ${APP_NAME} daemon`);
    console.log(`- Load the extension from: ${extensionDir}`);
    console.log("- Open chrome://extensions/ and enable Developer Mode");
    console.log("- Or launch Chrome with: --remote-debugging-port=9222 for the direct CDP subset");
  }
}
