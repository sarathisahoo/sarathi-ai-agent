/* global fetch */

// LLM provider abstraction for Sarathi AI.
// Returns raw text from the LLM which should be strict JSON according to the system prompt.

const SarathiLLM = {
  async callLLM(settings, systemPrompt, userCommand, domSnapshot, actionHistory) {
    const provider = (settings.provider || "openai").toLowerCase();
    if (provider === "openai") {
      return SarathiLLM._callOpenAI(settings, systemPrompt, userCommand, domSnapshot, actionHistory);
    }
    if (provider === "gemini") {
      return SarathiLLM._callGemini(settings, systemPrompt, userCommand, domSnapshot, actionHistory);
    }
    if (provider === "deepseek") {
      return SarathiLLM._callDeepSeek(settings, systemPrompt, userCommand, domSnapshot, actionHistory);
    }
    return SarathiLLM._callCustom(settings, systemPrompt, userCommand, domSnapshot, actionHistory);
  },

  _buildMessages(systemPrompt, userCommand, domSnapshot, actionHistory) {
    const domSummary = JSON.stringify(domSnapshot || {}, null, 2);
    const historySummary = JSON.stringify(actionHistory || [], null, 2);
    
    // Build a summary of what was already done
    const historyText = actionHistory && actionHistory.length > 0
      ? actionHistory.slice(-10).map((a, idx) => 
          `${idx + 1}. ${a.type}${a.sarathiId ? ` (sarathiId: ${a.sarathiId})` : ''}${a.value ? ` with value: ${a.value}` : ''} - ${a.success ? 'SUCCESS' : 'FAILED'}`
        ).join('\n')
      : "No actions taken yet.";
    
    const userContent =
      "User command: " + userCommand +
      "\n\n" +
      "=== ACTION HISTORY (what you already did) ===\n" +
      historyText +
      "\n\n" +
      "IMPORTANT: Review the action history above. DO NOT repeat actions that were already executed!\n" +
      "If you see 'navigate', 'type', or 'click search' in history, those steps are DONE.\n" +
      "If the currentUrl contains '/results?', you are on a search results page - click a video result, don't search again.\n" +
      "\n" +
      "=== CURRENT DOM SNAPSHOT ===\n" +
      "Current URL: " + (domSnapshot?.url || "unknown") + "\n" +
      "Page Title: " + (domSnapshot?.pageTitle || "unknown") + "\n" +
      "Elements: " + (domSnapshot?.elements?.length || 0) + " interactive elements found\n" +
      "\n" +
      "Full DOM snapshot (JSON):\n" +
      domSummary +
      "\n\n" +
      "Full action history (JSON):\n" +
      historySummary +
      "\n\n" +
      "Respond with ONLY a single JSON object and nothing else.";

    return [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent }
    ];
  },

  async _callOpenAI(settings, systemPrompt, userCommand, domSnapshot, actionHistory) {
    const apiKey = settings.apiKey || "";
    const baseUrl = (settings.baseUrl || "https://api.openai.com").replace(/\/+$/, "");
    const model = settings.model || "gpt-4.1-mini";

    const messages = SarathiLLM._buildMessages(systemPrompt, userCommand, domSnapshot, actionHistory);

    const resp = await fetch(baseUrl + "/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.2
      })
    });
    if (!resp.ok) {
      throw new Error("OpenAI error: " + resp.status);
    }
    const data = await resp.json();
    const text =
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content;
    return text || "";
  },

  async _callDeepSeek(settings, systemPrompt, userCommand, domSnapshot, actionHistory) {
    // DeepSeek uses OpenAI-compatible APIs in many deployments.
    const apiKey = settings.apiKey || "";
    const baseUrl = (settings.baseUrl || "https://api.deepseek.com").replace(/\/+$/, "");
    const model = settings.model || "deepseek-chat";

    const messages = SarathiLLM._buildMessages(systemPrompt, userCommand, domSnapshot, actionHistory);

    const resp = await fetch(baseUrl + "/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.2
      })
    });
    if (!resp.ok) {
      throw new Error("DeepSeek error: " + resp.status);
    }
    const data = await resp.json();
    const text =
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content;
    return text || "";
  },

  async _callGemini(settings, systemPrompt, userCommand, domSnapshot, actionHistory) {
    // TODO: Implement actual Gemini API call.
    // For now, this is a placeholder that throws a clear error.
    throw new Error(
      "Gemini provider is not yet implemented. Configure a Custom endpoint or switch to OpenAI/DeepSeek."
    );
  },

  async _callCustom(settings, systemPrompt, userCommand, domSnapshot, actionHistory) {
    const baseUrl = (settings.baseUrl || "").replace(/\/+$/, "");
    const model = settings.model || "";
    const apiKey = settings.apiKey || "";
    if (!baseUrl) {
      throw new Error("Custom provider base URL is required.");
    }

    const headers = {
      "Content-Type": "application/json"
    };
    if (apiKey) {
      headers.Authorization = "Bearer " + apiKey;
    }
    if (settings.customHeaders) {
      try {
        const extra = JSON.parse(settings.customHeaders);
        Object.assign(headers, extra);
      } catch (e) {
        // ignore invalid custom headers JSON
      }
    }

    const messages = SarathiLLM._buildMessages(systemPrompt, userCommand, domSnapshot, actionHistory);

    const resp = await fetch(baseUrl + "/v1/chat/completions", {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.2
      })
    });

    if (!resp.ok) {
      throw new Error("Custom LLM error: " + resp.status);
    }
    const data = await resp.json();
    const text =
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content;
    return text || "";
  }
};

if (typeof window !== "undefined") {
  window.SarathiLLM = SarathiLLM;
}


