import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface DetectedBrowser {
  name: string;
  path: string;
  launchCommand: string;
}

function quotePath(path: string): string {
  return JSON.stringify(path);
}

function buildLaunchCommand(path: string): string {
  return `${quotePath(path)} --remote-debugging-port=9222`;
}

function macCandidates(): Array<{ name: string; paths: string[] }> {
  const userApps = join(homedir(), "Applications");

  return [
    {
      name: "Google Chrome",
      paths: [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        join(userApps, "Google Chrome.app/Contents/MacOS/Google Chrome"),
      ],
    },
    {
      name: "Google Chrome Beta",
      paths: [
        "/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta",
        join(userApps, "Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta"),
      ],
    },
    {
      name: "Google Chrome Dev",
      paths: [
        "/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev",
        join(userApps, "Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev"),
      ],
    },
    {
      name: "Google Chrome Canary",
      paths: [
        "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
        join(userApps, "Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary"),
      ],
    },
    {
      name: "Chromium",
      paths: [
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        join(userApps, "Chromium.app/Contents/MacOS/Chromium"),
      ],
    },
    {
      name: "Brave Browser",
      paths: [
        "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
        join(userApps, "Brave Browser.app/Contents/MacOS/Brave Browser"),
      ],
    },
    {
      name: "Arc",
      paths: [
        "/Applications/Arc.app/Contents/MacOS/Arc",
        join(userApps, "Arc.app/Contents/MacOS/Arc"),
      ],
    },
  ];
}

function linuxCandidates(): Array<{ name: string; commands: string[] }> {
  return [
    { name: "Google Chrome", commands: ["google-chrome", "google-chrome-stable"] },
    { name: "Google Chrome Beta", commands: ["google-chrome-beta"] },
    { name: "Google Chrome Dev", commands: ["google-chrome-unstable"] },
    { name: "Chromium", commands: ["chromium", "chromium-browser"] },
    { name: "Brave Browser", commands: ["brave-browser", "brave"] },
    { name: "Microsoft Edge", commands: ["microsoft-edge", "microsoft-edge-stable"] },
  ];
}

function windowsCandidates(): Array<{ name: string; paths: string[] }> {
  const localAppData = process.env.LOCALAPPDATA ?? "";
  const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
  const programFilesX86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";

  return [
    {
      name: "Google Chrome",
      paths: [
        join(programFiles, "Google/Chrome/Application/chrome.exe"),
        join(programFilesX86, "Google/Chrome/Application/chrome.exe"),
        join(localAppData, "Google/Chrome/Application/chrome.exe"),
      ],
    },
    {
      name: "Google Chrome Beta",
      paths: [
        join(programFiles, "Google/Chrome Beta/Application/chrome.exe"),
        join(programFilesX86, "Google/Chrome Beta/Application/chrome.exe"),
      ],
    },
    {
      name: "Google Chrome Dev",
      paths: [
        join(programFiles, "Google/Chrome Dev/Application/chrome.exe"),
        join(programFilesX86, "Google/Chrome Dev/Application/chrome.exe"),
      ],
    },
    {
      name: "Chromium",
      paths: [join(programFiles, "Chromium/Application/chrome.exe")],
    },
    {
      name: "Brave Browser",
      paths: [
        join(programFiles, "BraveSoftware/Brave-Browser/Application/brave.exe"),
        join(programFilesX86, "BraveSoftware/Brave-Browser/Application/brave.exe"),
      ],
    },
    {
      name: "Arc",
      paths: [join(localAppData, "Programs/Arc/Arc.exe")],
    },
  ];
}

function dedupeBrowsers(browsers: DetectedBrowser[]): DetectedBrowser[] {
  const seen = new Set<string>();
  return browsers.filter((browser) => {
    const key = `${browser.name}:${browser.path}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function detectBrowsers(): DetectedBrowser[] {
  const browsers: DetectedBrowser[] = [];

  if (process.platform === "darwin") {
    for (const candidate of macCandidates()) {
      const match = candidate.paths.find((path) => existsSync(path));
      if (!match) {
        continue;
      }
      browsers.push({
        name: candidate.name,
        path: match,
        launchCommand: buildLaunchCommand(match),
      });
    }
    return dedupeBrowsers(browsers);
  }

  if (process.platform === "win32") {
    for (const candidate of windowsCandidates()) {
      const match = candidate.paths.find((path) => path && existsSync(path));
      if (!match) {
        continue;
      }
      browsers.push({
        name: candidate.name,
        path: match,
        launchCommand: buildLaunchCommand(match),
      });
    }
    return dedupeBrowsers(browsers);
  }

  for (const candidate of linuxCandidates()) {
    const match = candidate.commands.find((command) => {
      const result = spawnSync("which", [command], { encoding: "utf-8" });
      return result.status === 0 && result.stdout.trim();
    });
    if (!match) {
      continue;
    }

    const resolved = spawnSync("which", [match], { encoding: "utf-8" }).stdout.trim() || match;
    browsers.push({
      name: candidate.name,
      path: resolved,
      launchCommand: buildLaunchCommand(resolved),
    });
  }

  return dedupeBrowsers(browsers);
}
