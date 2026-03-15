// Background script for Word Learner extension

// Listen for installation
chrome.runtime.onInstalled.addListener(function() {
  console.log('Kings Of Vocab extension installed');
  
  // Initialize storage if needed
  chrome.storage.local.get('savedWords', function(data) {
    if (!data.savedWords) {
      chrome.storage.local.set({ savedWords: {} });
    }
  });

  // Create context menu for adding words
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'kings-of-vocab-add-word',
      title: 'Add to Kings Of Vocab',
      contexts: ['selection']
    });
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'kings-of-vocab-add-word' && tab && tab.id != null) {
    const selectedText = (info.selectionText || '').trim();
    if (!selectedText) return;

    // Ask the content script in this tab to save the selected word
    chrome.tabs.sendMessage(tab.id, {
      action: 'saveWordFromContextMenu',
      word: selectedText
    }).catch(err => {
      // Content script may not be available on some pages
      console.log('Could not send saveWordFromContextMenu message:', err);
    });
  }
});

// Listen for tab updates to refresh highlights
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  if (changeInfo.status === 'complete' && tab.url && tab.url.startsWith('http')) {
    chrome.tabs.sendMessage(tabId, { action: "updateHighlights" }).catch(err => {
      // Suppress errors when content script is not yet loaded
      console.log("Tab not ready for message:", err);
    });
  }
});