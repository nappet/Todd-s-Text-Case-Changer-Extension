// Settings are stored in chrome.storage.sync and cached here.
let ignoreSet = new Set();
let ignoreMap = new Map(); // upper -> preferred casing from list (e.g. 'LLC')
let settingsLoaded = false;

async function loadSettings() {
  try {
    const data = await chrome.storage.sync.get({ ignoreList: "" });
    const parsed = parseIgnoreList(data.ignoreList || "");
    ignoreSet = parsed.ignoreSet;
    ignoreMap = parsed.ignoreMap;
    settingsLoaded = true;
  } catch {
    settingsLoaded = true;
  }
}

function parseIgnoreList(raw) {
  const items = (raw || "")
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const set = new Set();
  const map = new Map();
  for (const it of items) {
    const key = it.toUpperCase();
    set.add(key);
    // Preserve the user's preferred casing (e.g. LLC, Ltd., LP)
    map.set(key, it);
  }
  return { ignoreSet: set, ignoreMap: map };
}

// Keep cache updated if user changes options.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  if (changes.ignoreList) {
    const parsed = parseIgnoreList(changes.ignoreList.newValue || "");
    ignoreSet = parsed.ignoreSet;
    ignoreMap = parsed.ignoreMap;
  }
});

// Load settings as soon as possible.
loadSettings();

let lastRightClickedEditable = null;

document.addEventListener(
  "contextmenu",
  (e) => {
    const el = e.target;
    if (isEditable(el)) lastRightClickedEditable = el;
  },
  true
);

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== "CASE_CHANGE") return;
  const el = lastRightClickedEditable || document.activeElement;
  if (!isEditable(el)) return;

  // Ensure settings are loaded before we transform (best-effort).
  if (!settingsLoaded) {
    loadSettings();
  }

  applyCaseChange(el, msg.mode);
});

function isEditable(el) {
  if (!el) return false;
  const tag = (el.tagName || "").toLowerCase();
  if (tag === "textarea") return true;
  if (tag === "input") {
    const type = (el.getAttribute("type") || "text").toLowerCase();
    return ["text", "search", "url", "tel", "password", "email"].includes(type);
  }
  return !!el.isContentEditable;
}

function applyCaseChange(el, mode) {
  if (el.isContentEditable) {
    applyCaseChangeContentEditable(el, mode);
    return;
  }
  applyCaseChangeInputOrTextarea(el, mode);
}

function applyCaseChangeInputOrTextarea(el, mode) {
  const value = el.value ?? "";
  let start = 0, end = value.length;
  let hasSelection = false;

  try {
    if (typeof el.selectionStart === "number" && typeof el.selectionEnd === "number") {
      hasSelection = el.selectionStart !== el.selectionEnd;
      if (hasSelection) {
        start = el.selectionStart;
        end = el.selectionEnd;
      }
    }
  } catch {
    hasSelection = false;
  }

  const before = value.slice(0, start);
  const middle = value.slice(start, end);
  const after = value.slice(end);

  const replaced = convertText(middle, mode);
  el.value = before + replaced + after;

  el.focus();
  if (hasSelection) {
    el.setSelectionRange(start, start + replaced.length);
  }

  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function applyCaseChangeContentEditable(root, mode) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) {
    transformAllTextNodes(root, mode);
    return;
  }

  const range = sel.getRangeAt(0);
  const common = range.commonAncestorContainer;
  const commonEl = common.nodeType === Node.ELEMENT_NODE ? common : common.parentElement;
  if (!commonEl || !root.contains(commonEl)) {
    transformAllTextNodes(root, mode);
    return;
  }

  if (!sel.isCollapsed) {
    try {
      if (document.queryCommandSupported && document.queryCommandSupported("insertText")) {
        const replaced = convertText(sel.toString(), mode);
        document.execCommand("insertText", false, replaced);
        return;
      }
    } catch {}

    transformRangeTextNodes(root, range, mode);
    return;
  }

  transformAllTextNodes(root, mode);
}

function transformAllTextNodes(root, mode) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.nodeValue && node.nodeValue.trim().length
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    }
  });

  let node;
  while ((node = walker.nextNode())) {
    node.nodeValue = convertText(node.nodeValue, mode);
  }
}

function transformRangeTextNodes(root, range, mode) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  let node;

  while ((node = walker.nextNode())) {
    if (!node.nodeValue || !node.nodeValue.length) continue;
    if (typeof range.intersectsNode === "function" && !range.intersectsNode(node)) continue;

    const full = node.nodeValue;
    let s = 0;
    let e = full.length;

    if (node === range.startContainer) s = range.startOffset;
    if (node === range.endContainer) e = range.endOffset;

    node.nodeValue = full.slice(0, s) + convertText(full.slice(s, e), mode) + full.slice(e);
  }
}

function convertText(text, mode) {
  if (!text) return text;
  const tokens = text.split(/(\b[\w]+(?:[’'\.][\w]+)*\b)/g);

  return tokens.map(tok => {
    if (!tok || !/^\b[\w]+(?:[’'\.][\w]+)*\b$/.test(tok)) return tok;

    const key = tok.toUpperCase();
    if (ignoreSet.has(key)) {
      return ignoreMap.get(key) || tok;
    }

    if (mode === 'upper') return tok.toUpperCase();
    if (mode === 'lower') return tok.toLowerCase();
    if (mode === 'title') return toTitleWord(tok);

    return tok;
  }).join('');
}

function toTitleWord(word) {
  return word
    .toLowerCase()
    .replace(/(^[a-z])|([’'\"][a-z])/g, (m) => m.toUpperCase());
}
