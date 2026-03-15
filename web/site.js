const apiKeyStorageKey = "iatlas-browser-api-key";

function saveApiKey(apiKey) {
  try {
    localStorage.setItem(apiKeyStorageKey, apiKey);
  } catch {}
}

function loadApiKey() {
  try {
    return localStorage.getItem(apiKeyStorageKey) || "";
  } catch {
    return "";
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function setPreResult(element, value) {
  element.innerHTML = `<code>${escapeHtml(value)}</code>`;
}

async function loadJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}`);
  }
  return response.json();
}

function formatTemplate(template, values = {}) {
  let output = template;
  for (const [key, value] of Object.entries(values)) {
    output = output.replaceAll(`{${key}}`, String(value));
  }
  return output;
}

function syncApiKeyInput(input) {
  input.value = loadApiKey();

  document.addEventListener("iatlas-api-key", (event) => {
    if (!(event instanceof CustomEvent) || !event.detail?.apiKey) {
      return;
    }
    input.value = event.detail.apiKey;
  });
}

document.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const button = target.closest(".copy");
  if (!(button instanceof HTMLElement)) {
    return;
  }

  const original = button.textContent;

  try {
    await navigator.clipboard.writeText(button.dataset.copy || "");
    button.textContent = button.dataset.copiedLabel || "Copied";
  } catch {
    button.textContent = button.dataset.failedLabel || "Copy failed";
  }

  setTimeout(() => {
    button.textContent = original;
  }, 1200);
});

for (const form of document.querySelectorAll(".signup-form")) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const emailInput = form.querySelector('input[name="email"]');
    const result = form.parentElement?.querySelector(".signup-result");
    const submitButton = form.querySelector('button[type="submit"]');

    if (!(emailInput instanceof HTMLInputElement) || !(submitButton instanceof HTMLButtonElement) || !(result instanceof HTMLElement)) {
      return;
    }

    const email = emailInput.value.trim();
    if (!email) {
      result.textContent = form.dataset.invalidEmail || "Enter a valid email address.";
      result.dataset.state = "error";
      return;
    }

    const originalButtonText = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = form.dataset.loadingLabel || "Creating key...";
    result.textContent = "";
    result.dataset.state = "idle";

    try {
      const response = await fetch("/v1/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload?.error?.message || "Failed to create API key");
      }

      const apiKey = payload.apiKey;
      saveApiKey(apiKey);
      document.dispatchEvent(new CustomEvent("iatlas-api-key", { detail: { apiKey } }));
      const example = [
        `API_KEY=${apiKey}`,
        `curl -s https://miaoda.vip/v1/usage -H "Authorization: Bearer $API_KEY"`,
        `curl -s https://miaoda.vip/v1/open -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" -d '{"url":"https://example.com","mode":"metadata"}'`,
      ].join("\n");

      result.innerHTML = `
        <p><strong>${form.dataset.successLabel || "API key created"}</strong></p>
        <pre><code>${apiKey}</code></pre>
        <p>${form.dataset.keepSafeLabel || "Store this key now. The site will not display it again."}</p>
        <pre><code>${example.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</code></pre>
      `;
      result.dataset.state = "success";
      emailInput.value = "";
    } catch (error) {
      result.textContent = error instanceof Error ? error.message : "Failed to create API key";
      result.dataset.state = "error";
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = originalButtonText;
    }
  });
}

const demoExamples = {
  "local-cli": {
    title: "Local CLI for the browser you already control",
    summary: "Use direct terminal commands when you want the fastest path into your current authenticated browser session.",
    points: [
      "Good for debugging, navigation, snapshots, clicks, and iterative browser work.",
      "Runs through your local daemon and extension against your live Chrome session.",
      "Best starting point when the job depends on existing tabs or login state.",
    ],
    code: [
      "iatlas-browser open https://app.example.com",
      "iatlas-browser snapshot -i",
      "iatlas-browser click @3",
    ].join("\n"),
    linkHref: "/install.sh",
    linkLabel: "Get install.sh",
  },
  "mcp": {
    title: "MCP when an AI coding tool needs your browser",
    summary: "Use MCP to expose the same local runtime to Cursor, Claude Desktop, or any other MCP-compatible client.",
    points: [
      "Best when an agent needs structured browser tools instead of shell-only access.",
      "Keeps the real-browser execution model while making tool calling predictable.",
      "Works well for repeatable flows where the assistant needs browser context over multiple steps.",
    ],
    code: [
      "iatlas-browser mcp-config cursor",
      "iatlas-browser --mcp",
      "# then load /mcp/cursor.json in your MCP client",
    ].join("\n"),
    linkHref: "/mcp/cursor.json",
    linkLabel: "Download MCP snippet",
  },
  "local-api": {
    title: "Local HTTP API for scripts and orchestrators",
    summary: "Use the daemon's local HTTP surface when another service or script needs to drive the same browser runtime.",
    points: [
      "Useful for internal tools, shell scripts, and lightweight automation services.",
      "Keeps execution local, which is important for authenticated tabs and personal browser state.",
      "Lets you standardize commands without forcing everything through an MCP client.",
    ],
    code: [
      "curl -s http://127.0.0.1:19824/status",
      "curl -s http://127.0.0.1:19824/command \\",
      "  -H \"Content-Type: application/json\" \\",
      "  -d '{\"id\":\"demo-open\",\"action\":\"open\",\"url\":\"https://example.com\"}'",
    ].join("\n"),
    linkHref: "/api/examples.sh",
    linkLabel: "Download API examples",
  },
  "hosted-api": {
    title: "Hosted API for public remote-safe requests",
    summary: "Use miaoda.vip when the task belongs on a server: public fetches, metadata extraction, catalog lookup, and hosted read-only adapters.",
    points: [
      "Good for remote jobs that do not require your own tabs, cookies, or login session.",
      "Uses API keys, usage tracking, and a curated hosted subset instead of the full local runtime.",
      "Best when you need a simple public HTTP integration with no local browser dependency.",
    ],
    code: [
      "curl -s https://miaoda.vip/v1/open \\",
      "  -H \"Authorization: Bearer $API_KEY\" \\",
      "  -H \"Content-Type: application/json\" \\",
      "  -d '{\"url\":\"https://example.com\",\"mode\":\"metadata\"}'",
    ].join("\n"),
    linkHref: "/openapi/",
    linkLabel: "Open API docs",
  },
};

function initHomepageDemo() {
  const root = document.querySelector("[data-demo-root]");
  if (!(root instanceof HTMLElement)) {
    return;
  }

  const title = document.getElementById("demo-title");
  const summary = document.getElementById("demo-summary");
  const points = document.getElementById("demo-points");
  const code = document.getElementById("demo-code");
  const copy = document.getElementById("demo-copy");
  const link = document.getElementById("demo-link");
  const tabs = Array.from(root.querySelectorAll(".demo-tab"));

  if (
    !(title instanceof HTMLElement) ||
    !(summary instanceof HTMLElement) ||
    !(points instanceof HTMLElement) ||
    !(code instanceof HTMLElement) ||
    !(copy instanceof HTMLElement) ||
    !(link instanceof HTMLAnchorElement)
  ) {
    return;
  }

  function renderDemo(id) {
    const example = demoExamples[id];
    if (!example) {
      return;
    }

    title.textContent = example.title;
    summary.textContent = example.summary;
    points.innerHTML = example.points.map((point) => `<li>${point}</li>`).join("");
    code.textContent = example.code;
    copy.dataset.copy = example.code;
    link.href = example.linkHref;
    link.textContent = example.linkLabel;

    for (const tab of tabs) {
      if (!(tab instanceof HTMLButtonElement)) {
        continue;
      }
      const isActive = tab.dataset.demoId === id;
      tab.classList.toggle("is-active", isActive);
      tab.setAttribute("aria-selected", isActive ? "true" : "false");
    }
  }

  for (const tab of tabs) {
    if (!(tab instanceof HTMLButtonElement)) {
      continue;
    }
    tab.addEventListener("click", () => {
      renderDemo(tab.dataset.demoId || "");
    });
  }

  renderDemo("local-cli");
}

initHomepageDemo();

const hostedLabRecentKey = "iatlas-browser-hosted-lab-recents";

function loadHostedLabRecents() {
  try {
    const raw = localStorage.getItem(hostedLabRecentKey);
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHostedLabRecents(items) {
  try {
    localStorage.setItem(hostedLabRecentKey, JSON.stringify(items.slice(0, 6)));
  } catch {}
}

async function initHostedLab() {
  const root = document.querySelector("[data-lab-root]");
  const apiKeyInput = document.getElementById("lab-api-key");
  const summary = document.getElementById("lab-summary");
  const presets = document.getElementById("lab-presets");
  const recents = document.getElementById("lab-recents");
  const result = document.getElementById("lab-result");
  const tabs = Array.from(document.querySelectorAll("[data-lab-tab]"));
  const views = Array.from(document.querySelectorAll("[data-lab-view]"));

  const openForm = document.getElementById("open-playground-form");
  const openUrlInput = document.getElementById("open-playground-url");
  const openModeInput = document.getElementById("open-playground-mode");

  const siteForm = document.getElementById("site-runner-form");
  const siteNameInput = document.getElementById("site-runner-name");
  const siteArgsInput = document.getElementById("site-runner-args");
  const siteSummary = document.getElementById("site-runner-summary");

  if (
    !(root instanceof HTMLElement) ||
    !(apiKeyInput instanceof HTMLInputElement) ||
    !(summary instanceof HTMLElement) ||
    !(presets instanceof HTMLElement) ||
    !(recents instanceof HTMLElement) ||
    !(result instanceof HTMLElement) ||
    !(openForm instanceof HTMLFormElement) ||
    !(openUrlInput instanceof HTMLInputElement) ||
    !(openModeInput instanceof HTMLSelectElement) ||
    !(siteForm instanceof HTMLFormElement) ||
    !(siteNameInput instanceof HTMLSelectElement) ||
    !(siteArgsInput instanceof HTMLTextAreaElement) ||
    !(siteSummary instanceof HTMLElement)
  ) {
    return;
  }

  const openSubmitButton = openForm.querySelector('button[type="submit"]');
  const siteSubmitButton = siteForm.querySelector('button[type="submit"]');
  if (!(openSubmitButton instanceof HTMLButtonElement) || !(siteSubmitButton instanceof HTMLButtonElement)) {
    return;
  }

  syncApiKeyInput(apiKeyInput);
  apiKeyInput.addEventListener("change", () => {
    if (apiKeyInput.value.trim()) {
      saveApiKey(apiKeyInput.value.trim());
    }
  });

  let activeTab = "open";
  let hostedItems = [];
  const labText = {
    summaryGeneral: root.dataset.summaryGeneral || "Create an API key above or paste one here. The lab shares the same stored key across both hosted tools.",
    summaryOpen: root.dataset.summaryOpen || "Use /v1/open for public URL fetches, metadata extraction, and lightweight remote-safe retrieval.",
    summarySite: root.dataset.summarySite || "Use /v1/sites/run for the hosted read-only adapter subset exposed by the live API.",
    recentEmpty: root.dataset.recentEmpty || "Run a hosted request to pin reusable examples here.",
    loadingAdapters: root.dataset.loadingAdapters || "Loading the current hosted adapter list from /v1/sites/hosted.",
    noAdapters: root.dataset.noAdapters || "No hosted adapters are currently available from the live API.",
    failedAdapters: root.dataset.failedAdapters || "Failed to load hosted adapters",
    loadedAdapters: root.dataset.loadedAdapters || "{count} hosted adapters loaded from the live API. The JSON editor is seeded from each adapter's current API example.",
    requireApiKey: root.dataset.requireApiKey || "Create or paste an API key first.",
    invalidUrl: root.dataset.invalidUrl || "Enter a valid absolute URL.",
    publicOnly: root.dataset.publicOnly || "Only public http and https URLs are supported here.",
    runningOpen: root.dataset.runningOpen || "Running hosted open request...",
    runningSite: root.dataset.runningSite || "Running hosted adapter...",
    chooseAdapter: root.dataset.chooseAdapter || "Choose a hosted adapter first.",
    invalidJson: root.dataset.invalidJson || "Arguments must be valid JSON.",
    openFailed: root.dataset.openFailed || "Hosted open request failed",
    siteFailed: root.dataset.siteFailed || "Hosted adapter request failed",
    presetOpenMetadata: root.dataset.presetOpenMetadata || "Metadata: example.com",
    presetOpenText: root.dataset.presetOpenText || "Text: RFC index",
    presetOpenHtml: root.dataset.presetOpenHtml || "HTML: OpenAI",
  };

  const openPresets = [
    {
      label: labText.presetOpenMetadata,
      apply() {
        openUrlInput.value = "https://example.com";
        openModeInput.value = "metadata";
      },
    },
    {
      label: labText.presetOpenText,
      apply() {
        openUrlInput.value = "https://www.rfc-editor.org/rfc/";
        openModeInput.value = "text";
      },
    },
    {
      label: labText.presetOpenHtml,
      apply() {
        openUrlInput.value = "https://openai.com";
        openModeInput.value = "html";
      },
    },
  ];

  function getSitePresetEntries() {
    const preferred = ["github/repo", "arxiv/search", "hackernews/top", "wikipedia/summary"];
    const selected = [];

    for (const name of preferred) {
      const entry = hostedItems.find((item) => item.name === name);
      if (entry) {
        selected.push(entry);
      }
    }

    for (const entry of hostedItems) {
      if (selected.length >= 4) {
        break;
      }
      if (!selected.includes(entry)) {
        selected.push(entry);
      }
    }

    return selected;
  }

  function renderRecents() {
    const items = loadHostedLabRecents();
    if (!items.length) {
      recents.innerHTML = `<p class="subtle">${escapeHtml(labText.recentEmpty)}</p>`;
      return;
    }

    recents.innerHTML = items.map((item, index) => `
      <button class="recent-chip" type="button" data-recent-index="${index}">
        ${escapeHtml(item.label)}
      </button>
    `).join("");
  }

  function pushRecent(item) {
    const next = [item, ...loadHostedLabRecents().filter((entry) => entry.label !== item.label)];
    saveHostedLabRecents(next);
    renderRecents();
  }

  function syncSiteArgs() {
    const entry = hostedItems.find((item) => item.name === siteNameInput.value) || hostedItems[0];
    if (!entry) {
      siteArgsInput.value = "{}";
      return;
    }

    siteNameInput.value = entry.name;
    siteArgsInput.value = JSON.stringify(entry.execution?.apiExample?.body?.args ?? {}, null, 2);
  }

  function renderPresets() {
    const entries = activeTab === "open"
      ? openPresets.map((preset, index) => ({
          label: preset.label,
          action: "open",
          index,
        }))
      : getSitePresetEntries().map((entry) => ({
          label: `${entry.name}`,
          action: "site",
          name: entry.name,
        }));

    presets.innerHTML = entries.map((entry) => `
      <button class="recent-chip" type="button"
        data-preset-action="${entry.action}"
        ${entry.action === "open" ? `data-preset-index="${entry.index}"` : `data-preset-name="${escapeHtml(entry.name)}"`}>
        ${escapeHtml(entry.label)}
      </button>
    `).join("");
  }

  function setActiveTab(nextTab) {
    activeTab = nextTab;

    for (const tab of tabs) {
      if (!(tab instanceof HTMLButtonElement)) {
        continue;
      }
      const isActive = tab.dataset.labTab === nextTab;
      tab.classList.toggle("is-active", isActive);
      tab.setAttribute("aria-selected", isActive ? "true" : "false");
    }

    for (const view of views) {
      if (!(view instanceof HTMLElement)) {
        continue;
      }
      const isActive = view.dataset.labView === nextTab;
      view.classList.toggle("is-active", isActive);
      view.hidden = !isActive;
    }

    summary.textContent = nextTab === "open"
      ? labText.summaryOpen
      : labText.summarySite;

    renderPresets();
  }

  presets.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const button = target.closest("[data-preset-action]");
    if (!(button instanceof HTMLElement)) {
      return;
    }

    if (button.dataset.presetAction === "open") {
      const preset = openPresets[Number(button.dataset.presetIndex || "-1")];
      preset?.apply();
      return;
    }

    const entry = hostedItems.find((item) => item.name === button.dataset.presetName);
    if (!entry) {
      return;
    }
    setActiveTab("site");
    siteNameInput.value = entry.name;
    syncSiteArgs();
  });

  recents.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const button = target.closest("[data-recent-index]");
    if (!(button instanceof HTMLElement)) {
      return;
    }

    const item = loadHostedLabRecents()[Number(button.dataset.recentIndex || "-1")];
    if (!item) {
      return;
    }

    setActiveTab(item.type);
    if (item.type === "open") {
      openUrlInput.value = item.payload.url || "";
      openModeInput.value = item.payload.mode || "metadata";
    } else if (item.type === "site") {
      siteNameInput.value = item.payload.name || "";
      siteArgsInput.value = JSON.stringify(item.payload.args || {}, null, 2);
    }
  });

  for (const tab of tabs) {
    if (!(tab instanceof HTMLButtonElement)) {
      continue;
    }
    tab.addEventListener("click", () => {
      setActiveTab(tab.dataset.labTab || "open");
    });
  }

  try {
    const payload = await loadJson("/v1/sites/hosted");
    hostedItems = Array.isArray(payload.items) ? payload.items : [];
    siteNameInput.innerHTML = "";

    if (!hostedItems.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = labText.noAdapters;
      siteNameInput.appendChild(option);
      siteSummary.textContent = labText.noAdapters;
    } else {
      for (const entry of hostedItems) {
        const option = document.createElement("option");
        option.value = entry.name;
        option.textContent = `${entry.name} (${entry.platform})`;
        siteNameInput.appendChild(option);
      }
      siteSummary.textContent = formatTemplate(labText.loadedAdapters, { count: hostedItems.length });
      syncSiteArgs();
    }
  } catch (error) {
    siteSummary.textContent = error instanceof Error ? error.message : labText.failedAdapters;
  }

  siteNameInput.addEventListener("change", syncSiteArgs);

  openForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const apiKey = apiKeyInput.value.trim();
    const url = openUrlInput.value.trim();
    const mode = openModeInput.value;

    if (!apiKey) {
      setPreResult(result, labText.requireApiKey);
      return;
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      setPreResult(result, labText.invalidUrl);
      return;
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      setPreResult(result, labText.publicOnly);
      return;
    }

    const originalButtonText = openSubmitButton.textContent;
    openSubmitButton.disabled = true;
    openSubmitButton.textContent = "Running...";
    setPreResult(result, labText.runningOpen);

    try {
      const response = await fetch("/v1/open", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: parsedUrl.toString(),
          mode,
        }),
      });

      const payload = await response.json();
      setPreResult(result, JSON.stringify(payload, null, 2));
      pushRecent({
        type: "open",
        label: `/v1/open · ${mode} · ${parsedUrl.host}`,
        payload: {
          url: parsedUrl.toString(),
          mode,
        },
      });
    } catch (error) {
      setPreResult(result, error instanceof Error ? error.message : labText.openFailed);
    } finally {
      openSubmitButton.disabled = false;
      openSubmitButton.textContent = originalButtonText;
    }
  });

  siteForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
      setPreResult(result, labText.requireApiKey);
      return;
    }

    if (!siteNameInput.value) {
      setPreResult(result, labText.chooseAdapter);
      return;
    }

    let args;
    try {
      args = JSON.parse(siteArgsInput.value || "{}");
    } catch {
      setPreResult(result, labText.invalidJson);
      return;
    }

    const originalButtonText = siteSubmitButton.textContent;
    siteSubmitButton.disabled = true;
    siteSubmitButton.textContent = "Running...";
    setPreResult(result, labText.runningSite);

    try {
      const response = await fetch("/v1/sites/run", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: siteNameInput.value,
          args,
        }),
      });

      const payload = await response.json();
      setPreResult(result, JSON.stringify(payload, null, 2));
      pushRecent({
        type: "site",
        label: `/v1/sites/run · ${siteNameInput.value}`,
        payload: {
          name: siteNameInput.value,
          args,
        },
      });
    } catch (error) {
      setPreResult(result, error instanceof Error ? error.message : labText.siteFailed);
    } finally {
      siteSubmitButton.disabled = false;
      siteSubmitButton.textContent = originalButtonText;
    }
  });

  renderRecents();
  summary.textContent = labText.summaryGeneral;
  siteSummary.textContent = labText.loadingAdapters;
  setActiveTab("open");
}

initHostedLab();
