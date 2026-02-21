/* global chrome, webkitSpeechRecognition */

let recognition = null;
let continuousMode = false;
let wakeWord = "hey nova";
let waitingForCommand = false;
let oneShotMode = false;

function getRecognition() {
  if (recognition) return recognition;
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Ctor) {
    console.warn("Sarathi AI: Web Speech API not available");
    return null;
  }
  recognition = new Ctor();
  recognition.lang = "en-IN";
  recognition.continuous = true;
  recognition.interimResults = false;

  recognition.onresult = (event) => {
    const last = event.results[event.results.length - 1];
    if (!last || !last[0]) return;
    const transcript = (last[0].transcript || "").toLowerCase().trim();

    if (!waitingForCommand) {
      if (transcript.includes("hey nova") ||
          (wakeWord && transcript.includes(wakeWord.toLowerCase()))) {
        waitingForCommand = true;
        chrome.runtime.sendMessage({
          source: "offscreen",
          type: "wakeWordDetected"
        }).catch(() => {});
      }
      return;
    }

    // Next phrase after wake word is treated as command
    waitingForCommand = false;
    chrome.runtime.sendMessage({
      source: "offscreen",
      type: "transcript",
      transcript
    }).catch(() => {});

    if (oneShotMode) {
      stopRecognition();
      oneShotMode = false;
    }
  };

  recognition.onerror = (event) => {
    const err = event && event.error;
    console.warn("Sarathi AI recognition error", err);

    if (err === "not-allowed" || err === "service-not-allowed") {
      // Microphone permission is blocked or cannot be requested from offscreen.
      continuousMode = false;
      oneShotMode = false;
      waitingForCommand = false;
      stopRecognition();
      chrome.runtime
        .sendMessage({
          source: "offscreen",
          type: "speechError",
          error: err,
          status: "MIC_BLOCKED"
        })
        .catch(() => {});
      return;
    }

    if (continuousMode) {
      // Attempt restart for transient errors
      try {
        recognition.stop();
        recognition.start();
      } catch (e) {
        console.warn("Sarathi AI: restart failed", e);
      }
    }
  };

  recognition.onstart = () => {
    // Recognition started successfully - mic permission is granted
    console.log("Sarathi AI: recognition started successfully");
    chrome.runtime.sendMessage({
      source: "offscreen",
      type: "speechStarted"
    }).catch(() => {});
  };

  recognition.onend = () => {
    if (continuousMode) {
      try {
        recognition.start();
      } catch (e) {
        console.warn("Sarathi AI: auto-restart failed", e);
      }
    }
  };

  return recognition;
}

function startContinuous(newWakeWord) {
  wakeWord = newWakeWord || wakeWord;
  const rec = getRecognition();
  if (!rec) return;
  continuousMode = true;
  waitingForCommand = false;
  try {
    rec.start();
  } catch (e) {
    console.warn("Sarathi AI: continuous start error", e);
  }
}

function stopContinuous() {
  continuousMode = false;
  stopRecognition();
}

function startOneShot(newWakeWord) {
  wakeWord = newWakeWord || wakeWord;
  oneShotMode = true;
  waitingForCommand = true; // directly capture next phrase as command
  const rec = getRecognition();
  if (!rec) return;
  rec.continuous = false;
  try {
    rec.start();
  } catch (e) {
    console.warn("Sarathi AI: one-shot start error", e);
  }
}

function stopRecognition() {
  if (!recognition) return;
  try {
    recognition.stop();
  } catch (e) {
    // ignore
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") return;
  if (message.target !== "offscreen") return;

  if (message.type === "startContinuous") {
    startContinuous(message.wakeWord || "hey sarathi");
    sendResponse({ ok: true });
    return true;
  }
  if (message.type === "stopContinuous") {
    stopContinuous();
    sendResponse({ ok: true });
    return true;
  }
  if (message.type === "oneShot") {
    startOneShot(message.wakeWord || "hey sarathi");
    sendResponse({ ok: true });
    return true;
  }
});


