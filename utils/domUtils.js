/* global Node, HTMLElement */

(function () {
  const MAX_ELEMENTS = 200;
  const SARATHI_ID_ATTR = "sarathi-id";

  function isElementVisible(el) {
    if (!(el instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none" || style.opacity === "0") {
      return false;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    if (
      rect.bottom < 0 ||
      rect.right < 0 ||
      rect.top > (window.innerHeight || document.documentElement.clientHeight) ||
      rect.left > (window.innerWidth || document.documentElement.clientWidth)
    ) {
      return false;
    }
    return true;
  }

  function isInteractive(el) {
    if (!(el instanceof HTMLElement)) return false;

    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute("role");
    const tabindex = el.getAttribute("tabindex");

    if (["button", "a", "input", "textarea", "select"].includes(tag)) return true;
    if (role && ["button", "textbox", "link"].includes(role)) return true;
    if (tabindex !== null && parseInt(tabindex, 10) >= 0) return true;
    if (el.getAttribute("onclick")) return true;
    if (el.getAttribute("aria-label")) return true;

    return false;
  }

  function getCssPath(el) {
    if (!(el instanceof Element)) return "";
    const path = [];
    let current = el;
    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let selector = current.nodeName.toLowerCase();
      if (current.id) {
        selector += "#" + current.id;
        path.unshift(selector);
        break;
      } else {
        const className = (current.className || "").toString().trim().split(/\s+/)[0];
        if (className) {
          selector += "." + className;
        }
      }
      const parent = current.parentNode;
      if (!parent) break;
      const siblings = Array.from(parent.children).filter(
        (child) => child.nodeName === current.nodeName
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-of-type(${index})`;
      }
      path.unshift(selector);
      current = parent;
    }
    return path.join(" > ");
  }

  function getXPath(el) {
    if (!(el instanceof Element)) return "";
    const segments = [];
    let current = el;
    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let index = 1;
      let sibling = current.previousSibling;
      while (sibling) {
        if (sibling.nodeType === Node.ELEMENT_NODE && sibling.nodeName === current.nodeName) {
          index++;
        }
        sibling = sibling.previousSibling;
      }
      const tagName = current.nodeName.toLowerCase();
      const segment = `${tagName}[${index}]`;
      segments.unshift(segment);
      current = current.parentNode;
    }
    return "//" + segments.join("/");
  }

  /**
   * Generate a random 10-digit string
   * @returns {string} 10-digit random string
   */
  function generateRandomId() {
    // Generate 10 random digits (0-9)
    let randomId = "";
    for (let i = 0; i < 10; i++) {
      randomId += Math.floor(Math.random() * 10).toString();
    }
    return randomId;
  }

  /**
   * Ensure element has a unique sarathi-id attribute
   * Uses a 10-digit random string to avoid duplicates
   */
  function ensureSarathiId(el) {
    if (!el.hasAttribute(SARATHI_ID_ATTR)) {
      // Generate a unique 10-digit random ID
      let uid;
      let attempts = 0;
      const maxAttempts = 10;
      
      // Ensure uniqueness by checking if ID already exists
      do {
        uid = "uid-" + generateRandomId();
        attempts++;
        // If we've tried too many times, add timestamp to ensure uniqueness
        if (attempts >= maxAttempts) {
          uid = "uid-" + generateRandomId() + "-" + Date.now().toString().slice(-6);
          break;
        }
      } while (document.querySelector(`[${SARATHI_ID_ATTR}="${uid}"]`) !== null);
      
      el.setAttribute(SARATHI_ID_ATTR, uid);
    }
    return el.getAttribute(SARATHI_ID_ATTR);
  }

  function buildElementData(el, sarathiId) {
    const rect = el.getBoundingClientRect();
    const text = (el.innerText || el.textContent || "").trim().replace(/\s+/g, " ");
    const trimmedText = text.length > 120 ? text.slice(0, 117) + "..." : text;
    const tag = el.tagName.toLowerCase();
    const type = el.getAttribute("type") || "";
    const role = el.getAttribute("role") || "";

    const isInput =
      ["input", "textarea", "select"].includes(tag) ||
      (role && role.toLowerCase() === "textbox");

    const isClickable =
      ["button", "a"].includes(tag) ||
      type === "button" ||
      type === "submit" ||
      role.toLowerCase() === "button" ||
      !!el.onclick ||
      el.getAttribute("tabindex") !== null;

    return {
      sarathiId,
      tagName: tag,
      type,
      role,
      textContent: trimmedText,
      placeholder: el.getAttribute("placeholder") || "",
      ariaLabel: el.getAttribute("aria-label") || "",
      name: el.getAttribute("name") || "",
      id: el.id || "",
      className: (el.className || "").toString().trim(),
      href: el.getAttribute("href") || "",
      value: isInput ? el.value || "" : "",
      boundingRect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
      },
      isClickable,
      isInput
    };
  }

  function traverseRoot(root, elements) {
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_ELEMENT,
      {
        acceptNode(node) {
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let node = walker.currentNode;
    while (node && elements.length < MAX_ELEMENTS) {
      if (node instanceof HTMLElement) {
        if (isElementVisible(node)) {
          // Inject sarathi-id on all visible elements
          const sarathiId = ensureSarathiId(node);

          // Only include meaningful/interactive elements in snapshot
          if (isInteractive(node)) {
            const elementData = buildElementData(node, sarathiId);
            elements.push(elementData);
          }
        }

        if (node.shadowRoot) {
          traverseRoot(node.shadowRoot, elements);
        }

        if (node.tagName.toLowerCase() === "iframe") {
          try {
            const doc = node.contentDocument;
            if (doc) {
              traverseRoot(doc, elements);
            }
          } catch (e) {
            // Cross-origin iframe; ignore gracefully.
          }
        }
      }

      node = walker.nextNode();
    }
  }

  function getDomSnapshot() {
    const elements = [];

    traverseRoot(document, elements);

    return {
      url: window.location.href,
      currentUrl: window.location.href, // Keep both for compatibility
      pageTitle: document.title,
      title: document.title, // Keep both for compatibility
      elements
    };
  }

  // Expose globally for contentScript
  window.SarathiDomUtils = {
    getDomSnapshot
  };
})();


