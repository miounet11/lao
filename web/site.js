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
