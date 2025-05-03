// Background script for Word Learner extension

// Listen for installation
chrome.runtime.onInstalled.addListener(function() {
  console.log('Kings Of Vocab extension installed');
  
  // Initialize storage if needed
  chrome.storage.sync.get('savedWords', function(data) {
    if (!data.savedWords) {
      chrome.storage.sync.set({ savedWords: {} });
    }
  });
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