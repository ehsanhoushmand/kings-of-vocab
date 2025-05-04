document.addEventListener('DOMContentLoaded', function() {
  const wordList = document.getElementById('wordList');
  const exportBtn = document.getElementById('exportBtn');
  const clearBtn = document.getElementById('clearBtn');
  
  // Load and display saved words
  function loadWords() {
    chrome.storage.sync.get('savedWords', function(data) {
      const savedWords = data.savedWords || {};
      wordList.innerHTML = '';
      
      if (Object.keys(savedWords).length === 0) {
        wordList.innerHTML = '<div class="empty-message">Double-click on words in web pages to save them here.</div>';
        return;
      }
      
      for (const word in savedWords) {
        const wordItem = document.createElement('div');
        wordItem.className = 'word-item';
        
        const wordContent = document.createElement('div');
        wordContent.className = 'word-text';
        
        // Add word
        const wordText = document.createElement('div');
        wordText.className = 'word-title';
        wordText.textContent = word;
        wordContent.appendChild(wordText);
        
        // Add phonetic if available
        if (savedWords[word].phonetic) {
          const phoneticElem = document.createElement('div');
          phoneticElem.className = 'word-phonetic';
          phoneticElem.textContent = savedWords[word].phonetic;
          wordContent.appendChild(phoneticElem);
        }
        
        // Add first definition if available
        if (savedWords[word].meanings && savedWords[word].meanings.length > 0) {
          const firstMeaning = savedWords[word].meanings[0];
          
          // Add part of speech
          if (firstMeaning.partOfSpeech) {
            const posElem = document.createElement('div');
            posElem.className = 'word-pos';
            posElem.textContent = firstMeaning.partOfSpeech;
            wordContent.appendChild(posElem);
          }
          
          // Add first definition
          if (firstMeaning.definitions && firstMeaning.definitions.length > 0) {
            const defElem = document.createElement('div');
            defElem.className = 'word-definition';
            defElem.textContent = firstMeaning.definitions[0].definition;
            wordContent.appendChild(defElem);
          }
        }
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.textContent = 'X';
        deleteBtn.addEventListener('click', function() {
          delete savedWords[word];
          chrome.storage.sync.set({ savedWords: savedWords }, function() {
            loadWords();
            // Notify content scripts to update highlights
            chrome.tabs.query({}, function(tabs) {
              tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, { action: "updateHighlights" }).catch(() => {});
              });
            });
          });
        });
        
        wordItem.appendChild(wordContent);
        wordItem.appendChild(deleteBtn);
        wordList.appendChild(wordItem);
      }
    });
  }
  
  // Export words to a file
  exportBtn.addEventListener('click', function() {
    chrome.storage.sync.get('savedWords', function(data) {
      const savedWords = data.savedWords || {};
      let exportContent = "Kings Of Vocab - Saved Words\n\n";
      
      for (const word in savedWords) {
        exportContent += word + "\n";
        
        // Add phonetic if available
        if (savedWords[word].phonetic) {
          exportContent += "Phonetic: " + savedWords[word].phonetic + "\n";
        }
        
        // Add meanings
        if (savedWords[word].meanings && savedWords[word].meanings.length > 0) {
          savedWords[word].meanings.forEach(meaning => {
            if (meaning.partOfSpeech) {
              exportContent += "\n" + meaning.partOfSpeech + ":\n";
            }
            
            // Add definitions
            if (meaning.definitions && meaning.definitions.length > 0) {
              meaning.definitions.forEach((def, index) => {
                exportContent += `${index + 1}. ${def.definition}\n`;
                if (def.example) {
                  exportContent += `   Example: "${def.example}"\n`;
                }
              });
            }
            
            // Add synonyms
            if (meaning.synonyms && meaning.synonyms.length > 0) {
              exportContent += "Synonyms: " + meaning.synonyms.join(", ") + "\n";
            }
            
            // Add antonyms
            if (meaning.antonyms && meaning.antonyms.length > 0) {
              exportContent += "Antonyms: " + meaning.antonyms.join(", ") + "\n";
            }
          });
        }
        
        exportContent += "\n----------------------------\n\n";
      }
      
      const blob = new Blob([exportContent], {type: 'text/plain'});
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = 'kings-of-vocab-export.txt';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  });
  
  // Clear all saved words
  clearBtn.addEventListener('click', function() {
    if (confirm('Are you sure you want to delete all saved words?')) {
      chrome.storage.sync.set({ savedWords: {} }, function() {
        loadWords();
        // Notify content scripts to update highlights
        chrome.tabs.query({}, function(tabs) {
          tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, { action: "updateHighlights" }).catch(() => {});
          });
        });
      });
    }
  });
  
  // Load words when popup opens
  loadWords();
});