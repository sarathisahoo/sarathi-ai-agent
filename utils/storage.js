/* global chrome */

// Simple wrapper around chrome.storage.sync for Sarathi AI settings.

const DEFAULT_SETTINGS = {
  provider: "openai", // openai | gemini | deepseek | custom
  apiKey: "",
  model: "gpt-4.1-mini",
  baseUrl: "",
  customHeaders: "",
  wakeWord: "hey nova",
  language: "en-IN",
  requireConfirmation: true,
  // Whether microphone has been successfully primed via getUserMedia({ audio: true })
  micGranted: false
};

const SETTINGS_KEY = "sarathi_settings_v1";

const SarathiStorage = {
  async getSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get([SETTINGS_KEY], (result) => {
        const stored = result[SETTINGS_KEY] || {};
        resolve(Object.assign({}, DEFAULT_SETTINGS, stored));
      });
    });
  },

  async saveSettings(settings) {
    return new Promise((resolve) => {
      chrome.storage.sync.set(
        {
          [SETTINGS_KEY]: settings
        },
        () => resolve(true)
      );
    });
  }
};

// Expose globally (for background/options/popup using importScripts or inline scripts)
if (typeof window !== "undefined") {
  window.SarathiStorage = SarathiStorage;
}


