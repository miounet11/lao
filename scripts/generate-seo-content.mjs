import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dateInTimezone, seoTimezone } from "./seo-config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outputRoot = process.env.SEO_OUTPUT_ROOT
  ? path.resolve(repoRoot, process.env.SEO_OUTPUT_ROOT)
  : path.join(repoRoot, "web");
const contentRoot = path.join(repoRoot, "content");
const learnRoot = path.join(outputRoot, "learn");
const siteUrl = "https://miaoda.vip";
const publishDate = process.env.PUBLISH_DATE || dateInTimezone();

const staticPages = [
  { loc: `${siteUrl}/`, priority: "1.0" },
  { loc: `${siteUrl}/zh-cn/`, priority: "0.9" },
  { loc: `${siteUrl}/ja/`, priority: "0.8" },
  { loc: `${siteUrl}/es/`, priority: "0.8" },
  { loc: `${siteUrl}/openapi/`, priority: "0.9" },
  { loc: `${siteUrl}/sites/`, priority: "0.9" },
  { loc: `${siteUrl}/learn/`, priority: "0.9" },
];

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function formatDate(dateString) {
  return new Date(`${dateString}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function sortPosts(posts) {
  return [...posts].sort((a, b) => {
    if (a.publishDate === b.publishDate) {
      return a.title.localeCompare(b.title);
    }
    return a.publishDate < b.publishDate ? 1 : -1;
  });
}

function isPublished(post) {
  return post.status === "published" || (post.status === "scheduled" && post.publishDate <= publishDate);
}

function renderTopbar(active) {
  const links = [
    { href: "/", label: "Home" },
    { href: "/openapi/", label: "Open API" },
    { href: "/sites/", label: "Sites" },
    { href: "/learn/", label: "Learn" },
    { href: "/zh-cn/", label: "中文" },
    { href: "/ja/", label: "日本語" },
    { href: "/es/", label: "Español" },
  ];

  return `
    <header class="topbar">
      <a class="brand" href="/">iatlas-browser</a>
      <nav class="lang-switch" aria-label="Primary links">
        ${links.map((link) => `<a${active === link.href ? ' class="is-active"' : ""} href="${link.href}">${link.label}</a>`).join("")}
      </nav>
    </header>
  `;
}

function renderArticlePage(post, relatedPosts) {
  const canonical = `${siteUrl}/learn/${post.slug}/`;
  const articleLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.publishDate,
    dateModified: post.publishDate,
    author: {
      "@type": "Organization",
      name: "iatlas-browser",
    },
    publisher: {
      "@type": "Organization",
      name: "iatlas-browser",
    },
    mainEntityOfPage: canonical,
    keywords: post.keywords.join(", "),
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(post.title)} | iatlas-browser Learn</title>
  <meta name="description" content="${escapeHtml(post.description)}">
  <meta name="keywords" content="${escapeHtml(post.keywords.join(","))}">
  <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">
  <link rel="canonical" href="${canonical}">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${escapeHtml(post.title)}">
  <meta property="og:description" content="${escapeHtml(post.description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:site_name" content="iatlas-browser">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(post.title)}">
  <meta name="twitter:description" content="${escapeHtml(post.description)}">
  <link rel="stylesheet" href="/styles.css">
  <script type="application/ld+json">${JSON.stringify(articleLd)}</script>
</head>
<body>
  <main class="page">
    ${renderTopbar("/learn/")}

    <section class="hero hero-slim">
      <div class="hero-copy">
        <p class="eyebrow">Learn · ${escapeHtml(post.cluster)}</p>
        <h1>${escapeHtml(post.title)}</h1>
        <p class="lede">${escapeHtml(post.description)}</p>
        <div class="badge-row">
          <span>${escapeHtml(formatDate(post.publishDate))}</span>
          <span>${escapeHtml(post.intent)}</span>
          <span>${escapeHtml(post.audience)}</span>
        </div>
      </div>
      <aside class="hero-panel">
        <p class="panel-label">Search focus</p>
        <ul class="compact-list">
          ${post.keywords.map((keyword) => `<li>${escapeHtml(keyword)}</li>`).join("")}
        </ul>
        <p class="panel-label">Product boundary</p>
        <ul class="compact-list">
          <li>Use the local runtime when the task depends on login state, tabs, or live page context.</li>
          <li>Use the hosted API only for public retrieval and hosted read-only adapters.</li>
        </ul>
        <div class="hero-actions">
          <a class="button primary" href="${post.ctaHref}">${escapeHtml(post.ctaLabel)}</a>
          <a class="button" href="/">Local runtime homepage</a>
          <a class="button ghost" href="/learn/">Back to Learn</a>
        </div>
      </aside>
    </section>

    <section class="section">
      <div class="article-shell">
        <aside class="panel article-rail">
          <p class="panel-label">Quick summary</p>
          <p class="subtle">${escapeHtml(post.intro)}</p>
          <p class="panel-label">Cluster</p>
          <p>${escapeHtml(post.cluster)}</p>
          <p class="panel-label">Intent</p>
          <p>${escapeHtml(post.intent)}</p>
        </aside>
        <article class="panel article-body">
          <section class="article-section">
            <p class="kicker">Why This Search Exists</p>
            ${post.problem.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}
          </section>
          <section class="article-section">
            <p class="kicker">Recommended Approach</p>
            ${post.solution.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}
          </section>
          <section class="article-section">
            <p class="kicker">Key Takeaways</p>
            <ul>
              ${post.takeaways.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
            </ul>
          </section>
          <section class="article-section">
            <p class="kicker">Fast Start</p>
            <ol>
              ${post.steps.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
            </ol>
          </section>
          <section class="cta article-cta">
            <div>
              <p class="kicker">Next Action</p>
              <h2>${escapeHtml(post.ctaLabel)}</h2>
              <p>Move from research to implementation by choosing the correct boundary: local runtime for real-session work, hosted API for public-safe retrieval.</p>
            </div>
            <div class="hero-actions">
              <a class="button primary" href="${post.ctaHref}">${escapeHtml(post.ctaLabel)}</a>
              <a class="button" href="/">Local runtime homepage</a>
              <a class="button ghost" href="/openapi/">Hosted API docs</a>
            </div>
          </section>
        </article>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <p class="kicker">Related Guides</p>
        <h2>More pages around the same buyer and builder intent</h2>
      </div>
      <div class="grid three article-list">
        ${relatedPosts.map((entry) => `
          <article class="card article-card">
            <p class="kicker">${escapeHtml(entry.cluster)}</p>
            <h3><a href="/learn/${entry.slug}/">${escapeHtml(entry.title)}</a></h3>
            <p>${escapeHtml(entry.description)}</p>
            <p class="subtle">${escapeHtml(formatDate(entry.publishDate))}</p>
          </article>
        `).join("")}
      </div>
    </section>

    <footer class="footer">
      <p><a href="/learn/">Learn hub</a> · <a href="/">Homepage</a> · <a href="/feed.xml">RSS feed</a></p>
      <p class="subtle">SEO cluster: ${escapeHtml(post.cluster)}. Core thesis: use your logged-in Chrome as an API for real-session browser work.</p>
    </footer>
  </main>
</body>
</html>`;
}

function renderLearnIndex(publishedPosts) {
  const featured = publishedPosts.slice(0, 3);
  const clusters = [...new Set(publishedPosts.map((post) => post.cluster))].slice(0, 8);
  const blogLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "iatlas-browser Learn",
    description: "SEO and educational content around browser automation, MCP browser tools, hosted adapter APIs, and local browser workflows.",
    url: `${siteUrl}/learn/`,
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>iatlas-browser Learn | Guides for Authenticated Browser Automation and Hosted Retrieval</title>
  <meta name="description" content="Read iatlas-browser guides about authenticated browser automation, login-state browser workflows, MCP browser servers, hosted public retrieval, and local browser APIs.">
  <meta name="keywords" content="authenticated browser automation,login state browser automation,mcp browser server,local browser api,webpage metadata api,site adapters">
  <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">
  <link rel="canonical" href="${siteUrl}/learn/">
  <meta property="og:type" content="website">
  <meta property="og:title" content="iatlas-browser Learn | Authenticated Browser Automation Guides">
  <meta property="og:description" content="Guides about the boundary between real-session browser automation and hosted public retrieval.">
  <meta property="og:url" content="${siteUrl}/learn/">
  <meta property="og:site_name" content="iatlas-browser">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="iatlas-browser Learn | Authenticated Browser Automation Guides">
  <meta name="twitter:description" content="Guides about local real-session browser control, MCP tooling, and hosted public retrieval.">
  <link rel="stylesheet" href="/styles.css">
  <script type="application/ld+json">${JSON.stringify(blogLd)}</script>
</head>
<body>
  <main class="page">
    ${renderTopbar("/learn/")}

    <section class="hero hero-slim">
      <div class="hero-copy">
        <p class="eyebrow">Learn hub for real-session browser automation and hosted retrieval</p>
        <h1>Research the boundary between hosted API work and real browser-session work.</h1>
        <p class="lede">
          This hub is built around the problems users actually have: browser automation with login state, MCP browser tools,
          local browser APIs, public hosted retrieval, and adapter-driven workflows. The publishing system ships five new pages
          per day, but the core thesis stays consistent: use the local runtime when the browser context matters, and use the
          hosted API when the task is public and remote-safe.
        </p>
        <div class="pill-row">
          <span>Authenticated browser automation</span>
          <span>Hosted public retrieval</span>
          <span>Local runtime vs hosted API boundary</span>
        </div>
        <div class="hero-actions">
          <a class="button primary" href="/install.sh">Install local runtime</a>
          <a class="button" href="/openapi/">Open API docs</a>
          <a class="button" href="/">Homepage</a>
          <a class="button ghost" href="/feed.xml">RSS feed</a>
        </div>
      </div>
      <aside class="hero-panel">
        <p class="panel-label">What this hub explains</p>
        <ul class="compact-list">
          <li>When to keep the work in your own Chrome session</li>
          <li>When a hosted public endpoint is the right abstraction</li>
          <li>How MCP, CLI, adapters, and local HTTP fit together</li>
        </ul>
        <p class="panel-label">Publishing model</p>
        <ul class="compact-list">
          <li>Five scheduled SEO pages per day</li>
          <li>Built from a source content queue</li>
          <li>Published through static regeneration and sitemap updates</li>
        </ul>
      </aside>
    </section>

    <section class="badge-row">
      ${clusters.map((cluster) => `<span>${escapeHtml(cluster)}</span>`).join("")}
    </section>

    <section class="section">
      <div class="section-head">
        <p class="kicker">Featured</p>
        <h2>The latest guides users actually need before integrating</h2>
      </div>
      <div class="grid three article-list">
        ${featured.map((post) => `
          <article class="card article-card">
            <p class="kicker">${escapeHtml(post.cluster)}</p>
            <h3><a href="/learn/${post.slug}/">${escapeHtml(post.title)}</a></h3>
            <p>${escapeHtml(post.description)}</p>
            <p class="subtle">${escapeHtml(formatDate(post.publishDate))}</p>
          </article>
        `).join("")}
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <p class="kicker">All Guides</p>
        <h2>Current published guides</h2>
      </div>
      <div class="grid two article-list">
        ${publishedPosts.map((post) => `
          <article class="card article-card">
            <p class="kicker">${escapeHtml(post.cluster)}</p>
            <h3><a href="/learn/${post.slug}/">${escapeHtml(post.title)}</a></h3>
            <p>${escapeHtml(post.description)}</p>
            <p class="subtle">${escapeHtml(formatDate(post.publishDate))} · ${escapeHtml(post.intent)} · ${escapeHtml(post.audience)}</p>
          </article>
        `).join("")}
      </div>
    </section>

    <footer class="footer">
      <p><a href="/">Homepage</a> · <a href="/feed.xml">RSS feed</a> · <a href="/sitemap.xml">Sitemap</a></p>
      <p class="subtle">SEO focus: authenticated browser automation, MCP browser tools, local browser API, hosted public retrieval, and hosted adapter boundaries.</p>
    </footer>
  </main>
</body>
</html>`;
}

function renderFeed(publishedPosts) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>iatlas-browser Learn</title>
    <link>${siteUrl}/learn/</link>
    <description>Daily content about browser automation, MCP tools, and hosted API workflows.</description>
    <language>en-us</language>
    ${publishedPosts.map((post) => `
    <item>
      <title>${escapeHtml(post.title)}</title>
      <link>${siteUrl}/learn/${post.slug}/</link>
      <guid>${siteUrl}/learn/${post.slug}/</guid>
      <pubDate>${new Date(`${post.publishDate}T00:00:00Z`).toUTCString()}</pubDate>
      <description>${escapeHtml(post.description)}</description>
    </item>`).join("")}
  </channel>
</rss>`;
}

function renderSitemap(publishedPosts) {
  const items = [
    ...staticPages.map((page) => ({
      loc: page.loc,
      lastmod: publishDate,
      changefreq: "weekly",
      priority: page.priority,
    })),
    ...publishedPosts.map((post) => ({
      loc: `${siteUrl}/learn/${post.slug}/`,
      lastmod: post.publishDate,
      changefreq: "weekly",
      priority: "0.8",
    })),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items.map((item) => `  <url>
    <loc>${item.loc}</loc>
    <lastmod>${item.lastmod}</lastmod>
    <changefreq>${item.changefreq}</changefreq>
    <priority>${item.priority}</priority>
  </url>`).join("\n")}
</urlset>`;
}

async function main() {
  const contentFiles = (await fs.readdir(contentRoot))
    .filter((name) => /^seo-posts.*\.json$/.test(name))
    .sort();
  const batches = await Promise.all(
    contentFiles.map(async (name) => {
      const raw = await fs.readFile(path.join(contentRoot, name), "utf8");
      return JSON.parse(raw);
    }),
  );
  const allPosts = batches.flat();
  const publishedPosts = sortPosts(allPosts.filter(isPublished));

  await fs.rm(learnRoot, { recursive: true, force: true });
  await fs.mkdir(learnRoot, { recursive: true });

  await fs.writeFile(path.join(learnRoot, "index.html"), renderLearnIndex(publishedPosts), "utf8");

  for (const post of publishedPosts) {
    const articleDir = path.join(learnRoot, post.slug);
    await fs.mkdir(articleDir, { recursive: true });
    const relatedPosts = publishedPosts.filter((entry) => entry.slug !== post.slug).slice(0, 3);
    await fs.writeFile(path.join(articleDir, "index.html"), renderArticlePage(post, relatedPosts), "utf8");
  }

  await fs.writeFile(path.join(outputRoot, "feed.xml"), renderFeed(publishedPosts), "utf8");
  await fs.writeFile(path.join(outputRoot, "sitemap.xml"), renderSitemap(publishedPosts), "utf8");

  console.log(`Generated ${publishedPosts.length} published SEO pages for ${publishDate} in ${outputRoot} (${seoTimezone}).`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
