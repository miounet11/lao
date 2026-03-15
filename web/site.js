for (const button of document.querySelectorAll(".copy")) {
  button.addEventListener("click", async () => {
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
}

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
