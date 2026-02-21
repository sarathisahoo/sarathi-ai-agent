# Sarathi AI Agent
### DOM-Grounded AI Browser Agent

## 🎥 Demo Video

[![Sarathi AI Agent Demo](https://img.youtube.com/vi/5Voji994zYw/maxresdefault.jpg)](https://www.youtube.com/watch?v=5Voji994zYw)

**Sarathi AI Agent** is an experimental Chrome extension that enables natural-language control of the browser. It converts user instructions into structured browser actions using a DOM-grounded reasoning loop instead of screenshot-based vision models.

The system operates directly on structured DOM data, making it **faster, cheaper, and more deterministic** than screenshot-driven browser agents.

---

## ⚡ Features

*   **Natural Language Navigation:** Navigate websites using plain English instructions.
*   **Information Extraction:** Search and extract specific information from pages.
*   **Complex Form Filling:** Intelligently fill multi-field forms (detects name, email, phone patterns).
*   **Contextual Actions:** Generate replies inside Gmail or LinkedIn based on page context.
*   **E-Commerce Automation:** Add items to cart and proceed to checkout steps.
*   **Voice-to-Action:** Read content and speak it back using browser APIs.
*   **Dynamic Interaction:** Handle dropdowns, hover controls, modals, and hidden elements.
*   **Smart Constraints:** Respects instructions such as “type but don’t send.”
*   **Universal Compatibility:** Works across most modern websites without hardcoded selectors.

---

## ⚙️ How It Works

Sarathi AI follows a structured **Observe → Reason → Act** loop.

### 1. DOM Snapshot Injection
*   Injects a content script into the active tab.
*   Scans all visible interactive elements.
*   Assigns a unique `sarathi-id` to each element.
*   Extracts structured metadata (Tag name, Placeholder, Nearby labels, Visible text, Input type).

This produces a structured JSON representation of the page, filtering out noise.

### 2. LLM Planning
The DOM snapshot, user instruction, and action history are sent to your configured LLM. The model returns structured JSON instructions:

```json
{
  "status": "continue",
  "reason": "Type search query and submit",
  "actions": [
    { "type": "type", "sarathiId": "uid-123", "value": "white tshirt" },
    { "type": "click", "sarathiId": "uid-456" }
  ]
}
```

> **Note:** The LLM never directly manipulates the browser. It only generates structured action instructions.

### 3. Deterministic Execution Engine
Sarathi AI executes actions deterministically via the content script:
*   Scroll into view
*   Hover (simulated for hidden elements)
*   Type / Key press
*   Click
*   Wait for page load

After execution, a fresh DOM snapshot is generated, and the loop continues until the status is `"completed"` or `"failed"`.

---

## 🆚 Why DOM-Grounded?

Most AI browser agents rely on screenshot analysis (Vision). Sarathi AI uses the DOM.

| Feature | Screenshot-Based Agents | Sarathi AI (DOM-Grounded) |
| :--- | :--- | :--- |
| **Input Data** | Full-page screenshots (Pixels) | Structured DOM JSON (Text) |
| **Token Usage** | High (Images are expensive) | **Low** (Text is cheap) |
| **Speed** | Slower (Image processing latency) | **Faster** (Text processing is instant) |
| **Precision** | Pixel ambiguity (might miss click) | **Exact** targeting via `sarathi-id` |
| **Debugging** | Hard to debug image hallucinations | Easy to debug JSON logs |

This architecture reduces latency and cost while improving accuracy for form-heavy and structured websites.

---

## 🚀 Example Use Cases

### 📧 Gmail Automation
**Instruction:** *"Open Gmail and reply to the first unread email."*
1.  Navigate to Gmail.
2.  Identify unread thread using generic DOM attributes.
3.  Extract full conversation context.
4.  Generate context-aware reply.
5.  Type into reply box and send.
6.  *Stops before sending if instruction is given to not send, just type.*

### 🛒 E-Commerce Automation
**Instruction:** *"Purchase a white T-shirt for me on Myntra."*
1.  Search product after navigating to myntra.com.
2.  Open first result.
3.  Select size.
4.  Add to bag.
5.  Proceed to checkout.
6.  *Automatically stops at OTP/Payment verification.*

### 📝 Complex Form Filling
**Instruction:** *"Fill this form with random valid data and submit."*
*   **Capabilities:**
    *   Detects name fields → generates realistic names.
    *   Detects email fields → generates valid email format.
    *   Detects phone fields → generates numeric values.
    *   Handles dropdowns and checkboxes.

---

## 🔑 LLM Configuration (BYOK)

Sarathi AI **does not** ship with built-in API keys. You must configure your own LLM provider.

**Supported Providers:**
*   OpenAI (gpt-4.1-mini, GPT-4o, GPT-3.5-Turbo)
*   Google Gemini (Flash/Pro)
*   DeepSeek
*   Any Custom LLM Endpoint

**Configuration Options:**
*   Model Name
*   API Key
*   Custom Endpoint URL
*   Custom Headers

> **Privacy Note:** API keys are stored in Chrome `localStorage`. No keys are sent to any Sarathi-owned server. The extension operates entirely client-side.

---

## 📥 Installation (Developer Mode)

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/YOUR_USERNAME/sarathi-ai-agent.git
    ```

2.  **Load into Chrome:**
    *   Open Chrome and navigate to `chrome://extensions/`
    *   Enable **Developer Mode** (toggle in the top right corner).
    *   Click **Load Unpacked**.
    *   Select the `sarathi-ai-agent` project directory.

3.  **Setup:**
    *   Open the extension popup.
    *   Go to **Settings**.
    *   Enter your API Key and select your Model.

---

## 🛡️ Security Notes

*   **Session Scope:** The extension operates within the current browser session.
*   **User Control:** It executes actions only based on your specific instructions.
*   **Sensitive Actions:** Be careful with instructions involving "sending", "purchasing", or "deleting". Always verify the agent's plan before allowing irreversible operations.
*   **Data Privacy:** All processing happens between your browser and your LLM provider.

---

## 🚧 Current Status & Roadmap

This project is **experimental** and under active development.

**Current Reliability:** ~90% on general browsing scenarios.
**Known Limitations:**
*   Strong Anti-bot systems (Cloudflare turnstiles).
*   Extremely dynamic UI changes (Shadow DOM deep nesting).
*   CAPTCHA / OTP verification steps.

**Roadmap:**
*   [ ] Enhanced guardrails for irreversible actions.
*   [ ] Better multi-tab orchestration.
*   [ ] Improved context compression for very large pages.
*   [ ] Latency optimizations.
*   [ ] Plugin/Tool API for custom automation modules.

---

## 📄 License

MIT License
