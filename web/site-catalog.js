async function loadJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}`);
  }
  return response.json();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttribute(value) {
  return escapeHtml(value)
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function createArgHelp(args) {
  if (!args.length) {
    return "<p class=\"subtle\">No arguments.</p>";
  }

  return `
    <ul>
      ${args.map((arg) => `<li><strong>${escapeHtml(arg.name)}</strong>${arg.required ? " (required)" : ""} ${arg.description ? `- ${escapeHtml(arg.description)}` : ""}</li>`).join("")}
    </ul>
  `;
}

function createCard(entry) {
  const mcpJson = JSON.stringify(entry.mcpExample, null, 2);
  const apiLookup = `curl -s "https://miaoda.vip/v1/catalog/site?name=${encodeURIComponent(entry.name)}"`;
  const capabilityText = entry.capabilities.length ? entry.capabilities.join(", ") : "none";

  return `
    <article class="card catalog-card">
      <p class="kicker">${escapeHtml(entry.platform)}</p>
      <h3>${escapeHtml(entry.name)}</h3>
      <p>${escapeHtml(entry.description || "No description")}</p>
      <p class="subtle">Domain: <code>${escapeHtml(entry.domain || "n/a")}</code> · Read-only: <code>${entry.readOnly ? "true" : "false"}</code> · Capabilities: <code>${escapeHtml(capabilityText)}</code></p>
      ${createArgHelp(entry.args)}
      <p class="panel-label">CLI</p>
      <pre><code>${escapeHtml(entry.cliExample)}</code></pre>
      <button class="copy" data-copy="${escapeAttribute(entry.cliExample)}">Copy CLI</button>
      <p class="panel-label">MCP</p>
      <pre><code>${escapeHtml(mcpJson)}</code></pre>
      <button class="copy" data-copy="${escapeAttribute(mcpJson)}">Copy MCP</button>
      <p class="panel-label">Catalog API</p>
      <pre><code>${escapeHtml(apiLookup)}</code></pre>
      <button class="copy" data-copy="${escapeAttribute(apiLookup)}">Copy API lookup</button>
    </article>
  `;
}

async function initCatalogPage() {
  const grid = document.getElementById("catalog-grid");
  const summary = document.getElementById("catalog-summary");
  const searchInput = document.getElementById("catalog-search");
  const platformSelect = document.getElementById("catalog-platform");

  if (!grid || !summary || !searchInput || !platformSelect) {
    return;
  }

  const [sites, platforms] = await Promise.all([
    loadJson("/catalog/sites.json"),
    loadJson("/catalog/platforms.json"),
  ]);

  for (const platform of platforms) {
    const option = document.createElement("option");
    option.value = platform.name;
    option.textContent = `${platform.name} (${platform.count})`;
    platformSelect.appendChild(option);
  }

  function render() {
    const query = searchInput.value.trim().toLowerCase();
    const platform = platformSelect.value;
    const filtered = sites.filter((entry) => {
      const matchesQuery = !query
        || entry.name.toLowerCase().includes(query)
        || entry.description.toLowerCase().includes(query)
        || entry.domain.toLowerCase().includes(query);
      const matchesPlatform = !platform || entry.platform === platform;
      return matchesQuery && matchesPlatform;
    });

    summary.textContent = `${filtered.length} adapters shown · ${sites.length} total adapters · ${platforms.length} platforms`;
    grid.innerHTML = filtered.map(createCard).join("");
  }

  searchInput.addEventListener("input", render);
  platformSelect.addEventListener("change", render);
  render();
}

initCatalogPage().catch((error) => {
  const summary = document.getElementById("catalog-summary");
  if (summary) {
    summary.textContent = error instanceof Error ? error.message : "Failed to load catalog";
  }
});
