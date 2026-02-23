/*
 Sarathi AI
 Copyright (c) 2026 Sarathi Sabyasachi Sahoo
 MIT License
*/

/* global chrome */

// Import shared utilities for background context
try {
  importScripts(
    "utils/storage.js",
    "utils/llmProviders.js"
  );
} catch (e) {
  // In some dev tools environments importScripts may not be available; fail gracefully.
  console.warn("Sarathi AI: importScripts failed in background", e);
}

const MAX_STEPS = 12;

let alwaysListening = false;
let currentStatus = "Idle"; // Idle | Listening | Activated | Executing | Permission Required | MIC_BLOCKED
let micStatus = "UNKNOWN"; // UNKNOWN | GRANTED | MIC_BLOCKED
let shouldStopExecution = false; // Flag to stop execution loop

function broadcastStatus(status) {
  currentStatus = status;
  chrome.runtime.sendMessage({
    source: "background",
    type: "statusUpdate",
    status
  }).catch(() => {
    // No active receiver; ignore.
  });
}

async function getActiveTab() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs.length > 0 && tabs[0]) {
      return tabs[0];
    }
    
    // Fallback: try to get the last focused window's active tab
    const windows = await chrome.windows.getAll({ populate: true });
    for (const win of windows) {
      if (win.focused) {
        const activeTabs = win.tabs.filter(t => t.active);
        if (activeTabs.length > 0) {
          return activeTabs[0];
        }
      }
    }
    
    // Last resort: get the most recently accessed tab
    const allTabs = await chrome.tabs.query({});
    if (allTabs && allTabs.length > 0) {
      // Sort by last accessed time (if available) or use first tab
      return allTabs[0];
    }
    
    return null;
  } catch (e) {
    console.error("Sarathi AI: Error getting active tab", e);
    return null;
  }
}

async function requestDomSnapshot(tabId) {
  console.log("Sarathi AI: Snapshot requested from MAIN FRAME only (frameId: 0)");
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(
      tabId,
      { source: "background", type: "getDomSnapshot" },
      { frameId: 0 }, // Target main frame only
      (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        resolve(response);
      }
    );
  });
}

async function executeActionOnTab(tabId, stepAction) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(
      tabId,
      { source: "background", type: "executeAction", action: stepAction },
      { frameId: 0 }, // Target main frame only
      (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        resolve(response);
      }
    );
  });
}

const DANGEROUS_WORDS = [
  "pay",
  "payment",
  "subscribe",
  "buy",
  "confirm",
  "delete",
  "remove"
];

function isDangerousClick(elementText) {
  if (!elementText) return false;
  const lower = elementText.toLowerCase();
  return DANGEROUS_WORDS.some((w) => lower.includes(w));
}

function buildSystemPrompt() {
  return [
    "You are Sarathi AI, an autonomous multi-step browser automation agent.",
    "You control a real Chrome tab by returning structured JSON actions.",
    "You MUST decide what to do based ONLY on the provided DOM snapshot and action history.",
    "",
    "IMPORTANT: Transcript interpretation and error correction:",
    "- Voice recognition may produce transcription errors. You MUST interpret mistranscribed words based on the context of the complete sentence.",
    "- Common errors: \"fast\" often means \"first\", \"to\" might mean \"two\", \"for\" might mean \"four\", etc.",
    "- Analyze the FULL sentence context to determine the most likely intended word.",
    "- Examples of context-based corrections:",
    "  * \"play the fast song\" → interpret as \"play the first song\" (context: selecting from a list)",
    "  * \"click fast button\" → interpret as \"click first button\" (context: selecting first item)",
    "  * \"open fast result\" → interpret as \"open first result\" (context: selecting from results)",
    "  * \"search for Shahrukh Khan\" → if transcribed as \"search four Shahrukh Khan\", interpret as \"search for Shahrukh Khan\"",
    "  * \"go to YouTube\" → if transcribed as \"go two YouTube\", interpret as \"go to YouTube\"",
    "- Use your understanding of the sentence structure, grammar, and common phrases to correct obvious transcription errors.",
    "- When in doubt, choose the interpretation that makes the most sense given the context and the user's likely intent.",
    "",
    "Command context and intelligent reasoning — BE SMART:",
    "- You must think like a smart assistant. Never do a literal search when the user gives a vague or categorical request. Literal searches (e.g. typing \"good song\" or \"romantic film\" into a search box) give poor results and frustrate the user.",
    "- CRITICAL for \"play [something]\" requests: The text you put in the 'type' action for the search box MUST be a specific title or artist from your knowledge, NEVER the user's phrase. User said \"play a good song\" → wrong: type \"good song\"; right: choose a specific well-known song (e.g. a hit title or artist) and type that. User said \"play a romantic film\" → wrong: type \"romantic film\"; right: choose a specific film title and type that.",
    "- Before returning any type action that will be used to search for playable content, ask yourself: \"Am I typing the user's exact words?\" If yes, stop. Substitute a concrete title/artist/name from your knowledge, then return that as the value.",
    "- Apply this to all tasks: interpret vague or categorical requests into concrete choices. Use your general knowledge to pick realistic specifics.",
    "",
    "CRITICAL: Check action history before repeating actions!",
    "- Review the action history to see what has already been done.",
    "- NEVER repeat the same action sequence (e.g., don't search again if you already searched).",
    "- If the URL changed after an action, the page state has changed - adapt your plan accordingly.",
    "- If you see search results or video thumbnails, you are on a results page - click a result, don't search again.",
    "",
    "DOM model:",
    "- You see a JSON object with: { currentUrl, pageTitle, elements: [...] }.",
    "- currentUrl shows the current page URL - use this to understand page state (e.g., /results?search_query= means search results page).",
    "- Each element in elements[] has a unique 'sarathiId' attribute that is already injected into the page as [sarathi-id=\"...\"] and can be used to reference that DOM node.",
    "- NEVER invent sarathiIds. Only use values that appear in elements[].",
    "",
    "Your response format (STRICT JSON, no markdown, no extra text):",
    "{",
    '  \"status\": \"continue\" | \"completed\" | \"failed\",',
    '  \"reason\": \"short explanation string\",',
    '  \"actions\": [',
    "    {",
    '      \"type\": \"navigate\" | \"click\" | \"type\" | \"keypress\" | \"scroll\" | \"wait\" | \"speak\",',
    '      \"sarathiId\": \"uid-... or null\",',
    '      \"value\": \"string or null\"',
    "    }",
    "  ]",
    "}",
    "",
    "Rules per action type:",
    "- navigate: value MUST be a fully qualified URL like \"https://example.com\". sarathiId MUST be null. Navigate to the URL specified.",
    "- click: sarathiId MUST reference a clickable element from the current DOM snapshot. value MUST be null.",
    "- type: sarathiId MUST reference an input/textarea/select OR a contenteditable div (e.g., LinkedIn post editor, rich text editors). value MUST be the text to type. The system will automatically handle both traditional inputs and contenteditable elements.",
    "- keypress: value MUST be a key such as \"Enter\", \"Tab\", \"Escape\". sarathiId MUST reference the input/textarea element that should receive the keypress (e.g., the search box). NEVER use null for sarathiId with keypress - always target the specific input element.",
    "- scroll: value MUST be \"up\" or \"down\". sarathiId MUST be null.",
    "- wait: value MUST be a string with milliseconds such as \"500\" or \"1500\". sarathiId MUST be null.",
    "- speak: value MUST be the text content to speak aloud. sarathiId MUST be null. Use this action when the user asks a question, requests information to be read, or wants content spoken. The value should contain the complete text to be spoken.",
    "",
    "Website navigation handling:",
    "- When the user says \"go to [website]\" or \"open [website]\", first check if you know the exact URL for popular/well-known websites (e.g., youtube.com, google.com, facebook.com, github.com, amazon.com, etc.).",
    "- If you know the exact URL for a popular website, navigate directly: navigate -> https://[website].com",
    "- If the website is NOT popular/well-known OR you don't know the exact URL, use this technique:",
    "  1. Navigate to Google: navigate -> https://www.google.com",
    "  2. Wait for the page to load (check DOM snapshot for search input)",
    "  3. Find the Google search input box (look for elements with placeholder containing \"Search\", \"Google Search\", or input with type=\"search\")",
    "  4. Type the website name in the search box: type -> [website name]",
    "  5. Click the Google search button (look for button with text \"Google Search\" or \"Search\") OR press Enter on the search input",
    "  6. Wait for search results to load",
    "  7. Find the FIRST non-sponsored result (look for links in search results, avoid elements with text containing \"Ad\", \"Sponsored\", \"Advertisement\")",
    "  8. Click the first non-sponsored result to navigate to the website",
    "- Example flow for \"go to examplewebsite\": navigate -> google.com -> type \"examplewebsite\" -> click search -> click first non-sponsored result",
    "- This technique allows you to reach any website even if you don't know its exact URL.",
    "",
    "Multi-step planning:",
    "- You are allowed and encouraged to return MULTIPLE actions in one response, executed in order.",
    "- IMPORTANT: For search/submit actions, ALWAYS prefer clicking a search/submit button over pressing Enter.",
    "- Only use keypress Enter if NO search/submit button is found in the DOM snapshot.",
    "- Example: to submit a search, FIRST look for a search button (check element textContent, aria-label, or type=\"submit\"). If found: type -> click search button. If NOT found: type -> keypress Enter (with sarathiId pointing to the input).",
    "- Carefully plan sequences for complex tasks instead of single isolated actions.",
    "",
    "Play content handling:",
    "- If the user asks to play something, first check if the current page already has a player or relevant content. If yes, interact with it. If not, navigate to a site that fits the request.",
    "- On the target site, the search query you type MUST be a specific title or artist you chose from your knowledge, never the user's words. If the user said \"play a good song\", you MUST think of a specific song (e.g. a famous hit) and type that song name or artist—never type \"good song\". If they said \"play something relaxing\", type a specific track or artist, not \"something relaxing\". Being literal is wrong; being smart is required.",
    "- Then open or play the first relevant result.",
    "",
    "Text-to-speech handling:",
    "- If the user asks a question (e.g., \"what is\", \"tell me about\", \"explain\", \"read\", \"speak\"), you should respond with a \"speak\" action containing the answer or content to be read.",
    "- If the user asks to read content from the page, extract the relevant text from the DOM snapshot and return it in a \"speak\" action.",
    "- The \"speak\" action value should contain the complete text to be spoken. Keep it concise but informative (max 500 words).",
    "- Examples:",
    "  * User: \"what is artificial intelligence\" -> Return: { type: \"speak\", sarathiId: null, value: \"Artificial intelligence, or AI, is the simulation of human intelligence by machines...\" }",
    "  * User: \"read the article\" -> Extract article text from DOM -> Return: { type: \"speak\", sarathiId: null, value: \"[article content]\" }",
    "  * User: \"tell me the weather\" -> Return: { type: \"speak\", sarathiId: null, value: \"I cannot access real-time weather data. Please check a weather website.\" }",
    "",
    "Message/Email reply handling:",
    "- If the user asks to reply to a message or email, you MUST first understand the context by reading previous messages/emails in the thread.",
    "- Steps for email replies:",
    "  1. First, check if you're on an email thread/conversation page (look for email subject, previous messages, thread view).",
    "  2. If previous messages are collapsed or hidden, click to expand/open them (look for \"Show quoted text\", \"Show previous messages\", expand buttons, or click on message headers).",
    "  3. Read at least 2-3 previous messages in the thread to understand the conversation context, subject, and what needs to be replied to.",
    "  4. Extract key information: subject line, sender names, main topics discussed, questions asked, action items mentioned.",
    "  5. Only after understanding the full context, compose the reply text that addresses the previous messages appropriately.",
    "  6. Then type the composed reply text into the reply/compose field.",
    "- Steps for message replies (chat, messaging apps, forums, etc.):",
    "  1. Scroll up or navigate to see previous messages in the conversation.",
    "  2. Read at least the last 5-10 messages to understand the conversation flow and context.",
    "  3. Understand what the other person said, what questions they asked, or what they're responding to.",
    "  4. Compose a contextual reply that makes sense given the conversation history.",
    "  5. Type the reply into the message input field.",
    "- IMPORTANT: Never compose a reply without first reading and understanding the previous messages/emails in the thread.",
    "- Example flow for \"reply to this email\":",
    "  1. Check DOM for email thread view",
    "  2. Click to expand previous messages if collapsed",
    "  3. Read subject and 2-3 previous email bodies",
    "  4. Compose reply text based on context",
    "  5. Find reply button/compose field",
    "  6. Type the composed reply text",
    "  7. Click send",
    "",
    "Safety and constraints:",
    "- You MAY perform login steps (e.g. filling email/password and clicking login) whenever it is clearly necessary to advance the user's goal.",
    "- If an element's text/label suggests payment or destructive actions (e.g. contains pay, payment, subscribe, buy, confirm, delete, remove), do NOT click it UNLESS the user's command clearly requested such an action.",
    "- Prefer safe, reversible actions. Never attempt to actually pay, subscribe, or delete unless explicitly requested.",
    "",
    "You MUST respect the user's language but always produce actions that work on the current DOM.",
    "",
    "CRITICAL: If DOM snapshot has 0 elements, DO NOT keep navigating. Return a wait action or status=\"continue\" with empty actions to let the page load.",
    "",
    "IMPORTANT: Loop prevention:",
    "- Review action history to avoid repeating the same actions.",
    "- If you already performed an action (navigate, type, click), don't repeat it unless the page state has clearly changed.",
    "- Use the currentUrl to understand page state and adapt your plan accordingly.",
    "",
    "Stopping criteria:",
    "- Use status=\"continue\" when more steps are required.",
    "- Use status=\"completed\" when the user's goal appears to be satisfied (e.g., video is playing, search results are shown, task is done).",
    "- Use status=\"failed\" if you cannot progress (e.g., required element missing or action would be unsafe).",
    "",
    "Output requirements:",
    "- Return ONLY the JSON object described above. NO markdown, NO prose outside the JSON.",
    "- The JSON MUST be valid and parseable.",
    "- Do not include comments or trailing commas."
  ].join("\n");
}

function safeParseJSON(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for DOM to be ready by checking if elements are available
 * @param {number} tabId - Tab ID to check
 * @param {number} maxWaitMs - Maximum time to wait (default 3000ms)
 * @param {number} checkInterval - How often to check (default 200ms)
 * @returns {Promise<boolean>} - True if DOM is ready, false if timeout
 */
async function waitForDomReady(tabId, maxWaitMs = 3000, checkInterval = 200) {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    try {
      const snapshot = await requestDomSnapshot(tabId);
      const elementCount = (snapshot?.elements || []).length;
      if (elementCount > 10) {
        console.log(`Sarathi AI: DOM ready with ${elementCount} elements (took ${Date.now() - startTime}ms)`);
        return true;
      }
      await delay(checkInterval);
    } catch (e) {
      await delay(checkInterval);
    }
  }
  console.log(`Sarathi AI: DOM ready check timeout after ${maxWaitMs}ms`);
  return false;
}

function validateLLMResponse(obj) {
  if (!obj || typeof obj !== "object") return null;
  const validStatus = ["continue", "completed", "failed"];
  if (!validStatus.includes(obj.status)) return null;
  if (!Array.isArray(obj.actions)) return null;
  return obj;
}

async function waitForTabComplete(tabId) {
  return new Promise((resolve) => {
    function listener(updatedTabId, info) {
      if (updatedTabId === tabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

/**
 * Explicitly inject content scripts after navigation to ensure they're active
 * @param {number} tabId - The tab ID to inject into
 * @returns {Promise<boolean>} - True if injection succeeded
 */
async function injectContentScripts(tabId) {
  try {
    console.log("Sarathi AI: Injecting contentScript after navigation to tab", tabId, "MAIN FRAME only (frameIds: [0])");
    
    // Inject both domUtils.js and contentScript.js in order, targeting main frame only
    await chrome.scripting.executeScript({
      target: { tabId: tabId, frameIds: [0] },
      files: ["utils/domUtils.js"]
    });
    
    await chrome.scripting.executeScript({
      target: { tabId: tabId, frameIds: [0] },
      files: ["contentScript.js"]
    });
    
    console.log("Sarathi AI: Content scripts injected successfully into MAIN FRAME");
    
    // Wait a bit for scripts to initialize
    await delay(200);
    
    return true;
  } catch (e) {
    console.error("Sarathi AI: Failed to inject content scripts", e);
    // Don't fail navigation if injection fails - content scripts might already be there
    return false;
  }
}

/**
 * Detects if a URL is a redirect/security/interstitial page
 * @param {string} url - The URL to check
 * @returns {boolean} - True if URL matches redirect/interstitial patterns
 */
function isRedirectOrInterstitialPage(url) {
  if (!url || typeof url !== "string") return false;
  
  const redirectPatterns = [
    /RotateCookiesPage/i,
    /consent\./i,
    /accounts\./i,
    /ServiceLogin/i,
    /oauth2/i,
    /saml/i,
    /\/signin/i,
    /\/challenge/i,
    /CheckCookie/i,
    /SetSID/i,
    /webreauth/i,
    /\/v3\/signin/i,
    /\/recover/i,
    /\/interstitial/i
  ];
  
  return redirectPatterns.some(pattern => pattern.test(url));
}

/**
 * Extracts the destination URL from redirect/interstitial page query parameters
 * @param {string} url - The redirect page URL
 * @returns {string|null} - The extracted destination URL, or null if not found
 */
function extractRedirectTarget(url) {
  if (!url || typeof url !== "string") return null;
  
  try {
    const urlObj = new URL(url);
    const params = urlObj.searchParams;
    
    // List of common redirect parameter names, in order of priority
    const redirectParams = [
      "origin",
      "continue",
      "url",
      "dest",
      "destination",
      "redirect",
      "redirect_uri",
      "next",
      "returnTo",
      "return_to",
      "returnUrl",
      "return_url",
      "target",
      "to"
    ];
    
    // Try each parameter in order
    for (const paramName of redirectParams) {
      const paramValue = params.get(paramName);
      if (paramValue) {
        try {
          // Decode the parameter value
          let decoded = decodeURIComponent(paramValue);
          decoded = decoded.trim();
          
          // If it starts with http, return it directly
          if (decoded.startsWith("http://") || decoded.startsWith("https://")) {
            return decoded;
          }
          
          // If it's a relative URL, try to construct absolute URL
          if (decoded.startsWith("/")) {
            return urlObj.origin + decoded;
          }
          
          // Check if the decoded value itself contains another URL (nested redirect)
          // Try to extract URL from the decoded value
          const urlMatch = decoded.match(/https?:\/\/[^\s&]+/);
          if (urlMatch) {
            return urlMatch[0];
          }
        } catch (e) {
          // Continue to next parameter if decoding fails
          console.warn("Sarathi AI: Failed to decode redirect param", paramName, e);
        }
      }
    }
    
    // Also check hash fragment for redirect URLs
    if (urlObj.hash) {
      const hashMatch = urlObj.hash.match(/https?:\/\/[^\s&]+/);
      if (hashMatch) {
        return hashMatch[0];
      }
    }
    
    return null;
  } catch (e) {
    console.warn("Sarathi AI: Failed to parse URL for redirect extraction", url, e);
    return null;
  }
}

async function executeSarathiActionOnTab(tab, action) {
  if (!tab || !tab.id) {
    return { success: false, message: "No active tab" };
  }
  console.log("Sarathi AI: Executing action on MAIN FRAME only (frameId: 0)");
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(
      tab.id,
      { source: "background", type: "executeSarathiAction", action },
      { frameId: 0 }, // Target main frame only
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("Sarathi AI: executeSarathiAction error", chrome.runtime.lastError);
          resolve({
            success: false,
            message: chrome.runtime.lastError.message
          });
          return;
        }
        resolve(response || { success: false, message: "No response from content script" });
      }
    );
  });
}

async function callLLMWithRetry(settings, systemPrompt, userCommand, domSnapshot, actionHistory) {
  console.log("Sarathi AI: ========== CALLING LLM ==========");
  console.log("Sarathi AI: Provider:", settings.provider || "unknown");
  console.log("Sarathi AI: Model:", settings.model || "unknown");
  console.log("Sarathi AI: User command:", userCommand);
  console.log("Sarathi AI: DOM snapshot elements:", (domSnapshot?.elements || []).length);
  console.log("Sarathi AI: Action history length:", (actionHistory || []).length);
  
  try {
    console.log("Sarathi AI: Making first LLM API call...");
    const raw = await SarathiLLM.callLLM(
      settings,
      systemPrompt,
      userCommand,
      domSnapshot,
      actionHistory
    );
    console.log("Sarathi AI: Raw LLM response received:", typeof raw, raw ? (typeof raw === "string" ? raw.substring(0, 200) : JSON.stringify(raw).substring(0, 200)) : "null/undefined");
    
    const parsed = safeParseJSON(typeof raw === "string" ? raw : JSON.stringify(raw));
    console.log("Sarathi AI: Parsed JSON:", parsed);
    
    if (validateLLMResponse(parsed)) {
      console.log("Sarathi AI: LLM response validated successfully");
      return parsed;
    }
    console.warn("Sarathi AI: LLM JSON invalid on first attempt, retrying with correction hint");
    console.warn("Sarathi AI: Validation failed for:", parsed);
  } catch (e) {
    console.error("Sarathi AI: LLM call failed on first attempt", e);
    console.error("Sarathi AI: Error details:", e.message, e.stack);
  }

  // Retry once with a stronger \"JSON only\" reminder inside the system prompt.
  console.log("Sarathi AI: Retrying LLM call with JSON-only reminder...");
  const retryPrompt =
    systemPrompt +
    "\n\nIMPORTANT: Your previous response was invalid JSON. You MUST now respond with ONLY valid JSON and nothing else.";
  try {
    const raw2 = await SarathiLLM.callLLM(
      settings,
      retryPrompt,
      userCommand,
      domSnapshot,
      actionHistory
    );
    console.log("Sarathi AI: Raw LLM retry response received:", typeof raw2, raw2 ? (typeof raw2 === "string" ? raw2.substring(0, 200) : JSON.stringify(raw2).substring(0, 200)) : "null/undefined");
    
    const parsed2 = safeParseJSON(typeof raw2 === "string" ? raw2 : JSON.stringify(raw2));
    console.log("Sarathi AI: Parsed retry JSON:", parsed2);
    
    if (validateLLMResponse(parsed2)) {
      console.log("Sarathi AI: LLM retry response validated successfully");
      return parsed2;
    }
    console.warn("Sarathi AI: LLM retry response also invalid:", parsed2);
  } catch (e2) {
    console.error("Sarathi AI: LLM call failed on retry", e2);
    console.error("Sarathi AI: Retry error details:", e2.message, e2.stack);
  }
  
  console.error("Sarathi AI: ========== LLM CALL FAILED ==========");
  return null;
}

async function runLLMExecutionLoop(userCommand, tabId = null) {
  // Reset stop flag at the start of each new execution
  shouldStopExecution = false;
  
  let tab = null;
  
  // If tabId is provided, use it directly
  if (tabId) {
    try {
      tab = await chrome.tabs.get(tabId);
      if (!tab || !tab.id) {
        console.warn("Sarathi AI: Provided tabId not found, trying to get active tab", tabId);
        tab = null;
      }
    } catch (e) {
      console.warn("Sarathi AI: Error getting tab by tabId, trying active tab", e);
      tab = null;
    }
  }
  
  // If no tab yet, try to get active tab with retry
  if (!tab) {
    // Retry up to 3 times with delays
    for (let retry = 0; retry < 3; retry++) {
      tab = await getActiveTab();
      if (tab && tab.id) {
        break;
      }
      if (retry < 2) {
        console.log(`Sarathi AI: Active tab not found, retrying... (${retry + 1}/3)`);
        await delay(500);
      }
    }
  }
  
  if (!tab || !tab.id) {
    console.error("Sarathi AI: No active tab for orchestration after retries");
    broadcastStatus("Idle");
    chrome.runtime.sendMessage({
      source: "background",
      type: "actionUpdate",
      action: "ERROR: No active tab found. Please ensure a tab is open and active."
    }).catch(() => {});
    return;
  }
  
  console.log("Sarathi AI: Using tab for orchestration:", tab.id, tab.url);

  // Check if tab is blank/new tab - if so, navigate to Google.com first
  const isBlankPage = !tab.url || 
    tab.url === "about:blank" || 
    tab.url === "chrome://newtab/" || 
    tab.url === "edge://newtab/" ||
    tab.url.startsWith("about:") ||
    tab.url === "" ||
    tab.url === "chrome://newtab" ||
    tab.url === "edge://newtab";
  
  if (isBlankPage) {
    console.log("Sarathi AI: Detected blank/new tab, navigating to Google.com first");
    broadcastStatus("Executing");
    chrome.runtime.sendMessage({
      source: "background",
      type: "actionUpdate",
      action: "Navigating to Google.com (blank tab detected)..."
    }).catch(() => {});
    
    // Navigate to Google.com
    await chrome.tabs.update(tab.id, { url: "https://www.google.com" });
    
    // Wait for page to load
    await waitForTabComplete(tab.id);
    
    // Inject content scripts
    await injectContentScripts(tab.id);
    
    // Refresh tab reference
    try {
      const refreshedTab = await chrome.tabs.get(tab.id);
      if (refreshedTab && refreshedTab.id) {
        tab = refreshedTab;
        console.log("Sarathi AI: Successfully navigated to Google.com, new URL:", tab.url);
      }
    } catch (e) {
      console.error("Sarathi AI: Failed to refresh tab after Google navigation", e);
    }
    
    // Small delay to ensure DOM is ready
    await delay(500);
  }

  const settings = await SarathiStorage.getSettings();
  console.log("Sarathi AI: Settings loaded:", {
    provider: settings.provider,
    model: settings.model,
    hasApiKey: !!settings.apiKey,
    apiKeyLength: settings.apiKey ? settings.apiKey.length : 0
  });
  
  if (!settings.apiKey) {
    console.error("Sarathi AI: No API key found in settings! Please configure API key in options page.");
    broadcastStatus("Idle");
    chrome.runtime.sendMessage({
      source: "background",
      type: "actionUpdate",
      action: "ERROR: No API key configured. Please set API key in extension options."
    }).catch(() => {});
    return;
  }
  
  const systemPrompt = buildSystemPrompt();

  const actionHistory = [];
  let step = 0;
  let lastUrl = null;
  let repeatedActionCount = 0;
  let redirectFixCount = 0; // Track number of redirect fixes
  const recentActions = []; // Track last 5 action signatures to detect loops

  broadcastStatus("Executing");

  while (step < MAX_STEPS) {
    // Check if execution should be stopped
    if (shouldStopExecution) {
      console.log("Sarathi AI: Execution stopped by user");
      shouldStopExecution = false; // Reset flag after stopping
      broadcastStatus("Idle");
      chrome.runtime.sendMessage({
        source: "background",
        type: "actionUpdate",
        action: "Execution stopped by user"
      }).catch(() => {});
      break;
    }
    
    step += 1;
    console.log(`Sarathi AI: iteration ${step}`);

    // Refresh tab reference at start of each iteration to ensure we have latest tab info
    try {
      const refreshedTab = await chrome.tabs.get(tab.id);
      if (refreshedTab && refreshedTab.id) {
        tab = refreshedTab;
      } else {
        console.error("Sarathi AI: Tab not found, stopping execution");
        break;
      }
    } catch (e) {
      console.error("Sarathi AI: Failed to refresh tab reference", e);
      break;
    }

    let domSnapshot;
    try {
      // Wait a bit before getting snapshot to ensure page is ready
      await delay(200);
      domSnapshot = await requestDomSnapshot(tab.id);
      console.log("Sarathi AI: DOM snapshot elements:", (domSnapshot && domSnapshot.elements || []).length);
      console.log("Sarathi AI: currentUrl:", domSnapshot?.url || domSnapshot?.currentUrl);
    } catch (e) {
      console.error("Sarathi AI: Failed to get DOM snapshot", e);
      // If snapshot fails, try injecting content scripts and retry once
      console.log("Sarathi AI: Attempting to inject content scripts and retry snapshot");
      await injectContentScripts(tab.id);
      await delay(300);
      try {
        domSnapshot = await requestDomSnapshot(tab.id);
        console.log("Sarathi AI: Retry snapshot elements:", (domSnapshot && domSnapshot.elements || []).length);
      } catch (e2) {
        console.error("Sarathi AI: Retry snapshot also failed", e2);
        break;
      }
    }

    // Get URL from content script (location.href) - this is the actual browser URL after all redirects
    const currentUrl = domSnapshot?.url || domSnapshot?.currentUrl || "";
    if (currentUrl !== lastUrl) {
      console.log("Sarathi AI: URL changed from", lastUrl, "to", currentUrl);
      lastUrl = currentUrl;
      repeatedActionCount = 0; // Reset counter on URL change
      // Reset redirect fix count if we're no longer on a redirect page
      if (redirectFixCount > 0 && !isRedirectOrInterstitialPage(currentUrl)) {
        console.log("Sarathi AI: Successfully navigated away from redirect page, resetting redirect fix count");
        redirectFixCount = 0;
      }
    }

    // Check for redirect/security/interstitial pages and automatically navigate to destination
    if (isRedirectOrInterstitialPage(currentUrl)) {
      console.log("Sarathi AI: Redirect/security page detected:", currentUrl);
      
      // Check retry limit
      if (redirectFixCount >= 3) {
        console.error("Sarathi AI: Stuck in redirect/security page after 3 attempts. Stopping.");
        chrome.runtime.sendMessage({
          source: "background",
          type: "actionUpdate",
          action: "Failed: Stuck in redirect/security page. User may need to login or allow cookies."
        }).catch(() => {});
        broadcastStatus("Idle");
        return;
      }
      
      // Extract redirect target from URL
      const redirectTarget = extractRedirectTarget(currentUrl);
      
      if (redirectTarget) {
        redirectFixCount += 1;
        console.log(`Sarathi AI: Redirect/security page detected (attempt ${redirectFixCount}/3) -> navigating to redirect target:`, redirectTarget);
        
        // Update popup
        chrome.runtime.sendMessage({
          source: "background",
          type: "actionUpdate",
          action: `Redirect Fix (${redirectFixCount}/3): Navigating to ${redirectTarget}`
        }).catch(() => {});
        
        // Navigate to redirect target
          try {
            chrome.tabs.update(tab.id, { url: redirectTarget });
            await waitForTabComplete(tab.id);
            
            // Explicitly inject content scripts after navigation
            await injectContentScripts(tab.id);
            
            // Refresh tab reference to ensure we have the latest tab info
            const refreshedTab = await chrome.tabs.get(tab.id);
            if (!refreshedTab || !refreshedTab.id) {
              console.error("Sarathi AI: Tab not found after redirect fix navigation");
              continue;
            }
            tab = refreshedTab; // Update tab reference
            
            // Wait for redirects to complete
            let previousUrl = redirectTarget;
            let currentUrlCheck = "";
            let redirectStable = false;
            let redirectChecks = 0;
            const maxRedirectChecks = 5;
            
            while (!redirectStable && redirectChecks < maxRedirectChecks) {
              await delay(1000);
              const updatedTab = await chrome.tabs.get(tab.id);
              currentUrlCheck = updatedTab.url || "";
              
              if (currentUrlCheck === previousUrl && previousUrl !== "") {
                redirectStable = true;
                console.log("Sarathi AI: Redirect fix complete, final URL:", currentUrlCheck);
              } else {
                console.log(`Sarathi AI: Redirect fix check ${redirectChecks + 1}/${maxRedirectChecks}, URL:`, currentUrlCheck);
                previousUrl = currentUrlCheck;
                redirectChecks += 1;
              }
            }
            
            // Wait for DOM to be ready dynamically
            await waitForDomReady(tab.id, 2000, 200);
            
            // Refresh snapshot and continue loop (skip LLM call this iteration)
            try {
              domSnapshot = await requestDomSnapshot(tab.id);
              const newUrl = domSnapshot?.url || domSnapshot?.currentUrl || currentUrlCheck;
              if (newUrl && newUrl !== currentUrl) {
                lastUrl = newUrl;
                console.log("Sarathi AI: After redirect fix, new URL:", newUrl);
              }
              console.log("Sarathi AI: After redirect fix, snapshot elements:", (domSnapshot && domSnapshot.elements || []).length);
            } catch (e) {
              console.error("Sarathi AI: Failed to get snapshot after redirect fix", e);
            }
            
            // Continue to next iteration (skip LLM call)
            continue;
        } catch (e) {
          console.error("Sarathi AI: Redirect fix navigation failed", e);
          chrome.runtime.sendMessage({
            source: "background",
            type: "actionUpdate",
            action: `Redirect fix failed: ${e.message || "Unknown error"}`
          }).catch(() => {});
        }
      } else {
        console.warn("Sarathi AI: Redirect/security page detected but could not extract redirect target from:", currentUrl);
        chrome.runtime.sendMessage({
          source: "background",
          type: "actionUpdate",
          action: "Warning: Redirect page detected but no destination URL found"
        }).catch(() => {});
        // Continue with LLM call - let it handle the situation
      }
    }

    // If snapshot has 0 elements, wait briefly and retry once to allow page to load
    // But don't wait too long - if page has no elements, navigation may be needed
    const hasZeroElements = (domSnapshot?.elements || []).length === 0;
    if (hasZeroElements && step === 1) {
      // Only wait on first iteration - give page a chance to load initially
      console.warn("Sarathi AI: Snapshot has 0 elements on first iteration, waiting for DOM to be ready...");
      await waitForDomReady(tab.id, 2000, 200);
      try {
        domSnapshot = await requestDomSnapshot(tab.id);
        console.log("Sarathi AI: Retry snapshot elements:", (domSnapshot && domSnapshot.elements || []).length);
        // Update URL from fresh snapshot
        const retryUrl = domSnapshot?.url || domSnapshot?.currentUrl || "";
        if (retryUrl && retryUrl !== currentUrl) {
          lastUrl = retryUrl;
        }
      } catch (e) {
        console.error("Sarathi AI: Retry snapshot failed", e);
      }
    }

    console.log("Sarathi AI: About to call LLM (iteration " + step + ")");
    const llmResponse = await callLLMWithRetry(
      settings,
      systemPrompt,
      userCommand,
      domSnapshot,
      actionHistory
    );

    console.log("Sarathi AI: LLM call completed, response:", llmResponse ? "received" : "null/undefined");
    
    if (!llmResponse) {
      console.error("Sarathi AI: ========== LLM RESPONSE IS NULL/UNDEFINED ==========");
      console.error("Sarathi AI: LLM response invalid after retry, stopping");
      console.error("Sarathi AI: This could mean:");
      console.error("  - LLM API call failed");
      console.error("  - LLM returned invalid JSON");
      console.error("  - Network error");
      console.error("  - API key invalid");
      break;
    }

    // Enhanced LLM response logging
    console.log("========================================");
    console.log("Sarathi AI: LLM Response (Iteration " + step + ")");
    console.log("========================================");
    console.log("Status:", llmResponse.status || "unknown");
    console.log("Reason:", llmResponse.reason || "N/A");
    console.log("Actions Count:", (llmResponse.actions || []).length);
    if (llmResponse.actions && llmResponse.actions.length > 0) {
      console.log("Actions:");
      llmResponse.actions.forEach((action, idx) => {
        console.log(`  [${idx + 1}] ${action.type}`, {
          sarathiId: action.sarathiId || null,
          value: action.value || null
        });
      });
    }
    console.log("Full Response JSON:");
    console.log(JSON.stringify(llmResponse, null, 2));
    console.log("========================================");
    
    chrome.runtime
      .sendMessage({
        source: "background",
        type: "llmUpdate",
        payload: JSON.stringify(llmResponse, null, 2)
      })
      .catch(() => {});

    const { status, reason, actions } = llmResponse;

    // Check if we should stop after executing actions
    const shouldStopAfterActions = (status === "completed" || status === "failed");
    
    if (!Array.isArray(actions) || actions.length === 0) {
      if (shouldStopAfterActions) {
        console.log("Sarathi AI: loop finished with status", status, "reason:", reason, "(no actions to execute)");
      } else {
        console.warn("Sarathi AI: No actions returned, stopping");
      }
      break;
    }

    // If snapshot has 0 elements and LLM wants to navigate, allow it to proceed
    // Navigation is often needed to get OUT of pages with 0 elements (like redirect pages)
    const wantsToNavigate = actions.some(a => a.type === 'navigate');
    if (hasZeroElements && wantsToNavigate) {
      console.log("Sarathi AI: 0 elements but LLM wants to navigate. Allowing navigation to proceed (this may be needed to escape redirect pages).");
      // Don't skip navigation - let it execute. The navigation handler will wait for page load properly.
    }

    // Loop detection: check if we're repeating the same actions
    const actionSignature = actions.map(a => `${a.type}:${a.sarathiId || ''}:${a.value || ''}`).join('|');
    
    if (recentActions.includes(actionSignature)) {
      repeatedActionCount += 1;
      console.warn(`Sarathi AI: Detected repeated action sequence (count: ${repeatedActionCount})`, actionSignature);
      if (repeatedActionCount >= 2) {
        console.error("Sarathi AI: Loop detected! Same actions repeated 2+ times. Stopping to prevent infinite loop.");
        chrome.runtime.sendMessage({
          source: "background",
          type: "actionUpdate",
          action: "LOOP DETECTED: Same actions repeated. Stopping execution."
        }).catch(() => {});
        break;
      }
    } else {
      repeatedActionCount = 0;
    }
    recentActions.push(actionSignature);
    if (recentActions.length > 5) {
      recentActions.shift(); // Keep only last 5
    }

    // Helper function to get element label from DOM snapshot
    function getElementLabel(sarathiId, snapshot) {
      if (!sarathiId || !snapshot || !snapshot.elements) return null;
      
      const element = snapshot.elements.find(el => el.sarathiId === sarathiId);
      if (!element) return null;
      
      // Try to get label in priority order: textContent > ariaLabel > placeholder > id > className
      const label = element.textContent || 
                    element.ariaLabel || 
                    element.placeholder || 
                    element.id || 
                    element.className?.split(' ')[0] || 
                    null;
      
      // Clean up label - remove extra whitespace and limit length
      if (label) {
        const cleaned = label.trim().replace(/\s+/g, ' ');
        return cleaned.length > 40 ? cleaned.substring(0, 40) + "..." : cleaned;
      }
      
      return null;
    }

    // Helper function to format step text
    function formatStepText(actionType, actionValue, actionSarathiId, elementLabel = null) {
      const typeMap = {
        "click": "Click",
        "type": "Type",
        "keypress": "Press",
        "scroll": "Scroll",
        "navigate": "Navigate to",
        "speak": "Speak",
        "wait": "Wait"
      };
      const actionName = typeMap[actionType] || actionType;
      
      if (actionType === "click") {
        if (elementLabel) {
          return `${actionName} "${elementLabel}"`;
        }
        return `${actionName} button/element`;
      } else if (actionType === "type") {
        const text = actionValue || "";
        const preview = text.length > 30 ? text.substring(0, 30) + "..." : text;
        return `${actionName} "${preview}"`;
      } else if (actionType === "keypress") {
        return `${actionName} ${actionValue || "key"}`;
      } else if (actionType === "scroll") {
        return `${actionName} ${actionValue || "down"}`;
      } else if (actionType === "navigate") {
        const url = actionValue || "";
        const shortUrl = url.length > 40 ? url.substring(0, 40) + "..." : url;
        return `${actionName} ${shortUrl}`;
      } else if (actionType === "speak") {
        const text = actionValue || "";
        const preview = text.length > 30 ? text.substring(0, 30) + "..." : text;
        return `${actionName}: "${preview}"`;
      } else if (actionType === "wait") {
        return `${actionName} ${actionValue || "0"}ms`;
      }
      return `${actionName} action`;
    }

    console.log(`Sarathi AI: Processing ${actions.length} action(s) in iteration ${step}`);
    for (let i = 0; i < actions.length; i += 1) {
      const action = actions[i] || {};
      const type = (action.type || "").toLowerCase();
      console.log(`Sarathi AI: [${step}.${i + 1}] executing action ${i + 1}/${actions.length}:`, type, JSON.stringify(action));
      
      // Get element label from DOM snapshot for click actions
      let elementLabel = null;
      if (type === "click" && action.sarathiId && domSnapshot) {
        elementLabel = getElementLabel(action.sarathiId, domSnapshot);
      }
      
      // Send "executing" status
      const stepText = formatStepText(type, action.value, action.sarathiId, elementLabel);
      chrome.runtime.sendMessage({
        source: "background",
        type: "stepUpdate",
        stepText: stepText,
        stepStatus: "executing"
      }).catch(() => {});
      
      // Special logging for speak actions
      if (type === "speak") {
        console.log(`Sarathi AI: [${step}.${i + 1}] SPEAK ACTION - Text to speak:`, action.value);
      }

      let result = { success: true, message: "Skipped (navigate handled separately)" };

      if (type === "navigate") {
        const url = (action.value || "").trim();
        if (!url) {
          result = { success: false, message: "Missing URL for navigate" };
        } else {
          let finalUrl = url;
          if (!/^https?:\/\//i.test(finalUrl)) {
            finalUrl = "https://" + finalUrl;
          }
          try {
            chrome.tabs.update(tab.id, { url: finalUrl });
            console.log("Sarathi AI: navigating to", finalUrl);
            
            // Wait for page to load
            await waitForTabComplete(tab.id);
            
            // Explicitly inject content scripts after navigation
            await injectContentScripts(tab.id);
            
            // Refresh tab reference to ensure we have the latest tab info
            const refreshedTab = await chrome.tabs.get(tab.id);
            if (!refreshedTab || !refreshedTab.id) {
              console.error("Sarathi AI: Tab not found after navigation");
              result = { success: false, message: "Tab not found after navigation" };
            } else {
              tab = refreshedTab; // Update tab reference
              
              // Wait for all redirects to complete - check URL multiple times
              let previousUrl = "";
              let currentUrlCheck = "";
              let redirectStable = false;
              let redirectChecks = 0;
              const maxRedirectChecks = 5;
              
            while (!redirectStable && redirectChecks < maxRedirectChecks) {
              await delay(1000); // Wait 1 second between checks
              const updatedTab = await chrome.tabs.get(tab.id);
                currentUrlCheck = updatedTab.url || "";
                
                if (currentUrlCheck === previousUrl && previousUrl !== "") {
                  // URL is stable (no more redirects)
                  redirectStable = true;
                  console.log("Sarathi AI: Redirects complete, final URL:", currentUrlCheck);
                } else {
                  console.log(`Sarathi AI: Redirect check ${redirectChecks + 1}/${maxRedirectChecks}, URL:`, currentUrlCheck);
                  previousUrl = currentUrlCheck;
                  redirectChecks += 1;
                }
              }
              
              // Wait for DOM to be ready dynamically
              await waitForDomReady(tab.id, 2000, 200);
              
              // Get final URL from content script (location.href) - this is the actual browser URL
              try {
                const finalSnapshot = await requestDomSnapshot(tab.id);
                const finalUrl = finalSnapshot?.url || finalSnapshot?.currentUrl || currentUrlCheck;
                console.log("Sarathi AI: Navigation complete, final URL from content script:", finalUrl);
                result = { success: true, message: "Navigated to " + finalUrl };
                
                // Update step status to success
                chrome.runtime.sendMessage({
                  source: "background",
                  type: "stepUpdate",
                  stepText: formatStepText("navigate", finalUrl, null),
                  stepStatus: "success"
                }).catch(() => {});
              } catch (e) {
                console.warn("Sarathi AI: Could not get URL from content script, using tab URL:", currentUrlCheck);
                result = { success: true, message: "Navigated to " + currentUrlCheck };
                
                // Update step status to success
                chrome.runtime.sendMessage({
                  source: "background",
                  type: "stepUpdate",
                  stepText: formatStepText("navigate", currentUrlCheck, null),
                  stepStatus: "success"
                }).catch(() => {});
              }
            }
          } catch (e) {
            console.error("Sarathi AI: navigate error", e);
            result = { success: false, message: e && e.message ? e.message : "Navigate failed" };
            
            // Update step status to failed
            chrome.runtime.sendMessage({
              source: "background",
              type: "stepUpdate",
              stepText: formatStepText("navigate", action.value, null),
              stepStatus: "failed"
            }).catch(() => {});
          }
        }
      } else {
        try {
          console.log(`Sarathi AI: [${step}.${i + 1}] calling executeSarathiActionOnTab for`, type);
          result = await executeSarathiActionOnTab(tab, action);
          console.log(`Sarathi AI: [${step}.${i + 1}] action result:`, result);
          
          // Update step status based on result
          chrome.runtime.sendMessage({
            source: "background",
            type: "stepUpdate",
            stepText: stepText,
            stepStatus: result.success ? "success" : "failed"
          }).catch(() => {});
        } catch (e) {
          console.error(`Sarathi AI: [${step}.${i + 1}] executeSarathiActionOnTab error`, e);
          result = { success: false, message: e && e.message ? e.message : "Execution failed" };
          
          // Update step status to failed
          chrome.runtime.sendMessage({
            source: "background",
            type: "stepUpdate",
            stepText: stepText,
            stepStatus: "failed"
          }).catch(() => {});
        }
        // 1 second delay between actions (except after navigate which already has delay)
        if (i < actions.length - 1) {
          // Only delay if there are more actions coming
          console.log(`Sarathi AI: [${step}.${i + 1}] waiting 500ms before next action (${i + 1}/${actions.length})`);
          await delay(500);
        } else {
          console.log(`Sarathi AI: [${step}.${i + 1}] last action in batch, no delay needed`);
        }
      }
      chrome.runtime
        .sendMessage({
          source: "background",
          type: "actionUpdate",
          action: `${type} sarathiId=${action.sarathiId || "null"} value=${action.value || ""} -> ${result.message}`
        })
        .catch(() => {});
      
      // Special handling for speak actions - send text to popup as fallback if speech fails
      if (type === "speak") {
        chrome.runtime
          .sendMessage({
            source: "background",
            type: "speakText",
            text: action.value || "",
            success: result.success || false
          })
          .catch(() => {});
      }

      actionHistory.push({
        step,
        index: i,
        type,
        sarathiId: action.sarathiId || null,
        value: action.value || null,
        success: !!result.success,
        message: result.message || "",
        timestamp: Date.now()
      });
      // Keep only last 20 actions
      if (actionHistory.length > 20) {
        actionHistory.splice(0, actionHistory.length - 20);
      }

      if (!result.success) {
        console.warn(`Sarathi AI: [${step}.${i + 1}] action failed, but continuing with remaining actions`);
        // Don't break immediately - continue with other actions in the batch
        // Only break if it's a critical failure (like navigate failing)
        if (type === "navigate") {
          console.warn("Sarathi AI: navigate failed, stopping");
          step = MAX_STEPS; // force exit
          break;
        }
      }
    }

    // Check if execution should be stopped before continuing
    if (shouldStopExecution) {
      console.log("Sarathi AI: Execution stopped by user during action execution");
      shouldStopExecution = false; // Reset flag after stopping
      broadcastStatus("Idle");
      chrome.runtime.sendMessage({
        source: "background",
        type: "actionUpdate",
        action: "Execution stopped by user"
      }).catch(() => {});
      break;
    }
    
    // After executing all actions in this batch, check if we should stop
    if (shouldStopAfterActions) {
      console.log(`Sarathi AI: completed all ${actions.length} action(s) in iteration ${step}, status is ${status}, stopping loop`);
      break;
    }
    
    // Continue to next iteration which will get a fresh DOM snapshot and call LLM again
    console.log(`Sarathi AI: completed all ${actions.length} action(s) in iteration ${step}, continuing to next iteration`);
  }

  broadcastStatus("Idle");
}

async function handleTranscript(transcript, source, sender = null) {
  console.log("Sarathi AI: ========== RECEIVED TRANSCRIPT IN BACKGROUND ==========");
  console.log("Sarathi AI: Source:", source);
  console.log("Sarathi AI: Transcript (raw):", transcript);
  console.log("Sarathi AI: Transcript type:", typeof transcript);
  console.log("Sarathi AI: Transcript length:", transcript ? transcript.length : 0);
  console.log("Sarathi AI: Transcript trimmed:", transcript ? transcript.trim() : "");
  console.log("Sarathi AI: Transcript is empty:", !transcript || transcript.trim().length === 0);
  
  if (!transcript || transcript.trim().length === 0) {
    console.error("Sarathi AI: ✗ ERROR: Received empty/blank transcript!");
    console.error("Sarathi AI: This should not happen. Check content script logs above.");
    broadcastStatus("Idle");
    chrome.runtime.sendMessage({
      source: "background",
      type: "actionUpdate",
      action: "ERROR: Received empty transcript. Please check microphone and try again."
    }).catch(() => {});
    return;
  }
  
  // Extract tabId from sender if available (from content script)
  let tabId = null;
  if (sender && sender.tab && sender.tab.id) {
    tabId = sender.tab.id;
    console.log("Sarathi AI: Using tabId from sender:", tabId);
  }
  
  // Update popup last transcript display
  console.log("Sarathi AI: Updating popup with transcript:", transcript);
  chrome.runtime
    .sendMessage({
      source: "background",
      type: "transcriptUpdate",
      transcript
    })
    .then(() => {
      console.log("Sarathi AI: ✓ Transcript update sent to popup");
    })
    .catch((e) => {
      console.error("Sarathi AI: ✗ Failed to send transcript update to popup:", e);
    });

  console.log("Sarathi AI: ✓ Starting LLM execution loop with transcript:", transcript);
  broadcastStatus("Activated");
  
  // Clear steps list when starting new execution
  chrome.runtime.sendMessage({
    source: "background",
    type: "clearSteps"
  }).catch(() => {});
  
  await runLLMExecutionLoop(transcript, tabId);
  console.log("Sarathi AI: ==============================================");
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (!message || typeof message !== "object") return;

    // Popup UI messages
    if (message.source === "popup") {
      if (message.type === "getState") {
        const settings = await SarathiStorage.getSettings();
        sendResponse({
          alwaysListening,
          status: currentStatus,
          settings,
          micStatus
        });
        return;
      }

      if (message.type === "setAlwaysListening") {
        const enable = !!message.value;

        if (enable) {
          const settings = await SarathiStorage.getSettings();
          const tab = await getActiveTab();
          if (!tab || !tab.id) {
            sendResponse({ success: false, alwaysListening: false, micStatus });
            return;
          }

          alwaysListening = true;
          broadcastStatus("Listening");
          chrome.tabs.sendMessage(tab.id, {
            source: "background",
            type: "startListening",
            wakeWordEnabled: true,
            wakeWordText: message.wakeWord || settings.wakeWord || "hey nova",
            lang: settings.language || "en-IN"
          }, { frameId: 0 }); // Target main frame only
          sendResponse({ success: true, alwaysListening: true, micStatus });
          return;
        }

        // Turning off
        alwaysListening = false;
        const tab = await getActiveTab();
        if (tab && tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            source: "background",
            type: "stopListening"
          }, { frameId: 0 }); // Target main frame only
        }
        broadcastStatus("Idle");
        sendResponse({ success: true, alwaysListening: false, micStatus });
        return;
      }

      if (message.type === "manualRecognize") {
        const settings = await SarathiStorage.getSettings();
        let tab = await getActiveTab();
        if (!tab || !tab.id) {
          sendResponse({ success: false, micStatus });
          return;
        }

        // Check if tab is blank/new tab - if so, navigate to Google.com first
        const isBlankPage = !tab.url || 
          tab.url === "about:blank" || 
          tab.url === "chrome://newtab/" || 
          tab.url === "edge://newtab/" ||
          tab.url.startsWith("about:") ||
          tab.url === "" ||
          tab.url === "chrome://newtab" ||
          tab.url === "edge://newtab";
        
        if (isBlankPage) {
          console.log("Sarathi AI: Detected blank/new tab for manual record, navigating to Google.com first");
          broadcastStatus("Executing");
          chrome.runtime.sendMessage({
            source: "background",
            type: "actionUpdate",
            action: "Navigating to Google.com (blank tab detected)..."
          }).catch(() => {});
          
          // Navigate to Google.com
          await chrome.tabs.update(tab.id, { url: "https://www.google.com" });
          
          // Wait for page to load
          await waitForTabComplete(tab.id);
          
          // Inject content scripts
          await injectContentScripts(tab.id);
          
          // Refresh tab reference
          try {
            const refreshedTab = await chrome.tabs.get(tab.id);
            if (refreshedTab && refreshedTab.id) {
              tab = refreshedTab;
              console.log("Sarathi AI: Successfully navigated to Google.com for manual record, new URL:", tab.url);
            }
          } catch (e) {
            console.error("Sarathi AI: Failed to refresh tab after Google navigation", e);
          }
          
          // Small delay to ensure DOM is ready
          await delay(500);
          
          // Update status back to Listening
          broadcastStatus("Listening");
        }

        broadcastStatus("Listening");
        chrome.tabs.sendMessage(tab.id, {
          source: "background",
          type: "oneShotRecognize",
          lang: settings.language || "en-IN"
        }, { frameId: 0 }); // Target main frame only
        sendResponse({ success: true, micStatus });
        return;
      }

      if (message.type === "typedCommand") {
        // Handle typed command from popup (same as voice transcript)
        const typedCommand = message.transcript || "";
        if (!typedCommand || typedCommand.trim().length === 0) {
          sendResponse({ success: false, message: "Empty command" });
          return;
        }

        console.log("Sarathi AI: Received typed command from popup:", typedCommand);
        const tab = await getActiveTab();
        const tabId = tab && tab.id ? tab.id : null;
        
        // Use handleTranscript to process typed command (same flow as voice)
        await handleTranscript(typedCommand, "popup", { tab: tab });
        sendResponse({ success: true });
        return;
      }

      if (message.type === "stopExecution") {
        console.log("Sarathi AI: Stop execution requested by user");
        shouldStopExecution = true;
        broadcastStatus("Idle");
        chrome.runtime.sendMessage({
          source: "background",
          type: "actionUpdate",
          action: "Execution stopped by user"
        }).catch(() => {});
        sendResponse({ success: true });
        return;
      }

      // No additional popup message types handled here.
    }

    // Messages from content script (DOM + speech)
    if (message.source === "contentScript") {
      if (message.type === "wakeWordDetected") {
        broadcastStatus("Activated");
        sendResponse({ ok: true });
        return;
      }
      if (message.type === "transcript") {
        await handleTranscript(message.transcript, "contentScript", sender);
        sendResponse({ ok: true });
        return;
      }
      if (message.type === "speechError") {
        console.warn("Sarathi AI: speech error from content script", message.error);
        if (message.error === "not-allowed" || message.error === "service-not-allowed") {
          micStatus = "MIC_BLOCKED";
          alwaysListening = false;
          broadcastStatus("MIC_BLOCKED");
        } else {
          alwaysListening = false;
          broadcastStatus("Idle");
        }
        sendResponse({ ok: true });
        return;
      }
      if (message.type === "listeningStopped") {
        // Content script reports that recognition has fully stopped.
        if (!alwaysListening) {
          broadcastStatus("Idle");
        }
        sendResponse({ ok: true });
        return;
      }
      if (message.type === "log") {
        console.log("Sarathi content script:", message.payload);
        sendResponse({ ok: true });
        return;
      }
    }
  })();

  // Keep the message channel open for async sendResponse
  return true;
});


