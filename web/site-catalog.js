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
  const hosted = Boolean(entry.execution?.hosted);
  const hostedApi = hosted
    ? `curl -s https://miaoda.vip/v1/sites/run \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(entry.execution.apiExample.body)}'`
    : "";
  const badge = hosted
    ? '<span class="status-badge hosted">Hosted API</span>'
    : '<span class="status-badge local">Local runtime / MCP</span>';

  return `
    <article class="card catalog-card">
      <p class="kicker">${escapeHtml(entry.platform)}</p>
      ${badge}
      <h3>${escapeHtml(entry.name)}</h3>
      <p>${escapeHtml(entry.description || "No description")}</p>
      <p class="subtle">Domain: <code>${escapeHtml(entry.domain || "n/a")}</code> · Read-only: <code>${entry.readOnly ? "true" : "false"}</code> · Capabilities: <code>${escapeHtml(capabilityText)}</code></p>
      <p class="subtle">${escapeHtml(entry.execution?.notes || "")}</p>
      ${createArgHelp(entry.args)}
      <p class="panel-label">CLI</p>
      <pre><code>${escapeHtml(entry.cliExample)}</code></pre>
      <button class="copy" data-copy="${escapeAttribute(entry.cliExample)}">Copy CLI</button>
      <p class="panel-label">MCP</p>
      <pre><code>${escapeHtml(mcpJson)}</code></pre>
      <button class="copy" data-copy="${escapeAttribute(mcpJson)}">Copy MCP</button>
      ${hosted ? `
      <p class="panel-label">Hosted API</p>
      <pre><code>${escapeHtml(hostedApi)}</code></pre>
      <button class="copy" data-copy="${escapeAttribute(hostedApi)}">Copy hosted API</button>
      ` : ""}
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
  const hostedOnlyInput = document.getElementById("catalog-hosted-only");
  const runnerForm = document.getElementById("hosted-runner-form");
  const runnerApiKey = document.getElementById("runner-api-key");
  const runnerSiteName = document.getElementById("runner-site-name");
  const runnerSiteArgs = document.getElementById("runner-site-args");
  const runnerSiteResult = document.getElementById("runner-site-result");

  if (
    !grid || !summary || !searchInput || !platformSelect || !hostedOnlyInput
    || !runnerForm || !runnerApiKey || !runnerSiteName || !runnerSiteArgs || !runnerSiteResult
  ) {
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

  const hostedSites = sites.filter((entry) => entry.execution?.hosted);
  for (const entry of hostedSites) {
    const option = document.createElement("option");
    option.value = entry.name;
    option.textContent = entry.name;
    runnerSiteName.appendChild(option);
  }

  function syncRunnerArgs() {
    const selected = sites.find((entry) => entry.name === runnerSiteName.value);
    const exampleArgs = selected?.execution?.apiExample?.body?.args ?? {};
    runnerSiteArgs.value = JSON.stringify(exampleArgs, null, 2);
  }

  runnerSiteName.addEventListener("change", syncRunnerArgs);
  syncRunnerArgs();

  runnerForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!runnerApiKey.value.trim()) {
      runnerSiteResult.textContent = "Paste an API key first.";
      return;
    }

    if (!runnerSiteName.value) {
      runnerSiteResult.textContent = "Choose a hosted adapter first.";
      return;
    }

    let args;
    try {
      args = JSON.parse(runnerSiteArgs.value || "{}");
    } catch {
      runnerSiteResult.textContent = "Arguments must be valid JSON.";
      return;
    }

    runnerSiteResult.textContent = "Running...";

    try {
      const response = await fetch("/v1/sites/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${runnerApiKey.value.trim()}`,
        },
        body: JSON.stringify({
          name: runnerSiteName.value,
          args,
        }),
      });

      const payload = await response.json();
      runnerSiteResult.textContent = JSON.stringify(payload, null, 2);
    } catch (error) {
      runnerSiteResult.textContent = error instanceof Error ? error.message : "Hosted run failed";
    }
  });

  function render() {
    const query = searchInput.value.trim().toLowerCase();
    const platform = platformSelect.value;
    const hostedOnly = hostedOnlyInput.checked;
    const filtered = sites.filter((entry) => {
      const matchesQuery = !query
        || entry.name.toLowerCase().includes(query)
        || entry.description.toLowerCase().includes(query)
        || entry.domain.toLowerCase().includes(query);
      const matchesPlatform = !platform || entry.platform === platform;
      const matchesHosted = !hostedOnly || Boolean(entry.execution?.hosted);
      return matchesQuery && matchesPlatform && matchesHosted;
    });

    const hostedCount = sites.filter((entry) => entry.execution?.hosted).length;
    summary.textContent = `${filtered.length} adapters shown · ${sites.length} total adapters · ${hostedCount} hosted on miaoda.vip · ${platforms.length} platforms`;
    grid.innerHTML = filtered.map(createCard).join("");
  }

  searchInput.addEventListener("input", render);
  platformSelect.addEventListener("change", render);
  hostedOnlyInput.addEventListener("change", render);
  render();
}

initCatalogPage().catch((error) => {
  const summary = document.getElementById("catalog-summary");
  if (summary) {
    summary.textContent = error instanceof Error ? error.message : "Failed to load catalog";
  }
});
