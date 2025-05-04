// Store for saved words
let savedWords = {};

// Load saved words from storage
function loadSavedWords() {
  chrome.storage.sync.get('savedWords', function(data) {
    savedWords = data.savedWords || {};
    highlightSavedWords();
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

// Highlight all saved words in the page
function highlightSavedWords() {
  // Remove existing highlights
  const existingHighlights = document.querySelectorAll('.word-learner-highlight');
  existingHighlights.forEach(el => {
    const parent = el.parentNode;
    parent.replaceChild(document.createTextNode(el.textContent), el);
  });
  
  // Remove any tooltips
  document.querySelectorAll('.word-learner-tooltip').forEach(el => {
    if (el.parentNode) {
      el.parentNode.removeChild(el);
    }
  });
  
  // No saved words, exit early
  if (Object.keys(savedWords).length === 0) return;
  
  // Find text nodes in the document
  const textNodes = [];
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: function(node) {
        // Skip script and style elements
        if (node.parentNode.tagName === 'SCRIPT' || 
            node.parentNode.tagName === 'STYLE' ||
            node.parentNode.classList.contains('word-learner-tooltip')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );
  
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode);
  }
  
  // Create a regex pattern for all saved words
  const wordList = Object.keys(savedWords).map(word => 
    word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  );
  
  if (wordList.length === 0) return;
  
  const pattern = new RegExp(`\\b(${wordList.join('|')})\\b`, 'gi');
  
  // Process each text node
  textNodes.forEach(node => {
    const text = node.textContent;
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
      const span = document.createElement('span');
      span.className = 'word-learner-highlight';
      span.textContent = match;
      span.dataset.word = match.toLowerCase();
      
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
      
      fragment.appendChild(span);
      lastIndex = offset + match.length;
      
      return match;
    });
    
    // Add remaining text
    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
    }
    
    // Replace the original text node with the fragment
    node.parentNode.replaceChild(fragment, node);
  });
}

// Show tooltip with word definition
function showTooltip(event) {
  const word = event.target.dataset.word.toLowerCase();
  const wordData = savedWords[word];
  
  // Remove any existing tooltips first
  document.querySelectorAll('.word-learner-tooltip').forEach(el => {
    if (el.parentNode) {
      el.parentNode.removeChild(el);
    }
  });
  
  // Create tooltip
  const tooltip = document.createElement('div');
  tooltip.className = 'word-learner-tooltip';
  
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
          if (defIndex > 2) return; // Limit to 3 definitions per part of speech
          
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
  const rect = event.target.getBoundingClientRect();
  tooltip.style.left = `${rect.left + window.scrollX}px`;
  tooltip.style.top = `${rect.bottom + window.scrollY + 5}px`;
  
  // Adjust position if tooltip would go off screen
  setTimeout(() => {
    const tooltipRect = tooltip.getBoundingClientRect();
    if (tooltipRect.right > window.innerWidth) {
      tooltip.style.left = `${window.innerWidth - tooltipRect.width - 10 + window.scrollX}px`;
    }
  }, 0);
  
  document.body.appendChild(tooltip);
  
  // Store references to the elements
  const highlightedWord = event.target;
  
  // Add event listeners to keep tooltip visible when hovering over it
  tooltip.addEventListener('mouseenter', function() {
    // Clear any existing timeout
    if (highlightedWord._hideTooltipTimeout) {
      clearTimeout(highlightedWord._hideTooltipTimeout);
      highlightedWord._hideTooltipTimeout = null;
    }
  });
  
  tooltip.addEventListener('mouseleave', function() {
    // Hide tooltip when mouse leaves it
    if (tooltip.parentNode) {
      document.body.removeChild(tooltip);
    }
  });
  
  // Store the tooltip reference on the highlighted word
  highlightedWord._tooltip = tooltip;
}

// Hide tooltip with delay to allow moving to the tooltip
function hideTooltip(event) {
  const highlightedWord = event.target;
  
  // Set a small timeout to allow moving the mouse to the tooltip
  highlightedWord._hideTooltipTimeout = setTimeout(() => {
    if (highlightedWord._tooltip && highlightedWord._tooltip.parentNode) {
      document.body.removeChild(highlightedWord._tooltip);
      highlightedWord._tooltip = null;
    }
  }, 300); // 300ms delay gives time to move mouse to tooltip
}

// Double-click handler to save words
function handleDoubleClick(event) {
  const selection = window.getSelection();
  const selectedText = selection.toString();
  
  if (selectedText) {
    saveWord(selectedText);
  }
}

// Listen for messages from popup or background
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "updateHighlights") {
    loadSavedWords();
  }
});

// Initialize
document.addEventListener('dblclick', handleDoubleClick);
loadSavedWords();