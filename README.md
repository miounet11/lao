<div align="center">

# iatlas-browser

**A local browser bridge for terminal workflows and AI agents**

[![npm](https://img.shields.io/npm/v/iatlas-browser?color=CB3837&logo=npm&logoColor=white)](https://www.npmjs.com/package/iatlas-browser)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[English](README.md) · [中文](README.zh-CN.md)

</div>

## Overview

`iatlas-browser` connects your terminal tools and AI agents to the Chrome session you are already using.

Instead of launching a separate headless browser and recreating authentication, it talks to your real browser through a local daemon and a Chrome extension. That means it can work with the cookies, sessions, tabs, and page state you already have.

Typical use cases:

- automate websites that do not have usable APIs
- query authenticated pages from an AI agent
- inspect network calls from real browser traffic
- build site-specific adapters on top of your live session
- expose browser control through MCP for agent runtimes

## Core Capabilities

### 1. Direct browser operations

You can drive tabs and page interactions from the CLI:

```bash
iatlas-browser open https://example.com
iatlas-browser snapshot -i
iatlas-browser click @3
iatlas-browser fill @7 "hello world"
iatlas-browser press Enter
iatlas-browser screenshot
```

### 2. Authenticated in-browser requests

Need to call the same endpoint your browser session can already reach?

```bash
iatlas-browser fetch https://example.com/api/me --json
iatlas-browser eval "document.title"
```

### 3. Site adapters

`site` adapters let you package repeatable website actions as reusable commands:

```bash
iatlas-browser site update
iatlas-browser site list
iatlas-browser site twitter/search "browser agent"
iatlas-browser site zhihu/hot
iatlas-browser site youtube/transcript VIDEO_ID
```

### 4. Reverse engineering and diagnostics

You can inspect what the browser is doing in real time:

```bash
iatlas-browser network requests --with-body --json
iatlas-browser console
iatlas-browser errors
iatlas-browser trace start
```

### 5. MCP integration

The project can run as an MCP server so coding agents and tool-using models can call it directly.

## Why This Design Exists

Most web automation tools assume one of these models:

- a fresh headless browser
- extracted cookies
- unofficial APIs
- HTML scraping

`iatlas-browser` takes a different path:

- use the browser session you already trust
- keep actions local on your machine
- use Chrome DevTools Protocol for stronger control
- expose results in a form that is usable by both humans and agents

This is especially useful for:

- websites with hard-to-recreate authentication
- tools behind company login
- social platforms with dynamic clients
- workflows where page state matters as much as raw HTML

## Quick Start

### Install

```bash
npm install -g iatlas-browser
```

### Build or download the extension

Option A: use a release build

1. Download the latest package from [Releases](https://github.com/miounet11/lao/releases/latest)
2. Unzip it locally

Option B: build from source

```bash
pnpm install
pnpm build
```

The unpacked extension output will be in `extension/`.

### Load the extension in Chrome

1. Open `chrome://extensions/`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select the `extension/` directory

### Start the daemon

```bash
iatlas-browser daemon
```

In another terminal, verify the local setup:

```bash
iatlas-browser doctor
```

### First commands

```bash
iatlas-browser open https://example.com
iatlas-browser snapshot -i
iatlas-browser get title
```

## MCP Setup

Example configuration:

```json
{
  "mcpServers": {
    "iatlas-browser": {
      "command": "npx",
      "args": ["-y", "iatlas-browser", "--mcp"]
    }
  }
}
```

## Command Groups

Main command families:

- navigation: `open`, `back`, `forward`, `refresh`, `close`
- interaction: `click`, `hover`, `fill`, `type`, `press`, `check`, `select`
- inspection: `snapshot`, `get`, `screenshot`, `eval`
- browser state: `tab`, `frame`, `dialog`, `wait`
- debugging: `network`, `console`, `errors`, `trace`
- platform: `daemon`, `status`, `stop`, `reload`, `doctor`
- adapters: `site`, `guide`

Run help at any time:

```bash
iatlas-browser --help
iatlas-browser site --help
```

## Site Adapter System

`site` is the project’s higher-level workflow layer.

An adapter is a small JavaScript unit that runs against a real website context and turns one web task into one command. Adapters can be:

- private and stored locally
- pulled from the shared community adapter collection

Default directories:

- private adapters: `~/.iatlas-browser/sites`
- shared adapters: `~/.iatlas-browser/bb-sites`

Useful commands:

```bash
iatlas-browser site update
iatlas-browser site search github
iatlas-browser site run github/issues owner/repo
```

To create a new adapter:

```bash
iatlas-browser guide
```

## How It Works Internally

The system has four runtime layers:

```text
CLI / MCP client
    ↓
Local daemon (HTTP)
    ↓
Chrome extension (SSE + command execution)
    ↓
Chrome / current user session
```

More specifically:

- the CLI or MCP server creates a structured request
- the daemon receives it on a local HTTP endpoint
- the extension stays connected to the daemon via SSE
- the extension executes the action through Chrome APIs and CDP
- the result is sent back to the daemon and returned to the caller

The current implementation also uses accessibility-tree snapshots so the page structure is easier for agents to reason about than raw HTML.

## Operational Notes

### Use `127.0.0.1`

The project defaults to `127.0.0.1:19824` for local communication. This avoids common `localhost` IPv4/IPv6 issues in some environments.

### Multi-tab isolation

Many commands support `--tab <id>` so concurrent workflows can target a specific tab safely.

### MV3 lifecycle

Chrome Manifest V3 service workers can sleep. The extension includes reconnect and keepalive behavior, but if something looks wrong, run:

```bash
iatlas-browser doctor
```

## Development

From the repository root:

```bash
pnpm install
pnpm build
```

Key packages:

- `packages/shared`
- `packages/cli`
- `packages/daemon`
- `packages/extension`
- `packages/mcp`

Internal engineering notes:

- `docs/iatlas-browser-architecture-and-iteration-guide.md`

## License

[MIT](LICENSE)
