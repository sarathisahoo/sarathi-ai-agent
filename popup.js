/*
 Sarathi AI
 Copyright (c) 2026 Sarathi Sabyasachi Sahoo
 MIT License
*/

/* global chrome, SarathiStorage */

document.addEventListener("DOMContentLoaded", () => {
  const toggleAlwaysListening = document.getElementById(
    "toggle-always-listening"
  );
  const btnRecord = document.getElementById("btn-record");
  const btnGrantPermission = document.getElementById("btn-grant-permission");
  const micWarning = document.getElementById("mic-warning");
  const languageSelect = document.getElementById("language-select");
  const btnSettings = document.getElementById("btn-settings");
  const statusPill = document.getElementById("status-pill");
  const lastTranscriptEl = document.getElementById("last-transcript");
  const lastActionEl = document.getElementById("last-action");
  const lastLlmEl = document.getElementById("last-llm-response");
  const stepsListEl = document.getElementById("steps-list");
  const textCommandInput = document.getElementById("text-command-input");
  const btnExecute = document.getElementById("btn-execute");
  const btnStop = document.getElementById("btn-stop");

  // Array to store executed steps
  let executedSteps = [];

  function setStatus(status) {
    statusPill.textContent = status;
    statusPill.setAttribute("data-status", status);
    
    // Show/hide stop button based on execution status
    if (btnStop) {
      if (status === "Executing" || status === "Activated") {
        btnStop.style.display = "inline-flex";
        if (btnExecute) btnExecute.style.display = "none";
      } else {
        btnStop.style.display = "none";
        if (btnExecute) btnExecute.style.display = "inline-flex";
      }
    }

    // Clear steps when execution starts
    if (status === "Activated" || status === "Executing") {
      if (status === "Activated") {
        executedSteps = [];
        updateStepsList();
      }
    }
  }

  function updateStepsList() {
    if (!stepsListEl) return;
    
    stepsListEl.innerHTML = "";
    
    if (executedSteps.length === 0) {
      const emptyMsg = document.createElement("div");
      emptyMsg.className = "step-item";
      emptyMsg.style.color = "#6b7280";
      emptyMsg.style.fontStyle = "italic";
      emptyMsg.textContent = "No steps executed yet...";
      stepsListEl.appendChild(emptyMsg);
      return;
    }

    executedSteps.forEach((step) => {
      const stepItem = document.createElement("div");
      stepItem.className = "step-item";
      
      const icon = document.createElement("span");
      icon.className = "step-icon";
      
      if (step.status === "success") {
        icon.classList.add("success");
      } else if (step.status === "failed") {
        icon.classList.add("failed");
      } else if (step.status === "executing") {
        icon.classList.add("executing");
      }
      
      const text = document.createElement("span");
      text.className = "step-text";
      text.textContent = step.text;
      
      stepItem.appendChild(icon);
      stepItem.appendChild(text);
      stepsListEl.appendChild(stepItem);
    });

    // Auto-scroll to bottom to show latest step
    stepsListEl.scrollTop = stepsListEl.scrollHeight;
  }

  function addStep(text, status) {
    // Remove any "executing" status steps (they should be replaced with success/failed)
    if (status === "success" || status === "failed") {
      executedSteps = executedSteps.filter(s => s.status !== "executing" || s.text !== text);
    }
    
    executedSteps.push({ text, status, timestamp: Date.now() });
    updateStepsList();
  }

  function setMicWarning(visible, message) {
    if (!micWarning) return;
    micWarning.style.display = visible ? "flex" : "none";
    if (visible && message) {
      const textEl = micWarning.querySelector(".mic-warning-text");
      if (textEl) textEl.textContent = message;
    }
  }

  async function initState() {
    setStatus("Idle");
    chrome.runtime.sendMessage(
      { source: "popup", type: "getState" },
      (resp) => {
        if (!resp) return;
        toggleAlwaysListening.checked = !!resp.alwaysListening;
        setStatus(resp.status || "Idle");

         // Initialize language dropdown from settings if available
         if (resp.settings && resp.settings.language && languageSelect) {
           languageSelect.value = resp.settings.language;
         }
      }
    );
  }

  toggleAlwaysListening.addEventListener("change", async (e) => {
    const on = e.target.checked;
    const settings = await SarathiStorage.getSettings();

    chrome.runtime.sendMessage(
      {
        source: "popup",
        type: "setAlwaysListening",
        value: on,
        wakeWord: settings.wakeWord || "hey nova"
      },
      () => {}
    );
  });

  btnRecord.addEventListener("click", async () => {
    const settings = await SarathiStorage.getSettings();
    setStatus("Listening");
    chrome.runtime.sendMessage(
      {
        source: "popup",
        type: "manualRecognize",
        wakeWord: settings.wakeWord || "hey nova"
      },
      () => {}
    );
  });

  // Execute typed command
  btnExecute.addEventListener("click", async () => {
    const command = textCommandInput.value.trim();
    if (!command) {
      console.warn("Sarathi AI: No command entered");
      return;
    }

    console.log("Sarathi AI: Executing typed command:", command);
    setStatus("Activated");
    
    // Update last transcript display
    if (lastTranscriptEl) {
      lastTranscriptEl.textContent = command;
    }

    // Send typed command to background (same as voice transcript)
    chrome.runtime.sendMessage(
      {
        source: "popup",
        type: "typedCommand",
        transcript: command
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("Sarathi AI: Error sending typed command:", chrome.runtime.lastError);
        } else {
          console.log("Sarathi AI: Typed command sent successfully");
          // Clear input after sending
          textCommandInput.value = "";
        }
      }
    );
  });

  // Allow Enter key to execute (Ctrl+Enter or Shift+Enter for newline)
  textCommandInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      btnExecute.click();
    }
  });

  // Stop button handler
  if (btnStop) {
    btnStop.addEventListener("click", () => {
      console.log("Sarathi AI: Stop button clicked");
      setStatus("Idle");
      chrome.runtime.sendMessage(
        {
          source: "popup",
          type: "stopExecution"
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error("Sarathi AI: Error sending stop message:", chrome.runtime.lastError);
          } else {
            console.log("Sarathi AI: Stop message sent successfully");
          }
        }
      );
    });
  }

  btnGrantPermission.addEventListener("click", async () => {
    // For MV3 + SpeechRecognition in content script, simply triggering manualRecognize
    // is enough to cause Chrome to prompt for mic permission in the active tab.
    const settings = await SarathiStorage.getSettings();
    setStatus("Listening");
    chrome.runtime.sendMessage(
      {
        source: "popup",
        type: "manualRecognize",
        wakeWord: settings.wakeWord || "hey nova"
      },
      () => {}
    );
  });

  if (languageSelect) {
    languageSelect.addEventListener("change", async (e) => {
      const newLang = e.target.value;
      const settings = await SarathiStorage.getSettings();
      settings.language = newLang;
      await SarathiStorage.saveSettings(settings);
    });
  }

  btnSettings.addEventListener("click", () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open("options.html");
    }
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || typeof message !== "object") return;
    if (message.type === "statusUpdate") {
      setStatus(message.status || "Idle");
      if (message.status === "MIC_BLOCKED" || message.status === "Permission Required") {
        setMicWarning(true);
      }
    }
    if (message.type === "transcriptUpdate") {
      lastTranscriptEl.textContent = message.transcript || "";
      console.log("Sarathi AI last transcript:", message.transcript);
    }
    if (message.type === "actionUpdate") {
      lastActionEl.textContent = message.action || "";
    }
    if (message.type === "stepUpdate") {
      const stepText = message.stepText || "";
      const stepStatus = message.stepStatus || "executing"; // executing, success, failed
      if (stepText) {
        addStep(stepText, stepStatus);
      }
    }
    if (message.type === "clearSteps") {
      executedSteps = [];
      updateStepsList();
    }
    if (message.type === "llmUpdate" && lastLlmEl) {
      lastLlmEl.textContent = message.payload || "";
    }
    if (message.type === "speakText") {
      const text = message.text || "";
      const success = message.success || false;
      
      if (!success && text) {
        console.log("Sarathi AI: Speech failed in content script, text to speak:", text);
        // Try to speak from popup context (has user gesture)
        if (window.speechSynthesis && text) {
          try {
            console.log("Sarathi AI: Attempting speech from popup context...");
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.onstart = () => {
              console.log("Sarathi AI: ✓ Speech started from popup");
            };
            utterance.onend = () => {
              console.log("Sarathi AI: ✓ Speech completed from popup");
            };
            utterance.onerror = (e) => {
              console.error("Sarathi AI: ✗ Speech error from popup:", e.error);
              // Show text in last action field as fallback
              if (lastActionEl) {
                lastActionEl.textContent = "SPEECH FAILED - Text: " + text.substring(0, 100) + (text.length > 100 ? "..." : "");
              }
            };
            window.speechSynthesis.speak(utterance);
          } catch (e) {
            console.error("Sarathi AI: Failed to speak from popup:", e);
            // Show text in last action field as fallback
            if (lastActionEl) {
              lastActionEl.textContent = "SPEECH FAILED - Text: " + text.substring(0, 100) + (text.length > 100 ? "..." : "");
            }
          }
        } else {
          // Show text in last action field as fallback
          if (lastActionEl) {
            lastActionEl.textContent = "SPEECH UNAVAILABLE - Text: " + text.substring(0, 100) + (text.length > 100 ? "..." : "");
          }
        }
      }
    }
  });

  initState();
  
  // Initialize steps list
  if (stepsListEl) {
    updateStepsList();
  }
});


