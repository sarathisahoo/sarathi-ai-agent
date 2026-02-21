/* global SarathiStorage, SarathiLLM */

document.addEventListener("DOMContentLoaded", () => {
  const providerEl = document.getElementById("provider");
  const apiKeyEl = document.getElementById("apiKey");
  const modelEl = document.getElementById("model");
  const baseUrlEl = document.getElementById("baseUrl");
  const customHeadersEl = document.getElementById("customHeaders");
  const wakeWordEl = document.getElementById("wakeWord");
  const languageEl = document.getElementById("language");
  const requireConfirmationEl = document.getElementById("requireConfirmation");
  const btnSave = document.getElementById("btn-save");
  const btnTest = document.getElementById("btn-test");
  const statusEl = document.getElementById("status");

  function toggleCustomFields() {
    const isCustom = providerEl.value === "custom";
    const baseUrlField = document.getElementById("baseUrl-field");
    const customHeadersField = document.getElementById("customHeaders-field");
    
    if (baseUrlField) {
      baseUrlField.style.display = isCustom ? "flex" : "none";
    }
    if (customHeadersField) {
      customHeadersField.style.display = isCustom ? "flex" : "none";
    }
  }

  async function loadSettings() {
    const settings = await SarathiStorage.getSettings();
    providerEl.value = settings.provider || "openai";
    apiKeyEl.value = settings.apiKey || "";
    modelEl.value = settings.model || "gpt-4.1-mini";
    baseUrlEl.value = settings.baseUrl || "";
    customHeadersEl.value = settings.customHeaders || "";
    wakeWordEl.value = settings.wakeWord || "hey nova";
    languageEl.value = settings.language || "en-IN";
    requireConfirmationEl.checked = settings.requireConfirmation !== false;
    
    // Show/hide custom fields based on provider
    toggleCustomFields();
  }

  async function saveSettings() {
    const settings = {
      provider: providerEl.value,
      apiKey: apiKeyEl.value.trim(),
      model: modelEl.value.trim(),
      baseUrl: baseUrlEl.value.trim(),
      customHeaders: customHeadersEl.value.trim(),
      wakeWord: wakeWordEl.value.trim() || "hey nova",
      language: languageEl.value,
      requireConfirmation: !!requireConfirmationEl.checked
    };
    await SarathiStorage.saveSettings(settings);
    statusEl.textContent = "Settings saved.";
    setTimeout(() => (statusEl.textContent = ""), 2500);
  }

  async function testConnection() {
    statusEl.textContent = "Testing connection...";
    try {
      const settings = await SarathiStorage.getSettings();
      const systemPrompt =
        "You are a test agent. Respond with this exact JSON: {\"action\":\"done\",\"target\":null,\"value\":null,\"reason\":\"test\"}";
      const result = await SarathiLLM.callLLM(
        settings,
        systemPrompt,
        "test",
        { url: "about:blank", title: "Test", elements: [] }
      );
      statusEl.textContent = "Test request sent. Response length: " + String(result || "").length;
    } catch (e) {
      statusEl.textContent = "Test failed: " + (e && e.message ? e.message : e);
    }
  }

  btnSave.addEventListener("click", () => {
    saveSettings();
  });

  btnTest.addEventListener("click", () => {
    testConnection();
  });

  // Listen for provider changes to show/hide custom fields
  providerEl.addEventListener("change", () => {
    toggleCustomFields();
  });

  loadSettings();
});


