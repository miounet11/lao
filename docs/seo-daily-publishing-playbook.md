# SEO Daily Publishing Playbook

## Goal

Publish five new SEO pages per day around real user demand without hand-editing static HTML every time.

## Source Of Truth

- content queue: `content/seo-posts.json`
- generator: `scripts/generate-seo-content.mjs`
- deploy helper: `scripts/publish-static-site.sh`
- public hub: `/learn/`
- feed: `/feed.xml`
- sitemap: `/sitemap.xml`

## Publishing Model

Each content entry has:

- `slug`
- `title`
- `description`
- `publishDate`
- `status`
- `cluster`
- `intent`
- `audience`
- `keywords`
- article body fields

The generator publishes entries when:

- `status` is `published`
- or `status` is `scheduled` and `publishDate <= current date`

This means future content can be committed ahead of time and revealed automatically by date.

## Daily Output Target

Five pages per day, split across these clusters:

1. authenticated browser automation
2. MCP browser tools and agent workflows
3. local browser API and localhost control
4. hosted API retrieval and metadata use cases
5. adapter selection, site workflows, and comparisons

## Local Commands

Generate the current publish set:

```bash
node scripts/generate-seo-content.mjs
```

Generate as if it were a future date:

```bash
PUBLISH_DATE=2026-03-17 node scripts/generate-seo-content.mjs
```

Publish static output into the live site directory:

```bash
TARGET_DIR=/srv/miaoda.vip bash scripts/publish-static-site.sh
```

## Content Workflow

1. Add at least five new entries to `content/seo-posts.json`.
2. Set `publishDate` for the target day.
3. Keep titles close to real search phrasing.
4. Keep descriptions commercially useful, not generic.
5. Run the generator locally and verify `/learn/`, `feed.xml`, and `sitemap.xml`.
6. Deploy the regenerated `web/` directory.

## Server Automation

Recommended cron pattern:

```cron
CRON_TZ=Asia/Shanghai
15 0 * * * cd /srv/iatlas-browser-site-src && git pull --ff-only origin main && bash scripts/publish-static-site.sh >> /var/log/iatlas-browser-seo.log 2>&1
```

This does three things every day:

1. pulls the latest scheduled content
2. regenerates the site using the current date
3. syncs the static output into `/srv/miaoda.vip`

## Quality Rules

- Each page should target one main user problem.
- Keep internal links to `/`, `/openapi/`, `/sites/`, and `/learn/`.
- Do not blur the core boundary:
  - local runtime = real browser, real session, full power
  - hosted API = public, narrow, remote-safe subset
- Update `keywords`, `cluster`, and `intent` honestly.
- Avoid filler pages that restate the same title with different wording.

## Operational Checks

After each publish:

- check `/learn/`
- check one new article page
- check `/feed.xml`
- check `/sitemap.xml`
- check that the top nav still includes `Learn`
- confirm live pages return `HTTP 200`
