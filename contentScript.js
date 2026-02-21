/*
 Sarathi AI
 Copyright (c) 2026 Sarathi Sabyasachi Sahoo
 MIT License
*/

/* global chrome, SarathiDomUtils */

(function () {
  let lastSnapshot = null;

  /**
   * Remove target="_blank" from all links so they open in the same tab
   * This function removes target="_blank" from existing links and watches for new links
   */
  function removeTargetBlankFromLinks() {
    try {
      // Remove target="_blank" from all existing links
      const allLinks = document.querySelectorAll('a[target="_blank"]');
      let removedCount = 0;
      allLinks.forEach((link) => {
        link.removeAttribute("target");
        removedCount++;
      });
      if (removedCount > 0) {
        console.log(`Sarathi AI: Removed target="_blank" from ${removedCount} link(s)`);
      }

      // Watch for dynamically added links using MutationObserver
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1) { // Element node
              // Check if the added node itself is a link
              if (node.tagName === "A" && node.getAttribute("target") === "_blank") {
                node.removeAttribute("target");
                console.log("Sarathi AI: Removed target=\"_blank\" from dynamically added link");
              }
              // Check for links inside the added node
              const linksInNode = node.querySelectorAll && node.querySelectorAll('a[target="_blank"]');
              if (linksInNode && linksInNode.length > 0) {
                linksInNode.forEach((link) => {
                  link.removeAttribute("target");
                  console.log("Sarathi AI: Removed target=\"_blank\" from dynamically added link");
                });
              }
            }
          });
        });
      });

      // Start observing the document for changes
      observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true
      });

      console.log("Sarathi AI: Link target removal observer started");
    } catch (e) {
      console.warn("Sarathi AI: Error removing target=\"_blank\" from links", e);
    }
  }

  // Initialize link target removal when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", removeTargetBlankFromLinks);
  } else {
    // DOM is already loaded
    removeTargetBlankFromLinks();
  }

  /**
   * Check if element is visible based on computed style and bounding rect
   * An element is visible if:
   * - rect.width > 0 && rect.height > 0
   * - computedStyle.visibility !== "hidden"
   * - computedStyle.display !== "none"
   * - rect.bottom >= 0 && rect.right >= 0
   */
  function isElementVisible(el) {
    if (!(el instanceof HTMLElement)) return false;
    
    try {
      const style = window.getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none") {
        return false;
      }
      
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return false;
      }
      
      // Element must have bottom >= 0 and right >= 0 (starts within viewport)
      if (rect.bottom < 0 || rect.right < 0) {
        return false;
      }
      
      return true;
    } catch (e) {
      console.warn("Sarathi AI: Error checking visibility for element", e);
      return false;
    }
  }

  /**
   * Build element data object from DOM element
   */
  function buildElementData(el, sarathiId) {
    try {
      const rect = el.getBoundingClientRect();
      const text = (el.innerText || el.textContent || "").trim().replace(/\s+/g, " ");
      const trimmedText = text.length > 120 ? text.slice(0, 117) + "..." : text;
      
      return {
        sarathiId: sarathiId || el.getAttribute("sarathi-id") || "",
        tagName: el.tagName.toLowerCase(),
        type: el.getAttribute("type") || "",
        role: el.getAttribute("role") || "",
        textContent: trimmedText,
        ariaLabel: el.getAttribute("aria-label") || "",
        placeholder: el.getAttribute("placeholder") || "",
        href: el.getAttribute("href") || "",
        id: el.id || "",
        className: (el.className || "").toString().trim(),
        boundingRect: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height
        }
      };
    } catch (e) {
      console.warn("Sarathi AI: Error building element data", e);
      return null;
    }
  }

  /**
   * Get DOM snapshot based on sarathi-id attributes
   * This ensures we collect all elements that have sarathi-id injected
   */
  function getDomSnapshotBySarathiId() {
    const elements = [];
    
    try {
      // First, ensure sarathi-id is injected on all visible elements
      // Use the existing domUtils to inject IDs
      const tempSnapshot = SarathiDomUtils.getDomSnapshot();
      console.log("Sarathi AI: Initial injection snapshot elements:", tempSnapshot?.elements?.length || 0);
      
      // Now query all elements with sarathi-id
      const allSarathiNodes = document.querySelectorAll("[sarathi-id]");
      console.log("Sarathi AI: Total sarathi-id nodes found:", allSarathiNodes.length);
      
      // Filter by visibility and build element data
      for (let i = 0; i < allSarathiNodes.length; i++) {
        try {
          const node = allSarathiNodes[i];
          if (isElementVisible(node)) {
            const sarathiId = node.getAttribute("sarathi-id");
            const elementData = buildElementData(node, sarathiId);
            if (elementData) {
              elements.push(elementData);
            }
          }
        } catch (e) {
          console.warn("Sarathi AI: Error processing element", i, e);
          // Continue with next element
        }
      }
      
      console.log("Sarathi AI: Visible nodes count:", elements.length);
      console.log("Sarathi AI: Final elements length returned:", elements.length);
      
      return {
        url: window.location.href,
        currentUrl: window.location.href,
        pageTitle: document.title,
        title: document.title,
        elements: elements
      };
    } catch (e) {
      console.error("Sarathi AI: Error in getDomSnapshotBySarathiId", e);
      // Return empty snapshot on error, but always return an object
      return {
        url: window.location.href,
        currentUrl: window.location.href,
        pageTitle: document.title,
        title: document.title,
        elements: []
      };
    }
  }

  function refreshSnapshot() {
    try {
      // Use new sarathi-id based snapshot
      lastSnapshot = getDomSnapshotBySarathiId();
      console.log("Sarathi AI: Snapshot refreshed, elements:", lastSnapshot?.elements?.length || 0);
    } catch (e) {
      console.error("Sarathi AI content script: snapshot failed", e);
      // Always return an object, even on error
      lastSnapshot = {
        url: window.location.href,
        currentUrl: window.location.href,
        pageTitle: document.title,
        title: document.title,
        elements: []
      };
    }
    return lastSnapshot;
  }

  /**
   * Find element by sarathi-id with comprehensive fallback logic
   * Includes retry logic for dynamic DOM changes
   */
  function findElementBySarathiId(sarathiId, retryCount = 0) {
    if (!sarathiId) return null;
    
    // First try direct attribute lookup (fastest)
    let el = document.querySelector('[sarathi-id="' + sarathiId + '"]');
    if (el && el.isConnected) {
      // Verify element is still in the DOM
      console.log("Sarathi AI: found element by sarathi-id attribute", sarathiId, el.tagName);
      return el;
    }
    
    // If not found and we haven't retried, refresh snapshot and retry
    if (retryCount === 0) {
      console.log("Sarathi AI: Element not found on first try, refreshing snapshot and retrying...", sarathiId);
      // Refresh snapshot to ensure sarathi-ids are injected
      const snapshot = refreshSnapshot();
      if (snapshot && snapshot.elements) {
        const meta = snapshot.elements.find((e) => e.sarathiId === sarathiId || e.elementId === sarathiId);
        if (meta) {
          // Try to find by sarathi-id again (might have been injected during snapshot)
          el = document.querySelector('[sarathi-id="' + sarathiId + '"]');
          if (el && el.isConnected) {
            console.log("Sarathi AI: found element after snapshot refresh", sarathiId);
            return el;
          }
          
          // Fallback: try CSS selector or ID
          if (meta.cssSelector) {
            try {
              el = document.querySelector(meta.cssSelector);
              if (el && el.isConnected) {
                console.log("Sarathi AI: found element by CSS selector", sarathiId);
                return el;
              }
            } catch (e) {
              // ignore selector errors
            }
          }
          if (meta.id && !el) {
            el = document.getElementById(meta.id);
            if (el && el.isConnected) {
              console.log("Sarathi AI: found element by ID", sarathiId);
              return el;
            }
          }
        }
      }
      
      // Retry once more after a short delay (DOM might be updating)
      return findElementBySarathiId(sarathiId, 1);
    }
    
    // Debug: log all available sarathi-ids
    const allSarathi = document.querySelectorAll("[sarathi-id]");
    console.warn("Sarathi AI: element not found for sarathiId", sarathiId, "after", retryCount + 1, "attempts");
    console.log("Sarathi AI: Total sarathi-id elements on page:", allSarathi.length);
    console.log("Sarathi AI: Sample available sarathi-ids:", 
      Array.from(allSarathi).slice(0, 30).map(el => ({
        id: el.getAttribute("sarathi-id"),
        tag: el.tagName,
        text: (el.textContent || el.value || "").substring(0, 30),
        connected: el.isConnected
      }))
    );
    
    return null;
  }

  /**
   * Check if element is actually clickable
   */
  function isElementClickable(el) {
    if (!el) return false;
    
    // Check if element is disabled
    if (el.disabled === true) {
      console.warn("Sarathi AI: Element is disabled", el);
      return false;
    }
    
    // Check if element is visible
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      console.warn("Sarathi AI: Element is not visible", el);
      return false;
    }
    
    // Check if element has pointer-events disabled
    if (style.pointerEvents === "none") {
      console.warn("Sarathi AI: Element has pointer-events: none", el);
      return false;
    }
    
    return true;
  }

  /**
   * Perform click action on element (async with delays and multiple strategies)
   */
  async function performClick(el, sarathiId) {
    if (!el) {
      console.error("Sarathi AI: performClick called with null element");
      return false;
    }
    
    console.log("Sarathi AI: Attempting to click element", sarathiId, el.tagName, el.textContent?.substring(0, 50));
    
    // Check if element is clickable
    if (!isElementClickable(el)) {
      console.error("Sarathi AI: Element is not clickable", sarathiId);
      return false;
    }
    
    try {
      // Scroll element into view - use instant scroll for reliability
      const rect = el.getBoundingClientRect();
      const isInViewport = (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
      );
      
      if (!isInViewport) {
        console.log("Sarathi AI: Element not in viewport, scrolling...");
        el.scrollIntoView({ behavior: "instant", block: "center", inline: "center" });
        // Wait for scroll to complete
        await new Promise((res) => setTimeout(res, 300));
      } else {
        // Even if in viewport, ensure it's centered
        el.scrollIntoView({ behavior: "instant", block: "center", inline: "center" });
        await new Promise((res) => setTimeout(res, 100));
      }
      
      // Verify element is still in viewport after scroll
      const rectAfter = el.getBoundingClientRect();
      if (rectAfter.width === 0 || rectAfter.height === 0) {
        console.error("Sarathi AI: Element has zero dimensions after scroll", sarathiId);
        return false;
      }
      
      // Calculate center coordinates for hover simulation
      const centerX = rectAfter.left + rectAfter.width / 2;
      const centerY = rectAfter.top + rectAfter.height / 2;
      
      // Hover-before-click: Simulate mouse hover to reveal hover-dependent elements
      console.log("Sarathi AI: Hovering before click");
      try {
        // Dispatch mouseover event (bubbles up the DOM tree)
        el.dispatchEvent(new MouseEvent("mouseover", {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: centerX,
          clientY: centerY,
          relatedTarget: null
        }));
        
        // Dispatch mouseenter event (does not bubble, but more specific)
        el.dispatchEvent(new MouseEvent("mouseenter", {
          bubbles: false,
          cancelable: true,
          view: window,
          clientX: centerX,
          clientY: centerY,
          relatedTarget: null
        }));
        
        // Dispatch mousemove event (simulates mouse movement)
        el.dispatchEvent(new MouseEvent("mousemove", {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: centerX,
          clientY: centerY,
          relatedTarget: null
        }));
        
        console.log("Sarathi AI: Hover complete");
      } catch (e) {
        // If hover simulation fails, log but don't block click
        console.warn("Sarathi AI: Hover simulation failed, continuing with click", e);
      }
      
      // Wait 150ms after hover to allow hover-dependent elements to appear
      await new Promise((res) => setTimeout(res, 150));
      
      // Now attempt click after hover
      console.log("Sarathi AI: Executing click");
      let clickSuccess = false;
      
      // Strategy 1: Direct click() method
      try {
        el.click();
        clickSuccess = true;
        console.log("Sarathi AI: Direct click() executed successfully");
      } catch (e) {
        console.warn("Sarathi AI: Direct click() failed, trying fallback", e);
        // Fallback: Dispatch click event manually
        try {
          console.log("Sarathi AI: Click fallback triggered");
          el.dispatchEvent(new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: centerX,
            clientY: centerY,
            button: 0
          }));
          clickSuccess = true;
          console.log("Sarathi AI: Click fallback executed successfully");
        } catch (e2) {
          console.error("Sarathi AI: Click fallback also failed", e2);
        }
      }
      
      // Strategy 2: If direct click still failed, try full mouse event sequence
      if (!clickSuccess) {
        try {
          // Focus the element first if it's focusable
          if (el.focus && typeof el.focus === "function") {
            el.focus();
            await new Promise((res) => setTimeout(res, 50));
          }
          
          // Create and dispatch full mouse event sequence
          const mouseDown = new MouseEvent("mousedown", {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: centerX,
            clientY: centerY,
            button: 0
          });
          const mouseUp = new MouseEvent("mouseup", {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: centerX,
            clientY: centerY,
            button: 0
          });
          const clickEvent = new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: centerX,
            clientY: centerY,
            button: 0
          });
          
          el.dispatchEvent(mouseDown);
          await new Promise((res) => setTimeout(res, 10));
          el.dispatchEvent(mouseUp);
          await new Promise((res) => setTimeout(res, 10));
          el.dispatchEvent(clickEvent);
          clickSuccess = true;
          console.log("Sarathi AI: Full mouse event sequence dispatched");
        } catch (e) {
          console.error("Sarathi AI: Full mouse event sequence failed", e);
        }
      }
      
      if (!clickSuccess) {
        console.error("Sarathi AI: All click strategies failed for", sarathiId);
        return false;
      }
      
      console.log("Sarathi AI: Click action completed successfully on", sarathiId);
      
      // If clicking might cause navigation (like search button), wait a bit for page to load
      await new Promise((res) => setTimeout(res, 500));
      
      return true;
    } catch (e) {
      console.error("Sarathi AI: Error during click execution", e, sarathiId);
      return false;
    }
  }

  /**
   * Find a typable element (input, textarea, or contenteditable) within an element or its children
   */
  function findTypableElement(el) {
    if (!el) return null;
    
    // Check if the element itself is typable
    const isContentEditable = el.isContentEditable || (el.getAttribute("contenteditable") || "").toLowerCase() === "true";
    const isInput = "value" in el && (el.tagName.toUpperCase() === "INPUT" || el.tagName.toUpperCase() === "TEXTAREA");
    
    if (isInput || isContentEditable) {
      return el;
    }
    
    // Search through all children recursively
    console.log("Sarathi AI: Element is not typable, searching through children...");
    
    // First, try to find any input or textarea (including hidden ones)
    // Hidden textareas are often used by rich text editors as the source of truth
    const allInputs = el.querySelectorAll("input[type='text'], input[type='search'], input[type='email'], input[type='url'], input[type='tel'], input:not([type]), textarea");
    
    // Prioritize visible inputs first, then hidden ones
    let visibleInput = null;
    let hiddenInput = null;
    
    for (const input of allInputs) {
      const style = window.getComputedStyle(input);
      const isHidden = style.display === "none" || style.visibility === "hidden" || input.hasAttribute("hidden");
      
      if (!isHidden && !visibleInput) {
        visibleInput = input;
      } else if (isHidden && !hiddenInput) {
        hiddenInput = input;
      }
    }
    
    // Prefer visible input, but use hidden if that's all we have
    const input = visibleInput || hiddenInput;
    if (input) {
      console.log("Sarathi AI: Found input/textarea in children:", input.tagName, input.type || "textarea", input === hiddenInput ? "(hidden)" : "(visible)");
      return input;
    }
    
    // Then, try to find contenteditable element
    const contentEditable = el.querySelector("[contenteditable='true'], [contenteditable='True'], [contenteditable='TRUE']");
    if (contentEditable) {
      console.log("Sarathi AI: Found contenteditable element in children");
      return contentEditable;
    }
    
    // Also check for elements with isContentEditable property
    const allElements = el.querySelectorAll("*");
    for (const child of allElements) {
      if (child.isContentEditable) {
        console.log("Sarathi AI: Found contenteditable element (via isContentEditable) in children");
        return child;
      }
    }
    
    console.warn("Sarathi AI: No typable element found in element or its children");
    return null;
  }

  /**
   * Perform type action on input element or contenteditable div (async with delays)
   */
  async function performType(el, value, sarathiId) {
    if (!el) return false;
    
    // Find typable element (either the element itself or a child)
    const typableEl = findTypableElement(el);
    if (!typableEl) {
      console.warn("Sarathi AI: No typable element found in element or its children", sarathiId, el.tagName);
      return false;
    }
    
    // If we found a different element, log it
    if (typableEl !== el) {
      console.log("Sarathi AI: Found typable child element, using it instead of parent", typableEl.tagName);
    }
    
    const isContentEditable = typableEl.isContentEditable || (typableEl.getAttribute("contenteditable") || "").toLowerCase() === "true";
    const isInput = "value" in typableEl && (typableEl.tagName.toUpperCase() === "INPUT" || typableEl.tagName.toUpperCase() === "TEXTAREA");
    
    if (!isInput && !isContentEditable) {
      console.warn("Sarathi AI: Found element is still not typable", sarathiId, typableEl.tagName);
      return false;
    }
    
    // Use the typable element for all operations
    el = typableEl;
    
    console.log("Sarathi AI: found element for type", sarathiId, el.tagName, isContentEditable ? "(contenteditable)" : "(input/textarea)");
    
    el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    await new Promise((res) => setTimeout(res, 50));
    
    if (isInput) {
      // Traditional input/textarea handling
      // Check if this is a hidden input/textarea (often used by rich text editors)
      const style = window.getComputedStyle(el);
      const isHidden = style.display === "none" || style.visibility === "hidden" || el.hasAttribute("hidden");
      
      if (isHidden) {
        console.log("Sarathi AI: Detected hidden input/textarea, updating value and trying to trigger editor update");
        
        // Update the hidden input/textarea value
        el.value = value || "";
        
        // Try to find editor instance that might be associated with this input
        // Many editors attach themselves to the input element or a parent wrapper
        let editorInstance = null;
        
        // Check if editor is attached to the element itself
        if (el.editor && typeof el.editor.setValue === 'function') {
          editorInstance = el.editor;
        } else if (el.getEditor && typeof el.getEditor === 'function') {
          editorInstance = el.getEditor();
        }
        
        // Check parent elements for editor instances
        if (!editorInstance) {
          let parent = el.parentElement;
          let depth = 0;
          while (parent && depth < 5) { // Limit search depth
            // Check common editor property names
            for (const prop of ['editor', 'Editor', 'instance', 'Instance', 'cm', 'editorInstance']) {
              if (parent[prop] && typeof parent[prop].setValue === 'function') {
                editorInstance = parent[prop];
                break;
              }
            }
            if (editorInstance) break;
            
            // Check for editor methods
            if (parent.getEditor && typeof parent.getEditor === 'function') {
              try {
                const editor = parent.getEditor();
                if (editor && typeof editor.setValue === 'function') {
                  editorInstance = editor;
                  break;
                }
              } catch (e) {
                // Ignore
              }
            }
            
            parent = parent.parentElement;
            depth++;
          }
        }
        
        // Check window for global editor registries
        if (!editorInstance) {
          // Try common global editor patterns
          const globalPatterns = ['editors', 'editorInstances', 'instances'];
          for (const pattern of globalPatterns) {
            if (window[pattern] && Array.isArray(window[pattern])) {
              for (const instance of window[pattern]) {
                if (instance && instance.getTextArea && instance.getTextArea() === el) {
                  if (typeof instance.setValue === 'function') {
                    editorInstance = instance;
                    break;
                  }
                }
              }
              if (editorInstance) break;
            }
          }
        }
        
        if (editorInstance && typeof editorInstance.setValue === 'function') {
          console.log("Sarathi AI: Found editor instance, using setValue API");
          editorInstance.setValue(value || "");
          // Trigger change event
          el.dispatchEvent(new Event("change", { bubbles: true }));
        } else {
          console.log("Sarathi AI: No editor API found, using direct value update and events");
          // Update value and trigger events
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          
          // Also try to trigger update by simulating user interaction
          try {
            // Try focusing (might work even if hidden)
            el.focus();
            await new Promise((res) => setTimeout(res, 50));
            // Trigger keyboard events to make editor update
            el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "a" }));
            el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "a" }));
            el.dispatchEvent(new Event("input", { bubbles: true }));
          } catch (e) {
            console.warn("Sarathi AI: Error triggering editor update", e);
          }
        }
      } else {
        // Regular visible input/textarea
        el.focus();
        await new Promise((res) => setTimeout(res, 50));
        el.value = "";
        el.value = value || "";
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
    } else if (isContentEditable) {
      // Contenteditable div handling - try multiple strategies for rich text editors like Lexical
      console.log("Sarathi AI: Typing into contenteditable element - trying multiple strategies");
      
      const textToType = value || "";
      
      // Strategy 0: Try to find and use editor API if available
      try {
        console.log("Sarathi AI: Trying to find editor API");
        
        // Check for data attributes that might indicate editor type
        const hasEditorDataAttr = el.dataset && Object.keys(el.dataset).some(key => 
          key.toLowerCase().includes('editor') || key.toLowerCase().includes('lexical')
        );
        
        if (hasEditorDataAttr) {
          // Try to find editor instance via common patterns
          let editorInstance = null;
          
          // Check element itself
          for (const prop of ['editor', 'Editor', 'instance', 'Instance']) {
            if (el[prop] && typeof el[prop].setValue === 'function') {
              editorInstance = el[prop];
              break;
            }
          }
          
          // Check parent elements
          if (!editorInstance) {
            let parent = el.parentElement;
            let depth = 0;
            while (parent && depth < 5) {
              for (const prop of ['editor', 'Editor', 'instance', 'Instance']) {
                if (parent[prop] && typeof parent[prop].setValue === 'function') {
                  editorInstance = parent[prop];
                  break;
                }
              }
              if (editorInstance) break;
              parent = parent.parentElement;
              depth++;
            }
          }
          
          // If editor API found, use it
          if (editorInstance && typeof editorInstance.setValue === 'function') {
            console.log("Sarathi AI: Found editor API, using setValue");
            editorInstance.setValue(textToType);
            el.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
            el.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
            await new Promise((res) => setTimeout(res, 200));
            console.log("Sarathi AI: Editor API strategy succeeded");
            await new Promise((res) => setTimeout(res, 150));
            console.log("Sarathi AI: type action completed successfully");
            return true;
          }
        }
        
        // Alternative: Directly manipulate DOM structure for editors that use specific patterns
        // Many editors use <p> tags with text nodes
        const paragraphs = el.querySelectorAll('p');
        if (paragraphs.length > 0) {
          console.log("Sarathi AI: Detected paragraph-based editor structure, manipulating directly");
          // Clear all paragraphs
          paragraphs.forEach(p => p.remove());
          
          // Create new paragraph with text
          const newP = document.createElement('p');
          newP.setAttribute('dir', 'auto');
          newP.textContent = textToType;
          el.appendChild(newP);
          
          // Set selection to end
          const selection = window.getSelection();
          const range = document.createRange();
          range.setStart(newP, newP.childNodes.length || 0);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
          
          // Dispatch events that editors listen to
          el.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
          el.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
          
          // Try beforeinput event
          const beforeInput = new InputEvent("beforeinput", {
            bubbles: true,
            cancelable: true,
            inputType: "insertText",
            data: textToType
          });
          el.dispatchEvent(beforeInput);
          
          await new Promise((res) => setTimeout(res, 200));
          
          // Check if text was inserted
          if (el.textContent && el.textContent.includes(textToType.substring(0, Math.min(10, textToType.length)))) {
            console.log("Sarathi AI: Direct DOM manipulation succeeded");
            await new Promise((res) => setTimeout(res, 150));
            console.log("Sarathi AI: type action completed successfully");
            return true;
          }
        }
      } catch (e) {
        console.warn("Sarathi AI: Editor API strategy failed", e);
      }
      
      // Strategy 1: Try paste event (works with many editors including Lexical)
      try {
        console.log("Sarathi AI: Trying paste event strategy");
        
        // Don't use selection API here to avoid focus - just manipulate DOM directly
        // Clear content first
        el.innerHTML = "";
        const tempP = document.createElement('p');
        tempP.setAttribute('dir', 'auto');
        const tempText = document.createTextNode("");
        tempP.appendChild(tempText);
        el.appendChild(tempP);
        
        // Create clipboard data for paste event
        const clipboardData = new DataTransfer();
        clipboardData.setData('text/plain', textToType);
        
        // Dispatch paste event ONLY once (on the element, it will bubble to children)
        // Don't dispatch on both paragraph and element to avoid duplicate insertion
        const pasteEvent = new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData: clipboardData
        });
        
        // Dispatch only on the element (not on paragraph to avoid double insertion)
        el.dispatchEvent(pasteEvent);
        
        // Also try input event
        el.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
        
        await new Promise((res) => setTimeout(res, 200));
        
        // Check if text was inserted and matches what we wanted (not duplicated)
        const insertedText = el.textContent || "";
        if (insertedText.trim().length > 0) {
          // Check if text was inserted correctly (not duplicated)
          const expectedText = textToType.trim();
          const actualText = insertedText.trim();
          
          // If text matches exactly or starts with expected text, success
          if (actualText === expectedText || actualText.startsWith(expectedText)) {
            console.log("Sarathi AI: Paste event strategy succeeded, text:", actualText.substring(0, 50));
            el.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
            await new Promise((res) => setTimeout(res, 150));
            console.log("Sarathi AI: type action completed successfully");
            return true;
          } else {
            console.warn("Sarathi AI: Paste event inserted unexpected text, expected:", expectedText, "got:", actualText);
            // Text was inserted but might be duplicated, continue to next strategy
          }
        }
      } catch (e) {
        console.warn("Sarathi AI: Paste event strategy failed", e);
      }
      
      // Strategy 2: Try execCommand without focusing (to avoid aria-hidden issues)
      try {
        console.log("Sarathi AI: Trying execCommand strategy without focus");
        
        // Check if text was already inserted correctly by previous strategy
        const currentText = el.textContent || "";
        if (currentText.trim() === textToType.trim()) {
          console.log("Sarathi AI: Text already inserted correctly, skipping execCommand");
          el.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
          await new Promise((res) => setTimeout(res, 150));
          console.log("Sarathi AI: type action completed successfully");
          return true;
        }
        
        // Set up selection without focusing
        const selection = window.getSelection();
        const range = document.createRange();
        
        // Find text node or create one
        let targetNode = null;
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
        targetNode = walker.nextNode();
        
        if (!targetNode) {
          targetNode = document.createTextNode("");
          el.appendChild(targetNode);
        }
        
        // Set selection
        range.setStart(targetNode, 0);
        range.setEnd(targetNode, 0);
        selection.removeAllRanges();
        selection.addRange(range);
        
        // Clear content only if it doesn't match what we want
        if (currentText.trim() !== textToType.trim()) {
          el.textContent = "";
          targetNode = document.createTextNode("");
          if (el.firstChild) {
            el.replaceChild(targetNode, el.firstChild);
          } else {
            el.appendChild(targetNode);
          }
          range.setStart(targetNode, 0);
          range.setEnd(targetNode, 0);
          selection.removeAllRanges();
          selection.addRange(range);
        }
        
        // Try execCommand
        if (document.execCommand && document.execCommand('insertText', false, textToType)) {
          await new Promise((res) => setTimeout(res, 100));
          // Verify text was inserted correctly (not duplicated)
          const newText = el.textContent || "";
          const expectedText = textToType.trim();
          if (newText.trim() === expectedText || newText.trim().startsWith(expectedText)) {
            console.log("Sarathi AI: execCommand strategy succeeded");
            el.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
            el.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
            await new Promise((res) => setTimeout(res, 150));
            console.log("Sarathi AI: type action completed successfully");
            return true;
          } else {
            console.warn("Sarathi AI: execCommand inserted unexpected text, expected:", expectedText, "got:", newText.trim());
          }
        }
      } catch (e) {
        console.warn("Sarathi AI: execCommand strategy failed", e);
      }
      
      // Strategy 3: Direct DOM manipulation (bypass focus requirement)
      try {
        console.log("Sarathi AI: Trying direct DOM manipulation strategy");
        
        // Check if text was already inserted correctly by previous strategy
        const currentText = el.textContent || "";
        if (currentText.trim() === textToType.trim()) {
          console.log("Sarathi AI: Text already inserted correctly, skipping direct DOM manipulation");
          el.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
          await new Promise((res) => setTimeout(res, 150));
          console.log("Sarathi AI: type action completed successfully");
          return true;
        }
        
        // Clear content only if it doesn't match what we want
        if (currentText.trim() !== textToType.trim()) {
          el.textContent = "";
          el.innerHTML = "";
        }
        
        // Create and insert text node directly
        const textNode = document.createTextNode(textToType);
        el.appendChild(textNode);
        
        // Set selection to end
        const selection = window.getSelection();
        const range = document.createRange();
        range.setStart(textNode, textNode.length);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        
        // Dispatch events
        el.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
        el.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
        
        // Also try beforeinput event (used by some modern editors)
        const beforeInputEvent = new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          inputType: "insertText",
          data: textToType
        });
        el.dispatchEvent(beforeInputEvent);
        
        // Verify text was inserted correctly
        await new Promise((res) => setTimeout(res, 100));
        const newText = el.textContent || "";
        if (newText.trim() === textToType.trim() || newText.trim().startsWith(textToType.trim())) {
          console.log("Sarathi AI: Direct DOM manipulation strategy completed");
          await new Promise((res) => setTimeout(res, 150));
          console.log("Sarathi AI: type action completed successfully");
          return true;
        }
      } catch (e) {
        console.warn("Sarathi AI: Direct DOM manipulation strategy failed", e);
      }
      
      // Strategy 4: Try with click but handle aria-hidden gracefully
      try {
        console.log("Sarathi AI: Trying click + execCommand strategy (with aria-hidden handling)");
        
        // Click without focusing (might work despite aria-hidden)
        const rect = el.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        el.dispatchEvent(new MouseEvent("mousedown", {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: centerX,
          clientY: centerY,
          button: 0
        }));
        
        await new Promise((res) => setTimeout(res, 50));
        
        // Set selection
        const selection = window.getSelection();
        const range = document.createRange();
        let targetNode = el.firstChild || el;
        if (targetNode.nodeType === Node.TEXT_NODE) {
          range.setStart(targetNode, 0);
          range.setEnd(targetNode, 0);
        } else {
          range.setStart(el, 0);
          range.setEnd(el, 0);
        }
        selection.removeAllRanges();
        selection.addRange(range);
        
        // Try execCommand
        if (document.execCommand && document.execCommand('insertText', false, textToType)) {
          console.log("Sarathi AI: Click + execCommand strategy succeeded");
          el.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
          el.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
          await new Promise((res) => setTimeout(res, 150));
          console.log("Sarathi AI: type action completed successfully");
          return true;
        }
      } catch (e) {
        console.warn("Sarathi AI: Click + execCommand strategy failed", e);
      }
      
      console.warn("Sarathi AI: All typing strategies failed for contenteditable element");
      return false;
    }
    
    // Small delay after typing to ensure DOM updates
    await new Promise((res) => setTimeout(res, 150));
    console.log("Sarathi AI: type action completed successfully");
    return true;
  }

  /**
   * Perform keypress action on a specific element (async to handle focus delay)
   */
  async function performKeypress(sarathiId, value) {
    const key = value || "Enter";
    let targetElement = null;
    
    // If sarathiId is provided, find and focus that element
    if (sarathiId) {
      targetElement = findElementBySarathiId(sarathiId);
      if (targetElement) {
        console.log("Sarathi AI: Found element for keypress", sarathiId, targetElement.tagName);
        targetElement.focus();
        // Small delay to ensure focus is set
        await new Promise((res) => setTimeout(res, 50));
        const evt = new KeyboardEvent("keydown", {
          key,
          code: key,
          bubbles: true
        });
        targetElement.dispatchEvent(evt);
      } else {
        console.warn("Sarathi AI: Element not found for keypress sarathiId", sarathiId);
        return false;
      }
    } else {
      // Fallback to active element if no sarathiId provided
      targetElement = document.activeElement || document.body;
      const evt = new KeyboardEvent("keydown", {
        key,
        code: key,
        bubbles: true
      });
      targetElement.dispatchEvent(evt);
    }
    
    console.log("Sarathi AI: keypress action completed successfully on", sarathiId || "active element");
    return true;
  }

  /**
   * Perform scroll action
   */
  function performScroll(direction) {
    const amount = window.innerHeight * 0.8;
    const dir = (direction || "down").toLowerCase() === "up" ? -1 : 1;
    window.scrollBy({ top: dir * amount, behavior: "smooth" });
    console.log("Sarathi AI: scroll action completed successfully");
    return true;
  }

  /**
   * Perform speak action using Web Speech API
   * Uses a workaround to handle Chrome's user gesture requirement
   */
  async function performSpeak(text) {
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      console.warn("Sarathi AI: No text provided for speak action");
      return false;
    }

    console.log("Sarathi AI: Starting text-to-speech:", text.substring(0, 100) + (text.length > 100 ? "..." : ""));

    return new Promise((resolve) => {
      // Check if SpeechSynthesis is available
      if (!window.speechSynthesis) {
        console.error("Sarathi AI: SpeechSynthesis API not available");
        resolve(false);
        return;
      }

      // Function to actually speak (called after voices are loaded and user gesture)
      const doSpeak = () => {
        // Cancel any ongoing speech
        try {
          window.speechSynthesis.cancel();
        } catch (e) {
          console.warn("Sarathi AI: Error canceling previous speech:", e);
        }

        // Create utterance
        const utterance = new SpeechSynthesisUtterance(text);
        
        // Set voice properties (try to use a natural-sounding voice)
        const voices = window.speechSynthesis.getVoices();
        // Prefer English voices, fallback to first available
        const preferredVoice = voices.find(v => 
          v.lang.startsWith("en") && (v.name.includes("Natural") || v.name.includes("Neural"))
        ) || voices.find(v => v.lang.startsWith("en")) || voices[0];
        
        if (preferredVoice) {
          utterance.voice = preferredVoice;
          utterance.lang = preferredVoice.lang || "en-US";
          console.log("Sarathi AI: Using voice:", preferredVoice.name, preferredVoice.lang);
        } else {
          utterance.lang = "en-US";
          console.log("Sarathi AI: Using default voice");
        }

        // Set speech properties
        utterance.rate = 1.0; // Normal speed
        utterance.pitch = 1.0; // Normal pitch
        utterance.volume = 1.0; // Full volume

        // Event handlers
        utterance.onstart = () => {
          console.log("Sarathi AI: ✓ Speech started successfully");
        };

        utterance.onend = () => {
          console.log("Sarathi AI: ✓ Speech completed successfully");
          resolve(true);
        };

        utterance.onerror = (event) => {
          console.error("Sarathi AI: ✗ Speech error:", event.error, event);
          
          // If "not-allowed" error, Chrome requires user gesture
          // Since we're in a content script triggered by user voice command,
          // we should have user gesture context, but Chrome may still block it
          if (event.error === "not-allowed") {
            console.error("Sarathi AI: Speech Synthesis blocked by browser (not-allowed error)");
            console.error("Sarathi AI: This usually means Chrome requires a direct user interaction.");
            console.error("Sarathi AI: The text that should have been spoken:", text.substring(0, 200));
            
            // Try to show the text in console as fallback
            console.log("Sarathi AI: ========== TEXT TO SPEAK (FALLBACK) ==========");
            console.log(text);
            console.log("Sarathi AI: ==============================================");
            
            // Try one more time after a brief delay (sometimes helps)
            setTimeout(() => {
              try {
                console.log("Sarathi AI: Retrying speech after delay...");
                const retryUtterance = new SpeechSynthesisUtterance(text);
                retryUtterance.onerror = (retryEvent) => {
                  console.error("Sarathi AI: Retry also failed:", retryEvent.error);
                  resolve(false);
                };
                retryUtterance.onend = () => {
                  console.log("Sarathi AI: ✓ Retry speech completed");
                  resolve(true);
                };
                window.speechSynthesis.speak(retryUtterance);
              } catch (retryError) {
                console.error("Sarathi AI: Retry exception:", retryError);
                resolve(false);
              }
            }, 100);
            
            return; // Don't resolve yet, wait for retry
          } else {
            resolve(false);
          }
        };

        // Start speaking
        try {
          window.speechSynthesis.speak(utterance);
          console.log("Sarathi AI: Speech queued, length:", text.length, "characters");
          
          // Set a timeout to resolve if speech doesn't start within 2 seconds
          const timeoutId = setTimeout(() => {
            if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
              console.log("Sarathi AI: Speech is pending/speaking, waiting for completion...");
            } else {
              console.warn("Sarathi AI: Speech did not start within 2 seconds, may have failed silently");
              // Don't resolve yet, let onerror or onend handle it
            }
          }, 2000);
          
          // Clear timeout when speech starts or ends
          const originalOnStart = utterance.onstart;
          utterance.onstart = () => {
            clearTimeout(timeoutId);
            if (originalOnStart) originalOnStart();
          };
          
          const originalOnEnd = utterance.onend;
          utterance.onend = () => {
            clearTimeout(timeoutId);
            if (originalOnEnd) originalOnEnd();
          };
          
        } catch (e) {
          console.error("Sarathi AI: Failed to start speech:", e);
          resolve(false);
        }
      };

      // Check if voices are loaded
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        // Voices already loaded
        doSpeak();
      } else {
        // Wait for voices to load
        console.log("Sarathi AI: Waiting for voices to load...");
        let voicesLoaded = false;
        const voicesHandler = () => {
          if (!voicesLoaded) {
            voicesLoaded = true;
            console.log("Sarathi AI: Voices loaded");
            window.speechSynthesis.onvoiceschanged = null; // Remove handler
            doSpeak();
          }
        };
        window.speechSynthesis.onvoiceschanged = voicesHandler;
        
        // Fallback: try after a short delay
        setTimeout(() => {
          if (!voicesLoaded && window.speechSynthesis.getVoices().length > 0) {
            voicesHandler();
          } else if (!voicesLoaded) {
            console.warn("Sarathi AI: Voices not loaded after timeout, proceeding with default");
            voicesLoaded = true;
            window.speechSynthesis.onvoiceschanged = null;
            doSpeak(); // Try anyway with default
          }
        }, 500);
      }
    });
  }

  // ----------------------------
  // Speech recognition in page
  // ----------------------------
  let recognition = null;
  let listeningMode = "none"; // "continuous" | "oneshot" | "none"
  let wakeWordEnabled = false;
  let wakeWordText = "hey nova";
  let currentLang = "en-IN";
  let waitingForCommand = false;
  let speechBuffer = "";
  let silenceTimerId = null;
  let lastSpeechTime = 0;
  const SILENCE_MS = 2000; // 2 seconds of silence to stop listening
  let oneShotTimeoutId = null;

  function isTopWindow() {
    try {
      return window === window.top;
    } catch (e) {
      return true;
    }
  }

  function getRecognition(lang) {
    if (!isTopWindow()) return null;
    if (recognition) return recognition;
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) {
      console.warn("Sarathi AI: Web Speech API not available in this page");
      return null;
    }
    recognition = new Ctor();
    recognition.lang = lang || "en-IN";
    recognition.continuous = true;
    recognition.interimResults = false;

    function getWakePatternsForLang(langCode) {
      // Base English / Hinglish patterns
      const base = [
        // Primary
        "hey nova",
        "hi nova",
        "hello nova",
        "ok nova",
        "okay nova",
      
        // Without greeting
        "nova",
        "no va",
        "noova",
        "novaah",
        "novaa",
      
        // Common speech misrecognitions
        "noah",
        "noa",
        "noba",
        "nava",
        "navah",
        "nova ji",
        "nova g",
        "novaji",
      
        // Dropped H
        "ey nova",
        "e nova",
      
        // Fast speech
        "heynova",
        "hinova",
        "hellonova",
        "oknova",
        "okaynova",
      
        // Indian accent variations
        "hey noba",
        "hey no ba",
        "hey nava",
        "hey noova",
      
        // Slight distortions
        "nova please",
        "nova play",
        "nova can you",
        "Anubha"
      ];

      switch ((langCode || "").toLowerCase()) {
        case "hi-in": // Hindi
          return base.concat([
            // Primary Hindi variations
            "हे नोवा",
            "हे नोवा जी",
            "हाय नोवा",
            "हे नोबा",
            "नोवा",
            // With honorifics
            "हे नोवा जी",
            "नोवा जी",
            "हे नोवा भाई",
            "नोवा भाई",
            "हे नोवा साहब",
            // Common pronunciations
            "हे नोवाह",
            "हे नोवा ह",
            "हाय नोवा जी",
            "हे नोवा जी सुनो",
            // Without greeting
            "नोवा जी",
            "नोवा सुनो",
            "नोवा सुनिए",
            // Fast speech / merged
            "हेनोवा",
            "हायनोवा",
            "नोवाजी",
            // Alternative spellings
            "हे नोवा",
            "हे नोव्हा",
            "हे नोवा",
            "नोव्हा",
            // With please/request
            "हे नोवा कृपया",
            "नोवा कृपया",
            "हे नोवा जी कृपया",
            // Common misrecognitions
            "हे नोवा",
            "हे नोवा",
            "नोवा",
            "इनोवा",
            "नोवा जी"
          ]);
        case "te-in": // Telugu
          return base.concat([
            "నోవా",
            "హే నోవా",
            "హే నోవా జీ"
          ]);
        case "ta-in": // Tamil
          return base.concat([
            "நோவா",
            "ஹே நோவா",
            "ஹே நோவா ஜி"
          ]);
        case "kn-in": // Kannada
          return base.concat([
            "ನೋವಾ",
            "ಹೇ ನೋವಾ"
          ]);
        case "ml-in": // Malayalam
          return base.concat([
            "നോവാ",
            "ഹേ നോവാ"
          ]);
        case "mr-in": // Marathi
          return base.concat([
            "हे नोव्हा",
            "नोव्हा"
          ]);
        case "bn-in": // Bengali
          return base.concat([
            "হে নোভা",
            "নোভা"
          ]);
        case "or-in": // Odia
          return base.concat([
            "ହେ ନୋଭା",
            "ନୋଭା"
          ]);
        case "gu-in": // Gujarati
          return base.concat([
            "હે નોવા",
            "નોવા"
          ]);
        case "pa-in": // Punjabi (Gurmukhi)
          return base.concat([
            "ਹੇ ਨੋਵਾ",
            "ਨੋਵਾ"
          ]);
        case "ur-in": // Urdu
          return base.concat([
            "ہے نووا",
            "نووا"
          ]);
        default:
          return base;
      }
    }

    function extractCommandAfterWake(transcript) {
      const lower = transcript.toLowerCase();
      const patterns = getWakePatternsForLang(currentLang);
      for (const pattern of patterns) {
        const p = pattern.toLowerCase();
        const idx = lower.indexOf(p);
        if (idx !== -1) {
          return transcript.slice(idx + pattern.length).trim();
        }
      }
      return null;
    }

    recognition.onresult = (event) => {
      console.log("Sarathi AI: ========== SPEECH RECOGNITION RESULT ==========");
      console.log("Sarathi AI: Event results length:", event.results.length);
      console.log("Sarathi AI: Result index:", event.resultIndex);
      console.log("Sarathi AI: Waiting for command:", waitingForCommand);
      console.log("Sarathi AI: Current speech buffer:", speechBuffer);
      console.log("Sarathi AI: Listening mode:", listeningMode);
      
      // Log all results for debugging
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result && result[0]) {
          console.log(`Sarathi AI: Result [${i}]:`, {
            transcript: result[0].transcript,
            confidence: result[0].confidence,
            isFinal: result.isFinal
          });
        }
      }
      
      const last = event.results[event.results.length - 1];
      if (!last || !last[0]) {
        console.warn("Sarathi AI: No valid result in last item, results:", event.results);
        return;
      }
      
      const raw = last[0].transcript || "";
      const transcript = raw.trim();
      console.log("Sarathi AI: Raw transcript (before trim):", JSON.stringify(raw));
      console.log("Sarathi AI: Processed transcript (after trim):", JSON.stringify(transcript));
      console.log("Sarathi AI: Transcript length:", transcript.length);
      
      if (!transcript) {
        console.warn("Sarathi AI: Transcript is empty after trim, raw was:", JSON.stringify(raw));
        return;
      }

      // Wake word handling: Only required for always listening mode, NOT for manual record
      if (!waitingForCommand) {
        if (wakeWordEnabled) {
          // Always listening mode: require wake word
          console.log("Sarathi AI: Always listening mode - checking for wake word...");
          const commandPart = extractCommandAfterWake(transcript);
          console.log("Sarathi AI: Extracted command after wake word:", JSON.stringify(commandPart));
          if (commandPart !== null) {
            console.log("Sarathi AI: ✓ Wake word detected! Starting command capture...");
            waitingForCommand = true;
            speechBuffer = commandPart || "";
            console.log("Sarathi AI: Initial speech buffer set to:", JSON.stringify(speechBuffer));
            lastSpeechTime = Date.now();
            scheduleSilenceTimer();
            chrome.runtime
              .sendMessage({
                source: "contentScript",
                type: "wakeWordDetected"
              })
              .catch(() => {});
          } else {
            console.log("Sarathi AI: No wake word found in transcript:", JSON.stringify(transcript));
          }
          return;
        } else {
          // Manual record mode: NO wake word required, directly capture command
          console.log("Sarathi AI: Manual record mode - NO wake word required, directly capturing command");
          waitingForCommand = true;
          speechBuffer = transcript || "";
          console.log("Sarathi AI: Initial speech buffer set to:", JSON.stringify(speechBuffer));
          lastSpeechTime = Date.now();
          scheduleSilenceTimer();
          // Return here to prevent duplicate transcript capture
          return;
        }
      }

      // We are capturing the command after wake word (for continuous mode with wake word already detected)
      if (transcript) {
        console.log("Sarathi AI: Capturing command text, current buffer:", JSON.stringify(speechBuffer));
        if (speechBuffer) {
          speechBuffer += " ";
        }
        speechBuffer += transcript;
        console.log("Sarathi AI: Updated speech buffer:", JSON.stringify(speechBuffer));
        lastSpeechTime = Date.now();
        scheduleSilenceTimer();
      } else {
        console.warn("Sarathi AI: Transcript is empty but we're waiting for command!");
      }
      console.log("Sarathi AI: ==============================================");
    };

    recognition.onerror = (event) => {
      const err = event && event.error;
      console.error("Sarathi AI: ========== SPEECH RECOGNITION ERROR ==========");
      console.error("Sarathi AI: Error type:", err);
      console.error("Sarathi AI: Full event:", event);
      console.error("Sarathi AI: Listening mode:", listeningMode);
      console.error("Sarathi AI: Current speech buffer:", JSON.stringify(speechBuffer));
      console.error("Sarathi AI: Waiting for command:", waitingForCommand);
      
      if (err === "not-allowed" || err === "service-not-allowed") {
        console.error("Sarathi AI: Microphone permission denied");
        chrome.runtime
          .sendMessage({
            source: "contentScript",
            type: "speechError",
            error: err
          })
          .catch(() => {});
        stopListeningInternal();
        return;
      }
      // For transient errors in continuous mode, attempt restart
      if (listeningMode === "continuous") {
        console.log("Sarathi AI: Attempting to restart recognition after transient error");
        try {
          recognition.stop();
          recognition.start();
          console.log("Sarathi AI: ✓ Recognition restarted successfully");
        } catch (e) {
          console.error("Sarathi AI: ✗ Restart failed", e);
        }
      }
      console.error("Sarathi AI: ==============================================");
    };

    recognition.onend = () => {
      if (listeningMode === "continuous") {
        try {
          recognition.start();
        } catch (e) {
          console.warn("Sarathi AI: auto-restart failed", e);
        }
      }
    };

    return recognition;
  }

  function stopListeningInternal() {
    console.log("Sarathi AI: ========== STOPPING LISTENING ==========");
    console.log("Sarathi AI: Current speech buffer:", JSON.stringify(speechBuffer));
    console.log("Sarathi AI: Listening mode:", listeningMode);
    console.log("Sarathi AI: Waiting for command:", waitingForCommand);
    
    // If we have a speech buffer with content, send it before stopping
    if (speechBuffer && speechBuffer.trim().length > 0 && waitingForCommand) {
      const finalTranscript = speechBuffer.trim();
      console.log("Sarathi AI: Sending pending transcript before stopping:", JSON.stringify(finalTranscript));
      
      chrome.runtime
        .sendMessage({
          source: "contentScript",
          type: "transcript",
          transcript: finalTranscript
        })
        .then(() => {
          console.log("Sarathi AI: ✓ Pending transcript sent successfully before stop");
        })
        .catch((e) => {
          console.error("Sarathi AI: ✗ Failed to send pending transcript:", e);
        });
    }
    
    listeningMode = "none";
    wakeWordEnabled = false;
    waitingForCommand = false;
    speechBuffer = "";
    lastSpeechTime = 0;
    if (silenceTimerId) {
      clearTimeout(silenceTimerId);
      silenceTimerId = null;
    }
    if (oneShotTimeoutId) {
      clearTimeout(oneShotTimeoutId);
      oneShotTimeoutId = null;
    }
    if (!recognition) {
      console.log("Sarathi AI: No recognition object, stopping complete");
      return;
    }
    try {
      recognition.stop();
      console.log("Sarathi AI: Recognition stopped");
    } catch (e) {
      console.warn("Sarathi AI: Error stopping recognition:", e);
    }
    // Notify background that listening has fully stopped so UI can reset.
    chrome.runtime
      .sendMessage({
        source: "contentScript",
        type: "listeningStopped"
      })
      .catch(() => {});
    console.log("Sarathi AI: ==============================================");
  }

  function startListening(wakeEnabled, wakeText, lang) {
    console.log("Sarathi AI: ========== STARTING CONTINUOUS LISTENING ==========");
    console.log("Sarathi AI: Wake enabled:", wakeEnabled);
    console.log("Sarathi AI: Wake word text:", wakeText);
    console.log("Sarathi AI: Language:", lang);
    if (!isTopWindow()) {
      console.warn("Sarathi AI: Not top window, aborting startListening");
      return;
    }
    currentLang = lang || navigator.language || "en-IN";
    console.log("Sarathi AI: Using language:", currentLang);
    const rec = getRecognition(currentLang);
    if (!rec) {
      console.error("Sarathi AI: Failed to get recognition object");
      return;
    }
    listeningMode = "continuous";
    wakeWordEnabled = true;
    wakeWordText = wakeText || "hey nova";
    waitingForCommand = false;
    speechBuffer = "";
    console.log("Sarathi AI: Reset speech buffer, waiting for wake word");
    rec.lang = currentLang;
    rec.continuous = true;
    rec.interimResults = false;
    try {
      rec.start();
      console.log("Sarathi AI: ✓ Continuous recognition started successfully");
    } catch (e) {
      console.error("Sarathi AI: ✗ Continuous start error", e);
    }
    console.log("Sarathi AI: ==============================================");
  }

  function startOneShot(lang) {
    console.log("Sarathi AI: ========== STARTING ONE-SHOT LISTENING ==========");
    console.log("Sarathi AI: Language:", lang);
    if (!isTopWindow()) {
      console.warn("Sarathi AI: Not top window, aborting startOneShot");
      return;
    }
    currentLang = lang || navigator.language || "en-IN";
    console.log("Sarathi AI: Using language:", currentLang);
    const rec = getRecognition(currentLang);
    if (!rec) {
      console.error("Sarathi AI: Failed to get recognition object");
      return;
    }
    listeningMode = "oneshot";
    wakeWordEnabled = false; // Manual record: NO wake word required
    waitingForCommand = true; // Directly capture command, no wake word needed
    speechBuffer = "";
    lastSpeechTime = Date.now();
    console.log("Sarathi AI: Manual record mode - NO wake word required, directly capturing command");
    rec.lang = currentLang;
    // Use continuous mode and stop manually after 4s of silence,
    // so the mic can capture longer utterances instead of a single short phrase.
    rec.continuous = true;
    rec.interimResults = false;
    try {
      rec.start();
      console.log("Sarathi AI: ✓ One-shot recognition started successfully");
    } catch (e) {
      console.error("Sarathi AI: ✗ One-shot start error", e);
    }
    // Hard safety: ensure we never listen longer than 10s in one-shot mode,
    // even if background noise prevents perfect silence detection.
    if (oneShotTimeoutId) {
      clearTimeout(oneShotTimeoutId);
    }
    oneShotTimeoutId = setTimeout(() => {
      console.log("Sarathi AI: One-shot timeout (10s) reached, stopping");
      stopListeningInternal();
    }, 10000);
    console.log("Sarathi AI: ==============================================");
  }

  function stopListening() {
    stopListeningInternal();
  }

  function scheduleSilenceTimer() {
    if (silenceTimerId) {
      clearTimeout(silenceTimerId);
    }
    console.log("Sarathi AI: Scheduling silence timer, current speech buffer:", JSON.stringify(speechBuffer));
    silenceTimerId = setTimeout(() => {
      console.log("Sarathi AI: ========== SILENCE TIMER TRIGGERED ==========");
      console.log("Sarathi AI: Speech buffer at silence:", JSON.stringify(speechBuffer));
      console.log("Sarathi AI: Speech buffer length:", speechBuffer ? speechBuffer.length : 0);
      console.log("Sarathi AI: Last speech time:", lastSpeechTime);
      console.log("Sarathi AI: Time since last speech:", Date.now() - lastSpeechTime, "ms");
      console.log("Sarathi AI: Listening mode:", listeningMode);
      
      if (!speechBuffer) {
        console.warn("Sarathi AI: Speech buffer is empty at silence timer!");
        // If we were in one-shot mode and only heard the wake word (no command),
        // we should still stop listening after the pause.
        if (listeningMode === "oneshot") {
          console.log("Sarathi AI: One-shot mode with empty buffer, stopping listening");
          stopListeningInternal();
        } else if (listeningMode === "continuous") {
          console.log("Sarathi AI: Continuous mode with empty buffer, resetting waitingForCommand");
          waitingForCommand = false;
        }
        return;
      }
      const now = Date.now();
      if (now - lastSpeechTime >= SILENCE_MS) {
        const finalTranscript = speechBuffer.trim();
        console.log("Sarathi AI: Final transcript (before trim):", JSON.stringify(speechBuffer));
        console.log("Sarathi AI: Final transcript (after trim):", JSON.stringify(finalTranscript));
        console.log("Sarathi AI: Final transcript length:", finalTranscript.length);
        speechBuffer = "";
        waitingForCommand = false;
        lastSpeechTime = 0;
        silenceTimerId = null;

        if (finalTranscript) {
          console.log("Sarathi AI: ✓ Sending transcript to background:", JSON.stringify(finalTranscript));
          chrome.runtime
            .sendMessage({
              source: "contentScript",
              type: "transcript",
              transcript: finalTranscript
            })
            .then(() => {
              console.log("Sarathi AI: ✓ Transcript message sent successfully");
            })
            .catch((e) => {
              console.error("Sarathi AI: ✗ Failed to send transcript message:", e);
            });
        } else {
          console.error("Sarathi AI: ✗ Final transcript is empty/blank! This should not happen.");
          console.error("Sarathi AI: Original speech buffer was:", JSON.stringify(speechBuffer));
        }

        if (listeningMode === "oneshot") {
          console.log("Sarathi AI: One-shot mode complete, stopping listening");
          stopListeningInternal();
        } else if (listeningMode === "continuous") {
          // In continuous mode, go back to waiting for wake word again
          console.log("Sarathi AI: Continuous mode, resetting to wait for wake word");
          waitingForCommand = false;
        }
      } else {
        console.log("Sarathi AI: Silence detected but time since last speech (", now - lastSpeechTime, "ms) < SILENCE_MS (", SILENCE_MS, "ms), rescheduling...");
      }
      console.log("Sarathi AI: ==============================================");
    }, SILENCE_MS);
  }

  // ----------------------------
  // Message handling
  // ----------------------------
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message !== "object") return;

    // From background: DOM snapshot / actions
    if (message.source === "background" && message.type === "getDomSnapshot") {
      const snapshot = refreshSnapshot();
      // Ensure we always return a valid snapshot object
      if (!snapshot) {
        console.warn("Sarathi AI: Snapshot is null, returning fallback");
        const fallbackSnapshot = {
          url: window.location.href,
          currentUrl: window.location.href,
          pageTitle: document.title,
          title: document.title,
          elements: []
        };
        sendResponse(fallbackSnapshot);
      } else {
        // Ensure URL is always present
        if (!snapshot.url && !snapshot.currentUrl) {
          snapshot.url = window.location.href;
          snapshot.currentUrl = window.location.href;
        }
        console.log("Sarathi AI: Returning snapshot with", snapshot.elements?.length || 0, "elements");
        sendResponse(snapshot);
      }
      return true;
    }

    if (message.source === "background" && message.type === "getDomSnapshot") {
      const snapshot = refreshSnapshot();
      // Ensure URL is always captured, even if snapshot is empty
      if (!snapshot || !snapshot.url) {
        const fallbackSnapshot = {
          url: window.location.href,
          currentUrl: window.location.href,
          pageTitle: document.title,
          title: document.title,
          elements: snapshot?.elements || []
        };
        console.log("Sarathi AI: Using fallback URL capture:", fallbackSnapshot.url);
        sendResponse(fallbackSnapshot);
      } else {
        sendResponse(snapshot);
      }
      return true;
    }

    if (message.source === "background" && message.type === "executeSarathiAction") {
      const action = message.action || {};
      const type = (action.type || "").toLowerCase();
      const id = action.sarathiId;
      const value = action.value;

      console.log("Sarathi AI: executeSarathiAction", action);

      // Properly handle async response
      (async () => {
        let success = false;
        let messageText = "";

        try {
          switch (type) {
            case "click": {
              // Try finding element with retry logic
              let el = findElementBySarathiId(id);
              
              // If not found, wait a bit and try again (DOM might be updating)
              if (!el) {
                console.log("Sarathi AI: Element not found, waiting 200ms and retrying...", id);
                await new Promise((res) => setTimeout(res, 200));
                el = findElementBySarathiId(id);
              }
              
              if (el) {
                success = await performClick(el, id);
                messageText = success ? "Clicked element " + id : "Failed to click element " + id;
              } else {
                console.warn("Sarathi AI: element not found for sarathiId after retries", id);
                messageText = "Element not found for sarathiId " + id;
              }
              break;
            }
            case "type": {
              const el = findElementBySarathiId(id);
              if (!el) {
                console.warn("Sarathi AI: Element not found for sarathiId", id);
                messageText = "Element not found for " + id;
                break;
              }
              
              // performType will search through children if element itself is not typable
              success = await performType(el, value, id);
              messageText = success ? "Typed into " + id : "Failed to type into " + id;
              break;
            }
            case "keypress": {
              success = await performKeypress(id, value);
              messageText = success ? "Keypress " + (value || "Enter") + " on " + (id || "active element") : "Failed to send keypress";
              break;
            }
            case "scroll": {
              success = performScroll(value);
              const dir = (value || "down").toLowerCase() === "up" ? "up" : "down";
              messageText = success ? "Scrolled " + dir : "Failed to scroll";
              break;
            }
            case "wait": {
              const ms = parseInt(value, 10) || 0;
              await new Promise((res) => setTimeout(res, ms));
              success = true;
              messageText = "Waited " + ms + "ms";
              console.log("Sarathi AI: wait action completed successfully");
              break;
            }
            case "speak": {
              if (value && typeof value === "string" && value.trim().length > 0) {
                console.log("Sarathi AI: Speak action received, text length:", value.length);
                // Try immediate synchronous call first (may work if we're still in user gesture context)
                try {
                  if (window.speechSynthesis && !window.speechSynthesis.speaking) {
                    // Cancel any ongoing speech
                    window.speechSynthesis.cancel();
                    // Small delay to ensure cancel completes
                    await new Promise(res => setTimeout(res, 50));
                  }
                } catch (e) {
                  console.warn("Sarathi AI: Error canceling previous speech:", e);
                }
                
                success = await performSpeak(value);
                messageText = success ? "Spoke: " + value.substring(0, 50) + (value.length > 50 ? "..." : "") : "Failed to speak (may require user interaction)";
                
                if (!success) {
                  // Log the text that should have been spoken for user reference
                  console.warn("Sarathi AI: Speech failed. Text that should have been spoken:");
                  console.warn(value);
                }
              } else {
                console.warn("Sarathi AI: No text provided for speak action");
                messageText = "No text provided for speak action";
                success = false;
              }
              break;
            }
            default: {
              messageText = "Unknown action type: " + type;
              console.warn("Sarathi AI: unknown action type", type);
            }
          }
        } catch (e) {
          console.error("Sarathi AI: executeSarathiAction error", e);
          success = false;
          messageText = e && e.message ? e.message : "Error executing action";
        }

        console.log("Sarathi AI: sending response", { success, message: messageText });
        sendResponse({
          success,
          message: messageText,
          action
        });
      })();

      return true; // Keep channel open for async response
    }

    // From background: speech control
    if (message.source === "background" && message.type === "startListening") {
      startListening(
        !!message.wakeWordEnabled,
        message.wakeWordText || "hey sarathi",
        message.lang || "en-IN"
      );
      sendResponse({ ok: true });
      return true;
    }

    if (message.source === "background" && message.type === "stopListening") {
      stopListening();
      sendResponse({ ok: true });
      return true;
    }

    if (message.source === "background" && message.type === "oneShotRecognize") {
      startOneShot(message.lang || "en-IN");
      sendResponse({ ok: true });
      return true;
    }
  });
})();


