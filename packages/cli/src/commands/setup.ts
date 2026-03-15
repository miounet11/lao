import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  APP_DIRNAME,
  APP_NAME,
  APP_VERSION,
  DAEMON_BASE_URL,
} from "@iatlas-browser/shared";

export interface SetupOptions {
  json?: boolean;
}

interface SetupReport {
  app: string;
  version: string;
  appDir: string;
  extensionSource: string;
  extensionTarget: string;
  mcpDir: string;
  apiExamplesPath: string;
  genericConfigPath: string;
  cursorConfigPath: string;
  claudeDesktopConfigPath: string;
  daemonUrl: string;
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

function buildMcpConfig() {
  return {
    mcpServers: {
      [APP_NAME]: {
        command: "npx",
        args: ["-y", APP_NAME, "--mcp"],
      },
    },
  };
}

function buildApiExamples(): string {
  return `#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${DAEMON_BASE_URL}"

echo "== status =="
curl -s "$BASE_URL/status"

echo
echo "== snapshot request =="
curl -s "$BASE_URL/command" \\
  -H "Content-Type: application/json" \\
  -d '{"id":"demo-snapshot","action":"snapshot"}'
`;
}

export async function setupCommand(
  options: SetupOptions = {}
): Promise<void> {
  const packageRoot = getPackageRoot();
  const extensionSource = join(packageRoot, "extension");

  if (!existsSync(extensionSource)) {
    throw new Error(`Extension bundle not found: ${extensionSource}`);
  }

  const appDir = join(homedir(), APP_DIRNAME);
  const extensionTarget = join(appDir, "extension");
  const mcpDir = join(appDir, "mcp");
  const apiDir = join(appDir, "api");
  const genericConfigPath = join(mcpDir, "generic.json");
  const cursorConfigPath = join(mcpDir, "cursor.json");
  const claudeDesktopConfigPath = join(mcpDir, "claude-desktop.json");
  const apiExamplesPath = join(apiDir, "examples.sh");

  mkdirSync(appDir, { recursive: true });
  mkdirSync(mcpDir, { recursive: true });
  mkdirSync(apiDir, { recursive: true });

  rmSync(extensionTarget, { recursive: true, force: true });
  cpSync(extensionSource, extensionTarget, { recursive: true });

  const mcpConfig = JSON.stringify(buildMcpConfig(), null, 2) + "\n";
  writeFileSync(genericConfigPath, mcpConfig, "utf-8");
  writeFileSync(cursorConfigPath, mcpConfig, "utf-8");
  writeFileSync(claudeDesktopConfigPath, mcpConfig, "utf-8");
  writeFileSync(apiExamplesPath, buildApiExamples(), "utf-8");

  const report: SetupReport = {
    app: APP_NAME,
    version: APP_VERSION,
    appDir,
    extensionSource,
    extensionTarget,
    mcpDir,
    apiExamplesPath,
    genericConfigPath,
    cursorConfigPath,
    claudeDesktopConfigPath,
    daemonUrl: DAEMON_BASE_URL,
  };

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`${APP_NAME} setup complete`);
  console.log(`version: ${APP_VERSION}`);
  console.log(`app dir: ${appDir}`);
  console.log(`extension: ${extensionTarget}`);
  console.log(`mcp configs: ${mcpDir}`);
  console.log(`api examples: ${apiExamplesPath}`);
  console.log("");
  console.log("next steps:");
  console.log(`1. Load the unpacked extension from: ${extensionTarget}`);
  console.log(`2. Start the daemon: ${APP_NAME} daemon`);
  console.log(`3. Check local health: ${APP_NAME} doctor`);
  console.log(`4. Print MCP config: ${APP_NAME} mcp-config cursor`);
  console.log(`5. Print API examples: ${APP_NAME} api-guide`);
}
