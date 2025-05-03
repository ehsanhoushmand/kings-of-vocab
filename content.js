// Store for saved words
let savedWords = {};
let observer; // MutationObserver for dynamic content

// Load saved words from storage
function loadSavedWords() {
  chrome.storage.sync.get('savedWords', function(data) {
    savedWords = data.savedWords || {};
    highlightSavedWords();
    
    // Setup observer for dynamic content after initial highlighting
    setupMutationObserver();
  });
}

// Setup MutationObserver to detect DOM changes
function setupMutationObserver() {
  // Disconnect any existing observer
  if (observer) {
    observer.disconnect();
  }
  
  // Create a new observer
  observer = new MutationObserver(function(mutations) {
    let shouldHighlight = false;
    
    // Check if any relevant mutations occurred
    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          // Only re-highlight if text nodes or elements with text were added
          if (node.nodeType === Node.TEXT_NODE || 
              (node.nodeType === Node.ELEMENT_NODE && 
               !['SCRIPT', 'STYLE', 'META', 'LINK'].includes(node.tagName))) {
            shouldHighlight = true;
            break;
          }
        }
      }
      if (shouldHighlight) break;
    }
    
    // If relevant changes were detecte-highlight
    if (shouldHighlight) {
      // Debounce the highlighting to avoid doing it too frequently
      clearTimeout(observer._highlightTimeout);
      observer._highlightTimeout = setTimeout(highlightSavedWords, 500);
    }
  });
  
  // Start observing the document with the configured parameters
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Save a word to storage
function saveWord(word) {
  word = word.trim().toLowerCase();
  if (word && word.length > 1) {
    // Check if the word is already saved
    if (!savedWords[word]) {
      savedWords[word] = { timestamp: Date.now() };
      
      // Fetch definition
      fetchDefinition(word);
      
      // Save to storage
      chrome.storage.sync.set({ savedWords: savedWords }, function() {
        console.log('Word saved:', word);
        highlightSavedWords();
      });
    }
  }
}

// Remove a word from storage
function removeWord(word) {
  word = word.toLowerCase();
  if (savedWords[word]) {
    delete savedWords[word];
    chrome.storage.sync.set({ savedWords: savedWords }, function() {
      console.log('Word removed:', word);
      highlightSavedWords();
    });
  }
}

// Fetch word definition from API
function fetchDefinition(word) {
  fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`)
    .then(response => response.json())
    .then(data => {
      if (Array.isArray(data) && data.length > 0) {
        const wordData = data[0];
        const phonetic = wordData.phonetic || findPhonetic(wordData.phonetics);
        const meanings = wordData.meanings || [];
        
        // Store the complete data
        savedWords[word] = {
          timestamp: savedWords[word].timestamp,
          phonetic: phonetic,
          meanings: meanings
        };
        
        // Update storage with definition
        chrome.storage.sync.set({ savedWords: savedWords });
      }
    })
    .catch(error => console.log('Error fetching definition:', error));
}

// Helper function to find phonetic from phonetics array
function findPhonetic(phonetics) {
  if (!phonetics || !Array.isArray(phonetics) || phonetics.length === 0) {
    return null;
  }
  
  // Try to find a phonetic with text
  for (const item of phonetics) {
    if (item.text) {
      return item.text;
    }
  }
  
  return null;
}

// Process a node and its children to highlight words
function processNode(node) {
  // Skip if this is not a text node or is inside a script, style, or our own elements
  if (node.nodeType === Node.TEXT_NODE) {
    const parentElement = node.parentElement;
    if (parentElement && 
        !['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT'].includes(parentElement.tagName) &&
        !parentElement.classList.contains('word-learner-highlight') &&
        !parentElement.classList.contains('word-learner-tooltip')) {
      
      highlightTextNode(node);
    }
  } else if (node.nodeType === Node.ELEMENT_NODE) {
    // Check if this element is in a shadow DOM
    if (node.shadowRoot) {
      // Process shadow DOM
      processNodeList(node.shadowRoot.childNodes);
    }
    
    // Process regular children
    processNodeList(node.childNodes);
    
    // Check for iframes (if we have permission)
    if (node.tagName === 'IFRAME') {
      try {
        const iframeDoc = node.contentDocument || node.contentWindow?.document;
        if (iframeDoc) {
          processNodeList(iframeDoc.body.childNodes);
        }
      } catch (e) {
        // Cross-origin iframe, can't access content
        console.log('Cannot access iframe content:', e);
      }
    }
  }
}

// Process a list of nodes
function processNodeList(nodeList) {
  for (const node of nodeList) {
    processNode(node);
  }
}

// Create highlighted span for the word
function createHighlightedSpan(word, match) {
  const span = document.createElement('span');
  span.className = 'word-learner-highlight';
  span.textContent = match;
  span.dataset.word = word.toLowerCase();
  
  // Add tooltip functionality on hover
  span.addEventListener('mouseenter', showTooltip);
  span.addEventListener('mouseleave', hideTooltip);
  
  // Add click functionality to remove the word
  span.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    const wordToRemove = e.target.dataset.word;
    removeWord(wordToRemove);
  });
  
  return span;
}

// Highlight text in a specific text node
function highlightTextNode(textNode) {
  const text = textNode.textContent;
  
  // Create a regex pattern for all saved words
  const wordList = Object.keys(savedWords).map(word => 
    word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  );
  
  if (wordList.length === 0) return;
  
  const pattern = new RegExp(`\\b(${wordList.join('|')})\\b`, 'gi');
  const matches = text.match(pattern);
  
  if (!matches) return;
  
  const fragment = document.createDocumentFragment();
  let lastIndex = 0;
  
  text.replace(pattern, function(match, word, offset) {
    // Add text before the match
    if (offset > lastIndex) {
      fragment.appendChild(document.createTextNode(text.substring(lastIndex, offset)));
    }
    
    // Create highlighted span for the word
    const span = createHighlightedSpan(match, match);
    
    fragment.appendChild(span);
    lastIndex = offset + match.length;
    
    return match;
  });
  
  // Add remaining text
  if (lastIndex < text.length) {
    fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
  }
  
  // Replace the original text node with the fragment
  if (textNode.parentNode) {
    textNode.parentNode.replaceChild(fragment, textNode);
  }
}

// Highlight all saved words in the page
function highlightSavedWords() {
  // No saved words, exit early
  if (Object.keys(savedWords).length === 0) return;
  
  // Remove existing highlights
  const existingHighlights = document.querySelectorAll('.word-learner-highlight');
  existingHighlights.forEach(el => {
    if (el.parentNode) {
      const parent = el.parentNode;
      parent.replaceChild(document.createTextNode(el.textContent), el);
    }
  });
  
  // Remove any tooltips
  document.querySelectorAll('.word-learner-tooltip').forEach(el => {
    if (el.parentNode) {
      el.parentNode.removeChild(el);
    }
  });
  
  // Process the entire document
  processNodeList(document.body.childNodes);
}

// Show tooltip with word definition
function showTooltip(event) {
  const word = event.target.dataset.word.toLowerCase();
  const wordData = savedWords[word];
  const highlightedWord = event.target;
  
  // Clear any existing hide timeout
  if (window._hideTooltipTimeout) {
    clearTimeout(window._hideTooltipTimeout);
    window._hideTooltipTimeout = null;
  }
  
  // Remove any existing tooltips first
  const existingTooltip = document.querySelector('.word-learner-tooltip');
  if (existingTooltip) {
    existingTooltip.parentNode.removeChild(existingTooltip);
  }
  
  // Create tooltip
  const tooltip = document.createElement('div');
  tooltip.className = 'word-learner-tooltip';
  tooltip.dataset.forWord = word;
  
  // Create content container
  const content = document.createElement('div');
  content.className = 'tooltip-content';
  
  // Add word as title
  const wordTitle = document.createElement('div');
  wordTitle.className = 'tooltip-word';
  wordTitle.textContent = word;
  content.appendChild(wordTitle);
  
  // Add phonetic if available
  if (wordData.phonetic) {
    const phoneticElem = document.createElement('div');
    phoneticElem.className = 'tooltip-phonetic';
    phoneticElem.textContent = wordData.phonetic;
    content.appendChild(phoneticElem);
  }
  
  // Add meanings if available
  if (wordData.meanings && wordData.meanings.length > 0) {
    const meaningsContainer = document.createElement('div');
    meaningsContainer.className = 'tooltip-meanings';
    
    wordData.meanings.forEach((meaning, index) => {
      // Create section for each part of speech
      const meaningSection = document.createElement('div');
      meaningSection.className = 'tooltip-meaning-section';
      
      // Add part of speech
      if (meaning.partOfSpeech) {
        const partOfSpeech = document.createElement('div');
        partOfSpeech.className = 'tooltip-part-of-speech';
        partOfSpeech.textContent = meaning.partOfSpeech;
        meaningSection.appendChild(partOfSpeech);
      }
      
      // Add definitions
      if (meaning.definitions && meaning.definitions.length > 0) {
        const definitionsContainer = document.createElement('div');
        definitionsContainer.className = 'tooltip-definitions';
        
        meaning.definitions.forEach((def, defIndex) => {
          if (defIndex > 29) return; // Limit to 30 definitions per part of speech
          
          const definition = document.createElement('div');
          definition.className = 'tooltip-definition';
          definition.textContent = `${defIndex + 1}. ${def.definition}`;
          definitionsContainer.appendChild(definition);
          
          // Add example if available
          if (def.example) {
            const example = document.createElement('div');
            example.className = 'tooltip-example';
            example.textContent = `"${def.example}"`;
            definitionsContainer.appendChild(example);
          }
        });
        
        meaningSection.appendChild(definitionsContainer);
      }
      
      // Add synonyms if available
      if (meaning.synonyms && meaning.synonyms.length > 0) {
        const synonyms = document.createElement('div');
        synonyms.className = 'tooltip-synonyms';
        synonyms.innerHTML = `<strong>Synonyms:</strong> ${meaning.synonyms.slice(0, 5).join(', ')}`;
        meaningSection.appendChild(synonyms);
      }
      
      // Add antonyms if available
      if (meaning.antonyms && meaning.antonyms.length > 0) {
        const antonyms = document.createElement('div');
        antonyms.className = 'tooltip-antonyms';
        antonyms.innerHTML = `<strong>Antonyms:</strong> ${meaning.antonyms.slice(0, 5).join(', ')}`;
        meaningSection.appendChild(antonyms);
      }
      
      // Add separator if not the last meaning
      if (index < wordData.meanings.length - 1) {
        const separator = document.createElement('hr');
        separator.className = 'tooltip-separator';
        meaningSection.appendChild(separator);
      }
      
      meaningsContainer.appendChild(meaningSection);
    });
    
    content.appendChild(meaningsContainer);
  } else {
    // If no meanings available
    const noDefinition = document.createElement('div');
    noDefinition.className = 'tooltip-no-definition';
    noDefinition.textContent = 'Definition not available';
    content.appendChild(noDefinition);
  }
  
  // Add removal instruction
  const instructionText = document.createElement('div');
  instructionText.className = 'tooltip-instruction';
  instructionText.textContent = 'Click to remove this word';
  content.appendChild(instructionText);
  
  tooltip.appendChild(content);
  
  // Position the tooltip
  const rect = highlightedWord.getBoundingClientRect();
  tooltip.style.left = `${rect.left + window.scrollX}px`;
  tooltip.style.top = `${rect.bottom + window.scrollY + 5}px`;
  
  document.body.appendChild(tooltip);
  
  // Adjust position if tooltip would go off screen
  setTimeout(() => {
    const tooltipRect = tooltip.getBoundingClientRect();
    if (tooltipRect.right > window.innerWidth) {
      tooltip.style.left = `${window.innerWidth - tooltipRect.width - 10 + window.scrollX}px`;
    }
  }, 0);
  
  // Store global reference to current tooltip and highlighted word
  window._currentTooltip = tooltip;
  window._currentHighlightedWord = highlightedWord;
  
  // Add event listeners for mouse tracking
  tooltip.addEventListener('mouseenter', function() {
    // Clear any hide timeout when mouse enters tooltip
    if (window._hideTooltipTimeout) {
      clearTimeout(window._hideTooltipTimeout);
      window._hideTooltipTimeout = null;
    }
  });
  
  tooltip.addEventListener('mouseleave', function() {
    // Start hide timeout when mouse leaves tooltip
    startHideTooltipTimeout();
  });
}

// Hide tooltip with delay
function hideTooltip(event) {
  // Only start the timeout if we're not already hovering the tooltip
  if (!isMouseOverTooltip()) {
    startHideTooltipTimeout();
  }
}

// Start the hide tooltip timeout
function startHideTooltipTimeout() {
  // Clear any existing timeout first
  if (window._hideTooltipTimeout) {
    clearTimeout(window._hideTooltipTimeout);
  }
  
  // Set new timeout
  window._hideTooltipTimeout = setTimeout(() => {
    if (window._currentTooltip && window._currentTooltip.parentNode) {
      window._currentTooltip.parentNode.removeChild(window._currentTooltip);
      window._currentTooltip = null;
      window._currentHighlightedWord = null;
    }
  }, 300); // 300ms delay
}

// Check if mouse is over the tooltip
function isMouseOverTooltip() {
  return document.querySelector('.word-learner-tooltip:hover') !== null;
}

// Double-click handler to save words
function handleDoubleClick(event) {
  const selection = window.getSelection();
  const selectedText = selection.toString();
  
  if (selectedText) {
    saveWord(selectedText);
  }
}

// Function to manually trigger highlighting (can be called from popup)
function refreshHighlights() {
  highlightSavedWords();
}

// Listen for messages from popup or background
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "updateHighlights") {
    loadSavedWords();
  } else if (request.action === "refreshHighlights") {
    refreshHighlights();
  }
});

// Close tooltip when clicking elsewhere on the page
document.addEventListener('click', function(event) {
  if (window._currentTooltip && 
      !event.target.classList.contains('word-learner-highlight') && 
      !event.target.closest('.word-learner-tooltip')) {
    if (window._currentTooltip.parentNode) {
      window._currentTooltip.parentNode.removeChild(window._currentTooltip);
      window._currentTooltip = null;
      window._currentHighlightedWord = null;
    }
  }
});

// Initialize
document.addEventListener('dblclick', handleDoubleClick);

// Add a small delay before initial highlighting to ensure page is loaded
setTimeout(loadSavedWords, 500);

// Add refresh button to page (optional)
function addRefreshButton() {
  const button = document.createElement('button');
  button.textContent = 'Refresh Highlights';
  button.style.position = 'fixed';
  button.style.bottom = '10px';
  button.style.right = '10px';
  button.style.zIndex = '10000';
  button.style.padding = '5px 10px';
  button.style.backgroundColor = '#4285f4';
  button.style.color = 'white';
  button.style.border = 'none';
  button.style.borderRadius = '4px';
  button.style.cursor = 'pointer';
  button.style.display = 'none'; // Hidden by default
  
  button.addEventListener('click', refreshHighlights);
  
  // Show button on Alt+H keypress
  document.addEventListener('keydown', function(e) {
    if (e.altKey && e.key === 'k') {
      button.style.display = button.style.display === 'none' ? 'block' : 'none';
    }
  });
  
  document.body.appendChild(button);
}

// Uncomment to add refresh button
// addRefreshButton();