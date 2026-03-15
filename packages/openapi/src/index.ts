import { createHash, randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { isIP } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DAILY_LIMIT = Number.parseInt(process.env.OPENAPI_DAILY_LIMIT ?? "1000", 10);
const PORT = Number.parseInt(process.env.OPENAPI_PORT ?? "18765", 10);
const HOST = process.env.OPENAPI_HOST ?? "127.0.0.1";
const PUBLIC_ORIGIN = process.env.OPENAPI_PUBLIC_ORIGIN ?? "https://miaoda.vip";
const DATA_DIR = process.env.OPENAPI_DATA_DIR ?? resolve(process.cwd(), "data");
const STORE_PATH = join(DATA_DIR, "store.json");
const MAX_BODY_BYTES = 512_000;
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 30_000;

interface UserRecord {
  email: string;
  apiKeyHash: string;
  createdAt: string;
  updatedAt: string;
  quotaByDate: Record<string, number>;
}

interface StoreShape {
  users: Record<string, UserRecord>;
}

interface AuthResult {
  email: string;
  user: UserRecord;
}

type OpenMode = "metadata" | "text" | "html";

class FileStore {
  private readonly path: string;
  private data: StoreShape;

  constructor(path: string) {
    this.path = path;
    mkdirSync(dirname(path), { recursive: true });
    this.data = this.load();
  }

  private load(): StoreShape {
    try {
      const raw = readFileSync(this.path, "utf-8");
      return JSON.parse(raw) as StoreShape;
    } catch {
      return { users: {} };
    }
  }

  private save(): void {
    const tempPath = `${this.path}.tmp`;
    writeFileSync(tempPath, `${JSON.stringify(this.data, null, 2)}\n`, "utf-8");
    renameSync(tempPath, this.path);
  }

  getUserByEmail(email: string): UserRecord | undefined {
    return this.data.users[email];
  }

  upsertUser(email: string, apiKeyHash: string): UserRecord {
    const existing = this.data.users[email];
    const now = new Date().toISOString();
    const user: UserRecord = {
      email,
      apiKeyHash,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      quotaByDate: existing?.quotaByDate ?? {},
    };

    this.data.users[email] = user;
    this.save();
    return user;
  }

  findUserByApiKey(apiKey: string): AuthResult | null {
    const apiKeyHash = hashApiKey(apiKey);

    for (const [email, user] of Object.entries(this.data.users)) {
      if (user.apiKeyHash === apiKeyHash) {
        return { email, user };
      }
    }

    return null;
  }

  consumeQuota(email: string, dateKey: string): UserRecord {
    const user = this.data.users[email];
    if (!user) {
      throw new Error(`Unknown user: ${email}`);
    }

    user.quotaByDate[dateKey] = (user.quotaByDate[dateKey] ?? 0) + 1;
    user.updatedAt = new Date().toISOString();
    this.save();
    return user;
  }
}

const store = new FileStore(STORE_PATH);

function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}

function createApiKey(): string {
  return `iatlas_${randomBytes(24).toString("hex")}`;
}

function normalizeEmail(email: unknown): string | null {
  if (typeof email !== "string") {
    return null;
  }

  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return null;
  }

  return normalized;
}

function getDateKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function getUsage(user: UserRecord) {
  const date = getDateKey();
  const used = user.quotaByDate[date] ?? 0;

  return {
    date,
    limit: DAILY_LIMIT,
    used,
    remaining: Math.max(DAILY_LIMIT - used, 0),
  };
}

function setCorsHeaders(response: ServerResponse): void {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  setCorsHeaders(response);
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function sendError(response: ServerResponse, statusCode: number, code: string, message: string, extra?: Record<string, unknown>): void {
  sendJson(response, statusCode, {
    ok: false,
    error: {
      code,
      message,
      ...(extra ?? {}),
    },
  });
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;

    if (total > MAX_BODY_BYTES) {
      throw new Error("Request body too large");
    }

    chunks.push(buffer);
  }

  const raw = Buffer.concat(chunks).toString("utf-8");
  if (!raw) {
    return {} as T;
  }

  return JSON.parse(raw) as T;
}

function getApiKeyFromRequest(request: IncomingMessage): string | null {
  const authorization = request.headers.authorization;
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim();
  }

  const headerKey = request.headers["x-api-key"];
  if (typeof headerKey === "string" && headerKey.trim()) {
    return headerKey.trim();
  }

  return null;
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return false;
  }

  return (
    parts[0] === 0 ||
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
    parts[0] === 169 && parts[1] === 254 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  );
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  return (
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:192.168.") ||
    normalized.startsWith("::ffff:172.16.") ||
    normalized.startsWith("::ffff:172.17.") ||
    normalized.startsWith("::ffff:172.18.") ||
    normalized.startsWith("::ffff:172.19.") ||
    normalized.startsWith("::ffff:172.2") ||
    normalized.startsWith("::ffff:172.30.") ||
    normalized.startsWith("::ffff:172.31.")
  );
}

function isBlockedHost(hostname: string): boolean {
  const lowered = hostname.toLowerCase();
  return (
    lowered === "localhost" ||
    lowered.endsWith(".localhost") ||
    lowered.endsWith(".local") ||
    lowered.endsWith(".internal")
  );
}

async function assertPublicTarget(target: URL): Promise<void> {
  if (!["http:", "https:"].includes(target.protocol)) {
    throw new Error("Only http and https URLs are supported");
  }

  if (isBlockedHost(target.hostname)) {
    throw new Error("Private or local targets are not allowed");
  }

  const directIpType = isIP(target.hostname);
  if (directIpType === 4 && isPrivateIPv4(target.hostname)) {
    throw new Error("Private or local targets are not allowed");
  }

  if (directIpType === 6 && isPrivateIPv6(target.hostname)) {
    throw new Error("Private or local targets are not allowed");
  }

  const addresses = await lookup(target.hostname, { all: true });
  for (const address of addresses) {
    if ((address.family === 4 && isPrivateIPv4(address.address)) || (address.family === 6 && isPrivateIPv6(address.address))) {
      throw new Error("Private or local targets are not allowed");
    }
  }
}

async function readBodyText(response: Response): Promise<{ body: string; truncated: boolean }> {
  if (!response.body) {
    return { body: "", truncated: false };
  }

  const chunks: Buffer[] = [];
  let total = 0;
  let truncated = false;

  const reader = response.body.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done || !value) {
      break;
    }

    const buffer = Buffer.from(value);
    const remaining = MAX_BODY_BYTES - total;

    if (remaining <= 0) {
      truncated = true;
      break;
    }

    if (buffer.length > remaining) {
      chunks.push(buffer.subarray(0, remaining));
      total += remaining;
      truncated = true;
      break;
    }

    chunks.push(buffer);
    total += buffer.length;
  }

  return { body: Buffer.concat(chunks).toString("utf-8"), truncated };
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1]?.replace(/\s+/g, " ").trim() ?? null;
}

function extractMetaDescription(html: string): string | null {
  const attributeMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i)
    ?? html.match(/<meta[^>]+content=["']([\s\S]*?)["'][^>]+name=["']description["'][^>]*>/i);
  return attributeMatch?.[1]?.replace(/\s+/g, " ").trim() ?? null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksTextual(contentType: string | null): boolean {
  if (!contentType) {
    return true;
  }

  return (
    contentType.startsWith("text/") ||
    contentType.includes("json") ||
    contentType.includes("xml") ||
    contentType.includes("javascript") ||
    contentType.includes("html")
  );
}

async function fetchOpenResult(url: string, mode: OpenMode, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "iatlas-browser-openapi/0.5.0",
        "accept-language": "en-US,en;q=0.9",
      },
    });

    const contentType = response.headers.get("content-type");
    const { body, truncated } = looksTextual(contentType) ? await readBodyText(response) : { body: "", truncated: false };
    const title = contentType?.includes("html") ? extractTitle(body) : null;
    const description = contentType?.includes("html") ? extractMetaDescription(body) : null;
    const text = contentType?.includes("html") ? stripHtml(body) : body.trim();

    const payload: Record<string, unknown> = {
      requestedUrl: url,
      finalUrl: response.url,
      status: response.status,
      statusText: response.statusText,
      contentType,
      fetchedAt: new Date().toISOString(),
      truncated,
      title,
      description,
      textExcerpt: text.slice(0, 1000),
    };

    if (mode === "text") {
      payload.text = text.slice(0, MAX_BODY_BYTES);
    }

    if (mode === "html") {
      payload.html = body;
    }

    return payload;
  } finally {
    clearTimeout(timer);
  }
}

async function handleRegister(request: IncomingMessage, response: ServerResponse): Promise<void> {
  let body: { email?: unknown };

  try {
    body = await readJsonBody(request);
  } catch {
    sendError(response, 400, "invalid_json", "Request body must be valid JSON");
    return;
  }

  const email = normalizeEmail(body.email);
  if (!email) {
    sendError(response, 400, "invalid_email", "A valid email address is required");
    return;
  }

  const apiKey = createApiKey();
  store.upsertUser(email, hashApiKey(apiKey));

  sendJson(response, 201, {
    ok: true,
    email,
    apiKey,
    limitPerDay: DAILY_LIMIT,
    docsUrl: `${PUBLIC_ORIGIN}/openapi/`,
    endpoints: {
      usage: `${PUBLIC_ORIGIN}/v1/usage`,
      open: `${PUBLIC_ORIGIN}/v1/open`,
    },
  });
}

function authenticate(request: IncomingMessage, response: ServerResponse): AuthResult | null {
  const apiKey = getApiKeyFromRequest(request);
  if (!apiKey) {
    sendError(response, 401, "missing_api_key", "Send your API key with Authorization: Bearer <key> or X-API-Key");
    return null;
  }

  const auth = store.findUserByApiKey(apiKey);
  if (!auth) {
    sendError(response, 401, "invalid_api_key", "API key not recognized");
    return null;
  }

  return auth;
}

async function handleUsage(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const auth = authenticate(request, response);
  if (!auth) {
    return;
  }

  sendJson(response, 200, {
    ok: true,
    email: auth.email,
    usage: getUsage(auth.user),
  });
}

async function handleOpen(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const auth = authenticate(request, response);
  if (!auth) {
    return;
  }

  let body: { url?: unknown; mode?: unknown; timeoutMs?: unknown };
  try {
    body = await readJsonBody(request);
  } catch {
    sendError(response, 400, "invalid_json", "Request body must be valid JSON");
    return;
  }

  if (typeof body.url !== "string" || !body.url.trim()) {
    sendError(response, 400, "invalid_url", "A non-empty url field is required");
    return;
  }

  const mode = body.mode === "text" || body.mode === "html" ? body.mode : "metadata";
  const timeoutMs = Math.min(
    Math.max(typeof body.timeoutMs === "number" ? Math.floor(body.timeoutMs) : DEFAULT_TIMEOUT_MS, 1_000),
    MAX_TIMEOUT_MS,
  );

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(body.url);
  } catch {
    sendError(response, 400, "invalid_url", "The url field must be a valid absolute URL");
    return;
  }

  try {
    await assertPublicTarget(parsedUrl);
  } catch (error) {
    sendError(response, 400, "blocked_target", error instanceof Error ? error.message : "Target not allowed");
    return;
  }

  const currentUsage = getUsage(auth.user);
  if (currentUsage.used >= DAILY_LIMIT) {
    sendError(response, 429, "quota_exceeded", "Daily request limit reached", { usage: currentUsage });
    return;
  }

  const updatedUser = store.consumeQuota(auth.email, currentUsage.date);

  try {
    const result = await fetchOpenResult(parsedUrl.toString(), mode as OpenMode, timeoutMs);
    sendJson(response, 200, {
      ok: true,
      mode,
      data: result,
      usage: getUsage(updatedUser),
    });
  } catch (error) {
    sendError(response, 502, "open_failed", error instanceof Error ? error.message : "Failed to open target URL", {
      usage: getUsage(updatedUser),
    });
  }
}

function handleDocs(response: ServerResponse): void {
  sendJson(response, 200, {
    ok: true,
    service: "iatlas-browser-openapi",
    version: "0.5.0",
    limitPerDay: DAILY_LIMIT,
    auth: {
      header: "Authorization: Bearer <apiKey>",
      alternateHeader: "X-API-Key: <apiKey>",
    },
    endpoints: [
      {
        method: "POST",
        path: "/v1/register",
        body: { email: "user@example.com" },
        description: "Create or rotate an API key bound to an email address",
      },
      {
        method: "GET",
        path: "/v1/usage",
        description: "Get current daily usage for the authenticated API key",
      },
      {
        method: "POST",
        path: "/v1/open",
        body: {
          url: "https://example.com",
          mode: "metadata",
          timeoutMs: 15000,
        },
        description: "Fetch a public http/https URL and return metadata, text, or HTML",
      },
    ],
  });
}

const server = createServer(async (request, response) => {
  setCorsHeaders(response);

  if (!request.url || !request.method) {
    sendError(response, 400, "invalid_request", "Missing request URL or method");
    return;
  }

  if (request.method === "OPTIONS") {
    response.statusCode = 204;
    response.end();
    return;
  }

  const requestUrl = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);

  try {
    if (request.method === "GET" && requestUrl.pathname === "/v1/health") {
      sendJson(response, 200, {
        ok: true,
        service: "iatlas-browser-openapi",
        port: PORT,
        host: HOST,
        publicOrigin: PUBLIC_ORIGIN,
      });
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/v1/docs") {
      handleDocs(response);
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/v1/register") {
      await handleRegister(request, response);
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/v1/usage") {
      await handleUsage(request, response);
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/v1/open") {
      await handleOpen(request, response);
      return;
    }

    sendError(response, 404, "not_found", "Endpoint not found");
  } catch (error) {
    sendError(response, 500, "internal_error", error instanceof Error ? error.message : "Unexpected server error");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`iatlas-browser-openapi listening on http://${HOST}:${PORT}`);
  console.log(`data dir: ${DATA_DIR}`);
});
