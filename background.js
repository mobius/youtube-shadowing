chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'shadowing:toggle' });
  } catch {
    await chrome.tabs.create({ url: chrome.runtime.getURL('help.html') });
  }
});
