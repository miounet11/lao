#!/usr/bin/env node
import { mkdtempSync, readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const repoArg = process.argv[2];
const outDirArg = process.argv[3];
const repoUrl = "https://github.com/miounet11/lao-s.git";
const hostedConfigPath = resolve("config", "hosted-sites.json");
const customSitesConfigPath = resolve("config", "custom-sites.json");

function loadHostedConfig() {
  try {
    const raw = JSON.parse(readFileSync(hostedConfigPath, "utf-8"));
    return new Map((raw.hostedSites || []).map((item) => [item.name, item]));
  } catch {
    return new Map();
  }
}

function loadCustomSites() {
  try {
    const raw = JSON.parse(readFileSync(customSitesConfigPath, "utf-8"));
    return Array.isArray(raw.customSites) ? raw.customSites : [];
  } catch {
    return [];
  }
}

function buildCatalogEntry(entry, hostedMap) {
  const argEntries = (entry.args || []).map((arg, index) => ({
    name: arg.name,
    required: Boolean(arg.required),
    description: arg.description || "",
    position: typeof arg.position === "number" ? arg.position : index,
  }));
  const cliExample = String(entry.example || `iatlas-browser site ${entry.name}`).replace(/\bbb-browser\b/g, "iatlas-browser");
  const mcpArgs = {};
  const sampleArgs = {};
  for (const arg of argEntries) {
    mcpArgs[arg.name] = arg.required ? `<${arg.name}>` : "";
    sampleArgs[arg.name] = arg.required ? `<${arg.name}>` : "";
  }

  const hostedInfo = hostedMap.get(entry.name);
  return {
    name: entry.name,
    platform: entry.platform || entry.name.split("/")[0],
    command: entry.command || entry.name.split("/").slice(1).join("/"),
    description: entry.description || "",
    domain: entry.domain || "",
    readOnly: entry.readOnly !== false,
    capabilities: entry.capabilities || [],
    example: cliExample,
    cliExample,
    mcpExample: {
      tool: "site_run",
      arguments: {
        name: entry.name,
        args: mcpArgs,
      },
    },
    execution: hostedInfo
      ? {
          mode: "hosted",
          hosted: true,
          notes: hostedInfo.notes || "",
          apiExample: {
            method: "POST",
            path: "/v1/sites/run",
            body: {
              name: entry.name,
              args: sampleArgs,
            },
          },
        }
      : {
          mode: "local",
          hosted: false,
          notes: "Requires local iatlas-browser runtime and may depend on a real logged-in browser session.",
        },
    args: argEntries,
    file: entry.file || "",
    source: entry.source || "lao-s",
  };
}

function ensureRepo(pathHint) {
  if (pathHint && existsSync(pathHint)) {
    return resolve(pathHint);
  }

  const tempDir = mkdtempSync(join(tmpdir(), "lao-s-catalog-"));
  execFileSync("git", ["clone", "--depth", "1", repoUrl, tempDir], { stdio: "inherit" });
  return tempDir;
}

function parseMeta(filePath, sourceRoot, hostedMap) {
  const content = readFileSync(filePath, "utf-8");
  const rel = relative(sourceRoot, filePath).replace(/\\/g, "/");
  const defaultName = rel.replace(/\.js$/, "");
  const match = content.match(/\/\*\s*@meta\s*\n([\s\S]*?)\*\//);
  let meta = {};
  if (match) {
    try {
      meta = JSON.parse(match[1]);
    } catch {
      meta = {};
    }
  }

  const name = meta.name || defaultName;
  const args = meta.args || {};
  const argEntries = Object.entries(args).map(([argName, def], index) => ({
    name: argName,
    required: Boolean(def?.required),
    description: def?.description || "",
    position: index,
  }));

  const positionalUsage = argEntries
    .map((arg) => (arg.required ? `<${arg.name}>` : `[${arg.name}]`))
    .join(" ");
  const cliExample = (meta.example
    ? String(meta.example)
    : `iatlas-browser site ${name}${positionalUsage ? ` ${positionalUsage}` : ""}`)
    .replaceAll("epiral/bb-sites", "miounet11/lao-s")
    .replaceAll("epiral/bb-browser", "miounet11/lao")
    .replaceAll("epiral/iatlas-browser", "miounet11/lao")
    .replace(/\bbb-browser\b/g, "iatlas-browser");

  return buildCatalogEntry({
    name,
    platform: name.split("/")[0],
    command: name.split("/").slice(1).join("/"),
    description: meta.description || "",
    domain: meta.domain || "",
    readOnly: meta.readOnly !== false,
    capabilities: meta.capabilities || [],
    example: cliExample,
    cliExample,
    args: argEntries,
    file: rel,
    source: "lao-s",
  }, hostedMap);
}

function walk(dir, root, output, hostedMap) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, root, output, hostedMap);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".js")) {
      output.push(parseMeta(fullPath, root, hostedMap));
    }
  }
}

const repoDir = ensureRepo(repoArg);
const outDir = resolve(outDirArg || "web/catalog");
mkdirSync(outDir, { recursive: true });

const entries = [];
const hostedMap = loadHostedConfig();
walk(repoDir, repoDir, entries, hostedMap);
for (const entry of loadCustomSites()) {
  entries.push(buildCatalogEntry(entry, hostedMap));
}
entries.sort((a, b) => a.name.localeCompare(b.name));

const platformMap = new Map();
for (const entry of entries) {
  if (!platformMap.has(entry.platform)) {
    platformMap.set(entry.platform, {
      name: entry.platform,
      count: 0,
      domains: new Set(),
    });
  }
  const bucket = platformMap.get(entry.platform);
  bucket.count += 1;
  if (entry.domain) bucket.domains.add(entry.domain);
}

const platforms = Array.from(platformMap.values())
  .map((item) => ({
    name: item.name,
    count: item.count,
    domains: Array.from(item.domains).sort(),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

writeFileSync(join(outDir, "sites.json"), `${JSON.stringify(entries, null, 2)}\n`, "utf-8");
writeFileSync(join(outDir, "platforms.json"), `${JSON.stringify(platforms, null, 2)}\n`, "utf-8");

console.log(`Generated ${entries.length} site catalog entries into ${outDir}`);
