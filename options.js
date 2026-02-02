const ignoreListEl = document.getElementById('ignoreList');
const statusEl = document.getElementById('status');
const saveBtn = document.getElementById('save');
const openShortcutsBtn = document.getElementById('openShortcuts');

function showStatus(msg, ok = true) {
  statusEl.textContent = msg;
  statusEl.classList.toggle('error', !ok);
  if (msg) setTimeout(() => { statusEl.textContent = ''; }, 2000);
}

async function restore() {
  const data = await chrome.storage.sync.get({ ignoreList: 'LLC, Ltd., LP' });
  ignoreListEl.value = data.ignoreList || '';
}

async function save() {
  const value = (ignoreListEl.value || '').trim();
  await chrome.storage.sync.set({ ignoreList: value });
  showStatus('Saved');
}

saveBtn.addEventListener('click', () => {
  save().catch(() => showStatus('Save failed', false));
});

document.addEventListener('DOMContentLoaded', () => {
  restore().catch(() => showStatus('Load failed', false));
});

openShortcutsBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});
