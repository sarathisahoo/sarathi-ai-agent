## Sarathi AI - Chrome Extension (Manifest V3)

Sarathi AI is a **voice-based AI browser assistant**. It listens for a wake word or a manual mic button, inspects the current page’s interactive elements, asks an LLM what to do, and then executes actions (click, type, scroll, navigate) in a controlled loop.

### Features (MVP)

- **Wake word & manual mic**
  - Always listening mode using an **offscreen document** + Web Speech API.
  - Wake word: **“hey sarathi”** / **“hey sarthi”** (configurable).
  - Manual “🎤 Record” button in the popup for one‑shot recognition.
- **DOM snapshot**
  - Content script scans visible, interactive elements (including Shadow DOM and accessible iframes) and returns a **structured JSON** snapshot with IDs `E1`, `E2`, …
- **LLM-based orchestration**
  - Background worker sends **user command + DOM JSON** to your configured LLM (OpenAI / DeepSeek / Custom).
  - Receives strict JSON describing one action at a time.
  - Executes actions via content script for up to **8 steps** or until `{"action":"done"}`.
- **Safety**
  - If an action is a click on an element whose text includes: `pay`, `payment`, `subscribe`, `buy`, `confirm`, `delete`, `remove`
  - And **Require confirmation** is ON, the action is blocked and execution stops.

### Files & Structure

- `manifest.json` – MV3 manifest, permissions, background, popup, options, content scripts.
- `background.js` – Service worker:
  - Coordinates wake word / manual speech, DOM snapshots, LLM calls, and action loop.
  - Ensures **offscreen document** exists for continuous listening.
- `contentScript.js` – Runs on all pages and frames:
  - Uses `utils/domUtils.js` to build the DOM snapshot.
  - Executes click / type / scroll / navigate / keypress actions sent from background.
- `offscreen.html` / `offscreen.js` – Hidden document:
  - Runs **Web Speech API** continuously or in one‑shot mode.
  - Detects wake word and then captures the next phrase as the user’s command.
- `popup.html` / `popup.css` / `popup.js` – Popup UI:
  - Premium, modern UI with:
    - Title `Sarathi AI`
    - Toggle: **Always Listening**
    - Button: **🎤 Record**
    - Status pill: `Idle / Listening / Activated / Executing`
    - Last transcript & last action display
    - **⚙ Settings** button
- `options.html` / `options.css` / `options.js` – Settings page:
  - Provider: **OpenAI / Gemini / DeepSeek / Custom**
  - API key, model name, base URL, optional custom headers JSON
  - Wake word, language, “require confirmation” toggle
  - **Save** and **Test connection** buttons
- `utils/domUtils.js` – DOM scanner:
  - Traverses document, Shadow DOM, and accessible iframes.
  - Collects up to **150** meaningful/interactive visible elements:
    - `button`, `a`, `input`, `textarea`, `select`
    - Elements with `role=button/textbox/link`, `tabindex >= 0`, `onclick`, `aria-label`
  - Includes:
    - `elementId` (`E1`, `E2`, …)
    - Bounding box (`x`, `y`, `width`, `height`)
    - `innerText` (trimmed to 120 chars), `placeholder`, `name`, `id`, `class`, `aria-label`, `type`, `href`
    - Best-effort CSS selector and XPath
- `utils/storage.js` – Wrapper around `chrome.storage.sync` for all settings.
- `utils/llmProviders.js` – LLM adapters:
  - **OpenAI**: `POST /v1/chat/completions`
  - **DeepSeek**: OpenAI-compatible `POST /v1/chat/completions`
  - **Gemini**: Placeholder with a clear TODO (throws until implemented)
  - **Custom**: Uses configured `baseUrl`, `model`, API key, and optional headers.

### Installation

1. **Clone / copy** this folder onto your machine, e.g.
   - `C:\Movies\SarathiAI\sarathi-ai-extension`
2. Open **Chrome** and go to `chrome://extensions/`.
3. Enable **Developer mode** (top-right toggle).
4. Click **“Load unpacked”** and select the `sarathi-ai-extension` folder.
5. You should now see **Sarathi AI** in your extensions list and the popup icon in the toolbar.

> Note: Chrome may warn about missing icons; this is expected if you haven’t added actual PNGs to the `icons/` folder yet.

### Permissions Explained

- **`storage`** – Save your API keys, model, and preferences via `chrome.storage.sync`.
- **`tabs` / `activeTab`** – Allow Sarathi AI to query and act on the current active tab.
- **`scripting`** – For future scripting features; current content scripts are declared in the manifest.
- **`offscreen`** – Required to create an **offscreen document** where continuous speech recognition runs, so the service worker can go idle without stopping voice.
- **`<all_urls>` host permissions** – Needed so the content script can read interactive elements on any page you use Sarathi on.

### How Voice Works

1. **Always Listening (Wake word)**
   - In the popup, toggle **Always Listening** ON.
   - Background worker:
     - Ensures the `offscreen.html` document exists.
     - Sends a `startContinuous` message with the configured **wake word**.
   - Offscreen document:
     - Starts `SpeechRecognition` in **continuous** mode.
     - Listens for the phrase **“hey sarathi”** / **“hey sarthi”** or your custom wake word.
     - When detected, sends `wakeWordDetected` to the background.
     - The next recognized phrase is treated as the **user command**, sent back as `transcript`.

2. **Manual Mode**
   - Open the popup and click **🎤 Record**.
   - Background tells the offscreen document to run a **one‑shot** recognition.
   - The next spoken phrase is taken as the command and sent to the background.

### LLM Orchestration Flow

When a transcript (command) reaches the background:

1. **DOM snapshot**
   - Background asks the content script for a DOM JSON snapshot.
2. **LLM call**
   - Background sends:
     - A **system prompt** that strictly enforces JSON output.
     - A **user message** containing the user command + DOM snapshot.
   - Your configured LLM provider returns a JSON action:
     ```json
     {
       "action": "click|type|scroll|navigate|keypress|done",
       "target": "E12",
       "value": "text or url or direction or key",
       "reason": "short reason"
     }
     ```
3. **Safety check**
   - If `action === "click"` and the target element text contains:
     `pay`, `payment`, `subscribe`, `buy`, `confirm`, `delete`, `remove`
   - And **Require confirmation** is ON → execution stops (no click is performed).
4. **Execute**
   - Background sends this action to `contentScript.js`.
   - Content script performs the requested operation:
     - `click` → clicks the element.
     - `type` → clears and types into an input/textarea and fires input/change events.
     - `scroll` → scrolls up/down.
     - `navigate` → navigates `window.location.href`.
     - `keypress` → dispatches a key event (e.g. `"Enter"`).
5. **Loop**
   - Background retrieves a fresh DOM snapshot and calls the LLM again.
   - This repeats up to **8 steps** or until the LLM returns `{"action": "done", ...}`.

### Configuring API Keys & Provider 

1. Right-click the Sarathi AI extension icon → **Options**, or click **⚙ Settings** in the popup.
2. In the **Provider** section:
   - Choose **OpenAI**, **DeepSeek**, **Gemini**, or **Custom**.
   - Enter:
     - **API Key** (e.g. `sk-...`).
     - **Model name** (e.g. `gpt-4.1-mini`, `deepseek-chat`, or your custom model id).
     - **Base URL** (for custom/OpenAI-compatible endpoints).
     - Optional **Custom headers JSON** for extra headers.
3. In the **Voice & Safety** section:
   - Set your **wake word** (default: `hey sarathi`).
   - Choose a **language** (e.g. `en-IN`, `hi-IN`, `ta-IN`, `te-IN`).
   - Toggle **Require confirmation** for dangerous actions.
4. Click **Save settings**.
5. Optionally click **Test connection** to send a simple test request to your LLM.

> **Gemini note:** The Gemini provider is a placeholder and currently throws a clear error. Use **Custom** with your own Gemini-compatible gateway or switch to OpenAI/DeepSeek.

### Example Commands

- “Open the login form and type my email.”
- “Scroll down to the pricing section.”
- “Click the first ‘Contact’ button.”
- “Search for Sarathi AI on this page.”
- “Go to the next page of results.”

### Troubleshooting

- **“Could not load manifest” or “Could not load options page”**
  - Ensure you select the **`sarathi-ai-extension` folder** (the one containing `manifest.json`) when using **Load unpacked**.
  - Confirm that `options.html` exists at the root of that folder (this repo provides it).
- **Wake word not detected**
  - Check that the **Always Listening** toggle is ON in the popup.
  - Your system must allow microphone access to Chrome and to the extension’s offscreen document.
- **LLM errors**
  - Open `chrome://extensions`, enable **Developer mode**, and click **background service worker** console to see logs.
  - Verify API key, base URL, and model configuration in **Options**.


