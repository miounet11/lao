# iatlas-browser Architecture and Iteration Guide

## Why This Document Exists

This document is the main engineering reference for future work on `iatlas-browser`.

It has four goals:

1. Explain what the product actually is
2. Explain how it evolved from `07800c0` to `73c4891`
3. Record the architectural invariants that must not be broken
4. Give a practical path for safe future iteration and upgrades

If you only keep one internal note for this project, keep this one.

## What iatlas-browser Really Is

`iatlas-browser` is not just a browser automation CLI.

It is a local system that turns the user's real logged-in Chrome session into a callable interface for:

- terminal workflows
- scripted automation
- AI-agent tool use
- website reverse engineering
- site-specific adapters

The deepest product idea is:

**The browser is the API surface.**

That is the design center. Everything else exists to make that safe, composable, and usable by humans and agents.

## Current High-Level Architecture

The system has five parts:

1. `packages/shared`
   Shared protocol, constants, request/response types
2. `packages/cli`
   CLI entrypoint, command routing, daemon management, operator UX
3. `packages/daemon`
   Local HTTP bridge between CLI/MCP and extension
4. `packages/extension`
   Chrome extension that executes browser actions using real browser state
5. `packages/mcp`
   MCP server exposing browser capabilities to agent frameworks

### Main Control Flow

The core runtime loop is:

1. user or agent issues a CLI/MCP command
2. CLI or MCP converts it to a structured request
3. daemon accepts the request over local HTTP
4. extension holds an SSE connection to the daemon
5. extension receives the command and executes it in Chrome
6. extension posts the result back to the daemon
7. daemon returns the response to CLI or MCP

### Current Important Files

- `packages/shared/src/protocol.ts`
- `packages/shared/src/constants.ts`
- `packages/cli/src/index.ts`
- `packages/cli/src/client.ts`
- `packages/cli/src/daemon-manager.ts`
- `packages/cli/src/commands/site.ts`
- `packages/cli/src/commands/doctor.ts`
- `packages/daemon/src/http-server.ts`
- `packages/daemon/src/sse-manager.ts`
- `packages/daemon/src/request-manager.ts`
- `packages/extension/src/background/command-handler.ts`
- `packages/extension/src/background/cdp-service.ts`
- `packages/extension/src/background/cdp-dom-service.ts`
- `packages/extension/src/background/index.ts`
- `packages/mcp/src/index.ts`

## Exact Historical Arc: `07800c0` -> `73c4891`

This section is the condensed version of the repository's historical implementation path. It matters because the safest future roadmap should follow the same logic that produced the current architecture.

### Phase 0: Start with almost nothing

Start commit:

- `07800c0` `chore: 初始化仓库`

Meaning:

- The repository started with minimal ceremony
- There was no long scaffolding phase
- The intent was to prove the product through implementation, not through planning artifacts

Implementation logic:

- move fast
- establish proof through working code
- avoid premature process overhead

### Phase 1: Build the entire transport loop immediately

Key commit:

- `601f4ae` `feat: 实现 bb-browser 核心功能`

What was created:

- monorepo package structure
- CLI
- daemon
- extension
- shared protocol
- initial commands: `open`, `snapshot`, `click`, `fill`

Implementation logic:

- the first hard problem is not any one command
- the first hard problem is end-to-end transport
- if `CLI -> daemon -> extension -> browser -> result` works, the product is viable

This is the foundational design decision of the project.

### Phase 2: Expand the command vocabulary fast

Key commits:

- close
- screenshot
- get
- wait
- scroll
- press
- back/forward/refresh
- hover
- eval
- type
- check/uncheck
- select
- tab
- dialog
- frame

Implementation logic:

- once the transport exists, command additions become relatively cheap
- agent usefulness depends on a broad primitive set
- better to ship many atomic capabilities first than to over-design abstractions too early

This phase gave the product enough expressive power to be broadly useful.

### Phase 3: Hit MV3 and execution-context limits

Key commits:

- `c16b442`
- `c74fca3`
- `8395ae7`

Problems discovered:

- extension execution world was not always the same as page execution world
- MV3 CSP made some script execution patterns unreliable
- navigation behavior had edge cases

Implementation logic:

- browser extension mechanics alone are not a strong enough primitive
- the product needs browser-native control, not browser-adjacent hacks

This led directly to the CDP migration.

### Phase 4: Migrate the core browser operations to CDP

Key commit:

- `827f24d` `feat: v2.0 CDP 架构迁移 - 使用 chrome.debugger 实现所有 DOM 操作`

Then cleanup:

- `4304883` `refactor: 清理旧代码 - 移除 Content Script，精简 dom-service`

What changed:

- `chrome.debugger` / CDP became the main implementation layer
- strong DOM targeting and input dispatch became possible
- the old path was removed quickly to avoid split architecture

Implementation logic:

- validate with the simpler model first
- replatform once real limitations become obvious
- do not keep two competing browser-execution models unless absolutely necessary

This was the most important internal rewrite.

### Phase 5: Add observability and traceability

Key commits:

- `02edcb4` network / console / errors
- `f02b081` trace
- `fa39bdb` trace fixes

What changed:

- website behavior became inspectable
- user actions became recordable
- the tool became useful for reverse engineering, not only control

Implementation logic:

- agents need introspection, not just actuation
- website automation without network/debug visibility is too weak
- trace is a bridge from human browsing to programmable workflows

### Phase 6: Solve real-world browser lifecycle and multi-tab issues

Key commits:

- `9582e10` `open --tab`
- `4c7c64f` fix MV3 service worker sleep
- `1acfb60` tab operations by `tabId`
- `7acd596` global `--tab`
- `ca78b45` configurable upstream URL
- `e67e69f` reconnect on upstream change

What changed:

- tab isolation became explicit
- the daemon-extension relationship became more flexible
- the system became more robust against MV3 lifecycle problems

Implementation logic:

- toy automation is easy
- concurrent, long-lived browser control is hard
- stable tab identity and connection recovery are non-optional

### Phase 7: Improve the page model for AI

Key commits:

- `e66256a` switch snapshot to CDP Accessibility Tree
- `2bc77bc` flatten interactive snapshot output

What changed:

- page representation moved from DOM-oriented extraction to semantic accessibility-tree output

Implementation logic:

- raw DOM is too noisy for LLMs
- accessibility metadata gives roles, names, and structure
- the snapshot output should optimize for reasoning, not just for raw fidelity

This is one of the most strategically important product decisions in the repo.

### Phase 8: Move from browser control to website abstraction

Key commits:

- `5668470` add `fetch` and `recipe`
- `f63a1f4` rename `recipe` -> `site`

What changed:

- authenticated browser-context fetch became first-class
- site-level commands became the main abstraction for website integration

Implementation logic:

- the real power is not clicking buttons forever
- the real power is exposing website capabilities through reusable adapters
- `site` is clearer than `recipe` because it describes the user-facing unit of value

This is the point where the project's real moat becomes visible.

### Phase 9: Make it agent-native with MCP

Key commits:

- `537e553` add MCP server
- `cb28e81` add `--mcp`
- `fa33c5a` auto-start daemon
- `1f15f3e` setup hints
- follow-up setup hint fixes

What changed:

- the tool became directly callable from agent systems
- setup friction was reduced
- runtime diagnostics became more important

Implementation logic:

- the product already fit agent use
- MCP is the standard transport to expose that value
- setup failure handling is part of product quality

### Phase 10: Converge product narrative around `site`

Key commits:

- `4df715e`
- `bed7fbd`
- `73c4891`

What changed:

- README positioning shifted
- CLI help prioritized the `site` system
- version reached `0.4.5`

Implementation logic:

- the project is not just "browser automation"
- the hero feature is "turn websites into callable interfaces"
- docs and help should reflect the true center of gravity

## What the Repository’s Development Style Tells Us

Across the full interval, the development pattern is consistent:

### 1. Prove value with an end-to-end loop first

They solved transport before polishing UX.

### 2. Add breadth before abstraction

They expanded commands aggressively before inventing higher-order systems.

### 3. Replace weak internals when pressure appears

They did not romanticize the first implementation.

### 4. Add observability as soon as control becomes nontrivial

They recognized that browser control without debugging is insufficient.

### 5. Shift toward agent ergonomics over time

This shows up in:

- AX-tree snapshots
- `site`
- MCP
- better setup guidance

### 6. Let documentation catch up to product truth

The README evolution matters. It reflects the product learning loop, not just copywriting.

## Architectural Invariants: Do Not Break These

These are the core constraints future work should preserve unless there is a deliberate redesign.

### Invariant 1: Keep the transport split

The current separation is good:

- CLI/MCP stay lightweight
- daemon coordinates transport
- extension executes in browser
- shared package owns protocol definitions

Do not collapse all of this into one large process unless you want to re-open many solved problems.

### Invariant 2: CDP is the main execution primitive

The codebase already paid the cost of learning that extension-only DOM control is too weak.

Do not regress toward:

- content-script-heavy execution as the primary path
- selector-only interaction without debugger support
- browser-world confusion around `eval`

If a new feature can be implemented with CDP cleanly, prefer that.

### Invariant 3: Accessibility snapshots are the AI-facing page model

The snapshot output is not a random implementation detail.

It is the core language-model interface to the page.

Do not casually switch back to:

- raw DOM dumps
- verbose HTML output
- selector-driven interaction as the main human/agent interface

### Invariant 4: `tabId` matters more than tab index

Humans like indexes.

Reliable automation needs stable machine identities.

Any future feature that targets tabs should preserve `tabId`-first behavior.

### Invariant 5: `site` is not a side feature

The project history shows that `site` became the product center.

Do not treat it as an extra command family. It is a main abstraction layer.

### Invariant 6: MCP is a first-class surface

MCP is not a wrapper added for convenience. It is part of the product strategy.

Any new meaningful browser capability should be evaluated for:

- CLI exposure
- MCP exposure

## Known Pitfalls and How Not to Reintroduce Them

This section is the practical anti-footgun list.

### Pitfall 1: Using `localhost` casually

Problem:

- `localhost` may resolve to `::1`
- some environments behave differently for IPv4 vs IPv6
- the daemon already showed listen/connect issues around this

Current safe baseline:

- use `127.0.0.1`

Do not revert this unless you deliberately add dual-stack support and test it.

### Pitfall 2: Breaking npm-published layout

Problem:

- dev paths and published `dist` paths are different

This already caused fixes in daemon path resolution.

Before changing CLI/daemon startup logic, test:

- workspace build layout
- direct `dist/` execution
- npm-style package layout assumptions

### Pitfall 3: Regressing MV3 service worker resilience

Problem:

- MV3 service workers sleep
- sleeping breaks connections and state assumptions

The project already added:

- keepalive behavior
- reconnection logic
- storage-backed state in some paths

Any change around extension lifecycle must be tested against:

- idle periods
- tab navigation
- extension reload
- daemon restart

### Pitfall 4: Confusing page-world execution with extension-world execution

Problem:

- not all page JS is visible/usable from the same context
- MV3 rules make this easy to get wrong

Rule:

- if you need genuine page-context behavior, be explicit about the execution path
- prefer CDP-backed evaluation where appropriate

### Pitfall 5: Treating snapshots as stable forever

Problem:

- refs become stale after navigation or DOM changes

Implication:

- future workflow features need explicit ref invalidation or recovery strategies
- do not assume ref reuse without page-state awareness

### Pitfall 6: Reintroducing tab-index assumptions

Problem:

- index-based targeting is unstable under concurrent browsing

Rule:

- new multi-tab features should expose or preserve `tabId`
- avoid building important flows that depend only on visual order

### Pitfall 7: Making `site` more powerful but less debuggable

Problem:

- `site` is already strong because it can reuse browser login state
- but stronger adapters become harder to debug if errors are opaque

Rule:

- any future `site` upgrade should improve:
  - auth failure hints
  - reporting hints
  - network visibility
  - adapter runtime diagnostics

### Pitfall 8: Forgetting the onboarding path

Problem:

- this product has multiple moving parts
- a technically correct feature is still a product regression if setup becomes harder

Rule:

- after adding capabilities, re-check:
  - extension setup messages
  - daemon reachability messages
  - doctor/health diagnostics
  - README / help consistency

## Current State After the Rename/Upgrade Pass

The current repository has already been upgraded beyond `73c4891` in the following ways:

- rebranded to `iatlas-browser`
- version unified to `0.5.0`
- CLI parser bug fixed
- daemon default host normalized to `127.0.0.1`
- `doctor` command added
- package identities and docs updated

This matters because future work should build on the current repo state, not only on the historical state.

## Recommended Iteration Strategy From Here

The safest way to continue the project is to preserve the historical development logic:

1. strengthen the foundation where current pressure exists
2. add agent-facing leverage
3. only then widen capability again

### Priority 0: Reliability and Operational Safety

Do these first:

- per-tab command scheduling / serialization
- explicit cancellation and timeout handling for long operations
- stronger daemon/extension reconnection state model
- better stale-ref detection and recovery
- more complete `doctor` checks

Why first:

- these reduce failure rates across every higher-level feature

### Priority 1: Safer and Stronger `site` Runtime

Do next:

- introduce a typed adapter SDK/runtime
- replace raw ad hoc execution with a more structured contract
- improve adapter testing and fixture support
- add trust levels / capability declarations for adapters

Why next:

- `site` is the product center
- this is the highest leverage area for product differentiation

### Priority 2: Workflow Layer on Top of Primitives

Then add:

- trace -> replayable script generation
- common workflow helpers
- `wait-for-text`, `paginate`, `extract-table`, `download`, retry helpers
- richer page-state orchestration

Why:

- the primitive layer is already broad
- the next step is reducing the amount of manual orchestration needed

### Priority 3: Stronger Agent Experience

Then improve:

- MCP tool coverage parity with CLI
- richer MCP instructions
- machine-readable error categories
- paginated or streamed outputs for large payloads

Why:

- this compounds the project’s agent value without destabilizing browser internals

## Safe Upgrade Checklist

Before merging any meaningful iteration, check all of the following.

### Build and packaging

- `pnpm install`
- `pnpm build`
- CLI help renders correctly
- version output is correct
- daemon path resolution still works from built `dist/`

### Core runtime

- daemon starts
- extension can connect
- `doctor` reports expected state
- snapshot still works
- basic interaction commands still work

### Multi-tab behavior

- `tab list`
- `tab select --id`
- global `--tab`
- opening in current tab vs new tab

### Agent surfaces

- MCP starts
- one representative MCP browser tool works
- `site` help and `guide` output are still coherent

### Failure behavior

- daemon not running
- extension not connected
- auth-required `site` failure
- invalid tab / stale tab
- bad ref

If a feature passes only the happy path, it is not ready.

## Suggested Upgrade Roadmap

This is the recommended order for the next substantial upgrades.

### Roadmap A: Reliability-first

1. per-tab command queue
2. cancellation / timeout propagation
3. stale-ref recovery
4. stronger doctor diagnostics
5. extension reconnect state cleanup

### Roadmap B: Product-center first

1. typed `site` SDK
2. adapter test harness
3. auth-aware helper library
4. trace-to-adapter bootstrap
5. adapter trust model

### Roadmap C: Agent-first

1. CLI/MCP parity audit
2. richer MCP tool descriptions
3. structured error codes
4. paginated/streamed outputs
5. workflow-level MCP tools

## Final Recommendation

If the goal is to iterate safely and avoid future rework, use this decision order:

1. protect the transport architecture
2. protect CDP as the execution backbone
3. protect AX snapshots as the agent-facing page model
4. strengthen `site`
5. improve reliability before adding flashy breadth

That order is consistent with how the repository evolved from `07800c0` to `73c4891`, and it remains the best path for future upgrades.

This file should be treated as the main working engineering reference.
