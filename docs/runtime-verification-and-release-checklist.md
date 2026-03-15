# iatlas-browser Runtime Verification and Release Checklist

## Purpose

This document is the release gate for `iatlas-browser`.

Use it before:

- publishing a new npm release
- pushing a production update to `miaoda.vip`
- claiming MCP or local browser automation is working

It is intentionally operational, not theoretical.

## Verified Baseline

Verified on March 15, 2026:

- public API on `https://miaoda.vip` works
- hosted adapter execution works
- local daemon works
- MCP stdio server works
- local extension-to-daemon SSE connection works
- browser commands and selected local adapters work in a real connected browser session

## Important Constraint

Branded Google Chrome may ignore `--load-extension`.

Observed behavior:

- Google Chrome logged: `--load-extension is not allowed in Google Chrome, ignoring.`

Implication:

- do not treat failed automated extension preload in branded Chrome as proof that the extension is broken
- for isolated automated verification, prefer:
  - Chromium
  - Chrome for Testing
- for normal user setup, manual loading via `chrome://extensions/` remains valid

## Local Runtime Checklist

### 1. Build

```bash
pnpm build
```

### 2. Install local assets

```bash
iatlas-browser setup
```

Expected outputs:

- `~/.iatlas-browser/extension`
- `~/.iatlas-browser/mcp/cursor.json`
- `~/.iatlas-browser/api/examples.sh`

### 3. Start daemon

```bash
iatlas-browser daemon
```

### 4. Check health

```bash
iatlas-browser doctor --json
```

Required:

- `daemon reachable = true`
- `extension build = true`
- `extension connected = true`

If `extension connected` is false:

- MCP browser tools will fail
- local `/command` execution will fail
- local `site_run` will fail or return extension-not-connected errors

## Local Browser Acceptance Test

### Direct commands

```bash
iatlas-browser open https://example.com --json
iatlas-browser tab --json
iatlas-browser snapshot -i --tab <tabId> --json
```

Expected:

- `open` returns success
- `tab` shows the opened page
- `snapshot` returns interactive refs for the chosen tab

### Local adapter checks

Use stable public adapters first.

Known-good verification set:

```bash
iatlas-browser site run wikipedia/summary "Node.js" --json
iatlas-browser site run duckduckgo/search "mcp browser" --json
```

Expected:

- JSON success payload
- meaningful data returned from the site

## MCP Acceptance Test

### MCP server startup

Use the generated config or run directly:

```bash
node dist/mcp.js
```

### Required MCP checks

- tool listing succeeds
- `site_list` succeeds
- `site_search` succeeds
- `browser_snapshot` succeeds when extension is connected
- `site_run` succeeds for at least one known-good adapter

### Recommended known-good MCP checks

- `browser_snapshot` on an already-opened `example.com` tab
- `site_run` with `wikipedia/summary`
- `site_run` with `duckduckgo/search`

## Hosted API Acceptance Test

### 1. Register a key

```bash
curl -s https://miaoda.vip/v1/register \
  -H "Content-Type: application/json" \
  -d '{"email":"release-check@example.com"}'
```

Required:

- API key returned
- endpoint URLs returned

### 2. Check usage

```bash
curl -s https://miaoda.vip/v1/usage \
  -H "Authorization: Bearer <API_KEY>"
```

Required:

- `ok = true`
- limit and remaining are present

### 3. Check browser-open API

```bash
curl -s https://miaoda.vip/v1/open \
  -H "Authorization: Bearer <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","mode":"metadata"}'
```

Required:

- `ok = true`
- title and final URL returned

### 4. Check hosted adapter catalog

```bash
curl -s https://miaoda.vip/v1/sites/hosted
```

Required:

- `ok = true`
- hosted count is present

### 5. Check hosted adapter execution

```bash
curl -s https://miaoda.vip/v1/sites/run \
  -H "Authorization: Bearer <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"name":"github/repo","args":{"repo":"miounet11/lao"}}'
```

Required:

- `ok = true`
- adapter data returned
- quota updates correctly

## Adapter Quality Rule

Do not describe all adapters as equally reliable.

Three practical classes exist:

1. Hosted-safe public adapters
   These are suitable for `miaoda.vip` server-side execution.

2. Local browser adapters that work in page context
   These are suitable for MCP and CLI when the extension is connected.

3. Fragile adapters
   These may fail because of:
   - login requirements
   - page-specific state assumptions
   - blocked in-page fetch behavior
   - anti-automation defenses

Release notes and docs should reflect this distinction honestly.

## Release Steps

1. Run the local runtime checklist
2. Run the MCP acceptance test
3. Run the hosted API acceptance test
4. Update documentation if behavior or constraints changed
5. Commit
6. Push
7. If needed, deploy updated web and OpenAPI artifacts to production

## Current Known Facts

- hosted API is live on `miaoda.vip`
- hosted site catalog is live on `miaoda.vip/v1/sites/hosted`
- local MCP protocol works with the official MCP SDK client
- local browser execution requires the extension SSE connection
- branded Google Chrome is not a reliable target for automated unpacked-extension preload
