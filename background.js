const MENU_PARENT_ID = "case-changer-parent";

const MENUS = [
  { id: "case-title", title: "Change case → Title Case", mode: "title" },
  { id: "case-upper", title: "Change case → UPPERCASE", mode: "upper" },
  { id: "case-lower", title: "Change case → lowercase", mode: "lower" }
];

async function ensureInjected(tabId, frameId) {
  try {
    const target = { tabId };
    if (typeof frameId === 'number') target.frameIds = [frameId];
    await chrome.scripting.executeScript({ target, files: ["content.js"] });
  } catch (e) {
    // Injection can fail on restricted pages (chrome://, Chrome Web Store, etc.).
  }
}

async function sendCaseCommand(tabId, frameId, mode) {
  const msg = { type: "CASE_CHANGE", mode };
  try {
    if (typeof frameId === "number") {
      await chrome.tabs.sendMessage(tabId, msg, { frameId });
    } else {
      await chrome.tabs.sendMessage(tabId, msg);
    }
  } catch (e) {
    await ensureInjected(tabId, frameId);
    try {
      if (typeof frameId === "number") {
        await chrome.tabs.sendMessage(tabId, msg, { frameId });
      } else {
        await chrome.tabs.sendMessage(tabId, msg);
      }
    } catch (e2) {
      // Still failing → ignore.
    }
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_PARENT_ID,
      title: "Change text case",
      contexts: ["editable"]
    });

    for (const item of MENUS) {
      chrome.contextMenus.create({
        id: item.id,
        parentId: MENU_PARENT_ID,
        title: item.title,
        contexts: ["editable"]
      });
    }
  });

  // Initialize defaults if not present
  chrome.storage.sync.get({ ignoreList: "LLC, Ltd., LP" }).then(() => {});
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  const item = MENUS.find(m => m.id === info.menuItemId);
  if (!item) return;
  sendCaseCommand(tab.id, info.frameId, item.mode);
});

chrome.commands.onCommand.addListener((command, tab) => {
  const commandToMode = {
    "to-title-case": "title",
    "to-upper-case": "upper",
    "to-lower-case": "lower"
  };

  const mode = commandToMode[command];
  if (!mode) return;

  if (tab?.id) {
    sendCaseCommand(tab.id, undefined, mode);
  } else {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const t = tabs?.[0];
      if (t?.id) sendCaseCommand(t.id, undefined, mode);
    });
  }
});
