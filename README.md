<div align="center">

# iatlas-browser

### iAtlas Browser

**Your browser is the API. No keys. No bots. No scrapers.**

[![npm](https://img.shields.io/npm/v/iatlas-browser?color=CB3837&logo=npm&logoColor=white)](https://www.npmjs.com/package/iatlas-browser)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[English](README.md) · [中文](README.zh-CN.md)

</div>

---

You're already logged into Twitter, Reddit, YouTube, Zhihu, Bilibili, LinkedIn, GitHub — iatlas-browser lets AI agents **use that directly**.

```bash
iatlas-browser site twitter/search "AI agent"       # search tweets
iatlas-browser site zhihu/hot                        # trending on Zhihu
iatlas-browser site arxiv/search "transformer"       # search papers
iatlas-browser site eastmoney/stock "茅台"            # real-time stock quote
iatlas-browser site boss/search "AI engineer"        # search jobs
iatlas-browser site wikipedia/summary "Python"       # Wikipedia summary
iatlas-browser site youtube/transcript VIDEO_ID      # full transcript
iatlas-browser site stackoverflow/search "async"     # search SO questions
```

**97 commands across 35 platforms.** All using your real browser's login state. [Full list →](https://github.com/epiral/bb-sites)

## The idea

The internet was built for browsers. AI agents have been trying to access it through APIs — but 99% of websites don't offer one.

iatlas-browser flips this: **instead of forcing websites to provide machine interfaces, let machines use the human interface directly.** The adapter runs `eval` inside your browser tab, calls `fetch()` with your cookies, or invokes the page's own webpack modules. The website thinks it's you. Because it **is** you.

| | Playwright / Selenium | Scraping libs | iatlas-browser |
|---|---|---|---|
| Browser | Headless, isolated | No browser | Your real Chrome |
| Login state | None, must re-login | Cookie extraction | Already there |
| Anti-bot | Detected easily | Cat-and-mouse | Invisible — it IS the user |
| Complex auth | Can't replicate | Reverse engineer | Page handles it itself |

## Quick Start

### Install

```bash
npm install -g iatlas-browser
```

### Chrome Extension

1. Download from [Releases](https://github.com/miounet11/lao/releases/latest)
2. Unzip → `chrome://extensions/` → Developer Mode → Load unpacked

### Use

```bash
iatlas-browser site update    # pull 97 community adapters
iatlas-browser site list      # see what's available
iatlas-browser site zhihu/hot # go
```

### MCP (Claude Code / Cursor)

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

## 35 platforms, 97 commands

Community-driven via [bb-sites](https://github.com/epiral/bb-sites). One JS file per command.

| Category | Platforms | Commands |
|----------|-----------|----------|
| **Search** | Google, Baidu, Bing, DuckDuckGo, Sogou WeChat | search |
| **Social** | Twitter/X, Reddit, Weibo, Xiaohongshu, Jike, LinkedIn, Hupu | search, feed, thread, user, notifications, hot |
| **News** | BBC, Reuters, 36kr, Toutiao, Eastmoney | headlines, search, newsflash, hot |
| **Dev** | GitHub, StackOverflow, HackerNews, CSDN, cnblogs, V2EX, Dev.to, npm, PyPI, arXiv | search, issues, repo, top, thread, package |
| **Video** | YouTube, Bilibili | search, video, transcript, popular, comments, feed |
| **Entertainment** | Douban, IMDb, Genius, Qidian | movie, search, top250 |
| **Finance** | Eastmoney, Yahoo Finance | stock quote, news |
| **Jobs** | BOSS Zhipin, LinkedIn | search, detail, profile |
| **Knowledge** | Wikipedia, Zhihu, Open Library | search, summary, hot, question |
| **Shopping** | SMZDM | search deals |
| **Tools** | Youdao, GSMArena, Product Hunt, Ctrip | translate, phone specs, trending products |

## 10 minutes to add any website

```bash
iatlas-browser guide    # full tutorial
```

Tell your AI agent: *"turn XX website into a CLI"*. It reads the guide, reverse-engineers the API with `network --with-body`, writes the adapter, tests it, and submits a PR. All autonomously.

Three tiers of adapter complexity:

| Tier | Auth method | Example | Time |
|------|-------------|---------|------|
| **1** | Cookie (fetch directly) | Reddit, GitHub, V2EX | ~1 min |
| **2** | Bearer + CSRF token | Twitter, Zhihu | ~3 min |
| **3** | Webpack injection / Pinia store | Twitter search, Xiaohongshu | ~10 min |

We tested this: **20 AI agents ran in parallel, each independently reverse-engineered a website and produced a working adapter.** The marginal cost of adding a new website to the agent-accessible internet is approaching zero.

## What this means for AI agents

Without iatlas-browser, an AI agent's world is: **files + terminal + a few APIs with keys.**

With iatlas-browser: **files + terminal + the entire internet.**

An agent can now, in under a minute:

```bash
# Cross-platform research on any topic
iatlas-browser site arxiv/search "retrieval augmented generation"
iatlas-browser site twitter/search "RAG"
iatlas-browser site github search rag-framework
iatlas-browser site stackoverflow/search "RAG implementation"
iatlas-browser site zhihu/search "RAG"
iatlas-browser site 36kr/newsflash
```

Six platforms, six dimensions, structured JSON. Faster and broader than any human researcher.

## Also a full browser automation tool

```bash
iatlas-browser open https://example.com
iatlas-browser snapshot -i                # accessibility tree
iatlas-browser click @3                   # click element
iatlas-browser fill @5 "hello"            # fill input
iatlas-browser eval "document.title"      # run JS
iatlas-browser fetch URL --json           # authenticated fetch
iatlas-browser network requests --with-body --json  # capture traffic
iatlas-browser screenshot                 # take screenshot
```

All commands support `--json` output and `--tab <id>` for concurrent multi-tab operations.

## Architecture

```
AI Agent (Claude Code, Codex, Cursor, etc.)
       │ CLI or MCP (stdio)
       ▼
iatlas-browser CLI ──HTTP──▶ Daemon ──SSE──▶ Chrome Extension
                                              │
                                              ▼ chrome.debugger (CDP)
                                         Your Real Browser
```

## License

[MIT](LICENSE)
