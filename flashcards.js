document.addEventListener('DOMContentLoaded', function() {
    // Elements
    const flashcard = document.getElementById('flashcard');
    const flipBtn = document.getElementById('flipBtn');
    const nextBtn = document.getElementById('nextBtn');
    const prevBtn = document.getElementById('prevBtn');
    const knownBtn = document.getElementById('knownBtn');
    const reviewBtn = document.getElementById('reviewBtn');
    const sortOrder = document.getElementById('sortOrder');
    const backToPopup = document.getElementById('backToPopup');
    const progressBar = document.getElementById('progressBar');
    const currentIndexEl = document.getElementById('currentIndex');
    const totalCardsEl = document.getElementById('totalCards');
    const knownCountEl = document.getElementById('knownCount');
    const reviewCountEl = document.getElementById('reviewCount');
    // در انتهای تابع DOMContentLoaded، این کد را اضافه کنید
    const fullscreenBtn = document.getElementById('fullscreenBtn');

    fullscreenBtn.addEventListener('click', function() {
      if (!document.fullscreenElement) {
        // وارد شدن به حالت تمام صفحه
        document.documentElement.requestFullscreen().catch(err => {
          console.error(`Error attempting to enable fullscreen: ${err.message}`);
        });
      } else {
        // خروج از حالت تمام صفحه
        if (document.exitFullscreen) {
          document.exitFullscreen();
        }
      }
    });

    // رویداد تغییر حالت تمام صفحه
    document.addEventListener('fullscreenchange', function() {
      const fullscreenIcon = fullscreenBtn.querySelector('.fullscreen-icon');
      if (document.fullscreenElement) {
        fullscreenIcon.textContent = '⛶';
        fullscreenBtn.title = 'Exit fullscreen';
      } else {
        fullscreenIcon.textContent = '⛶';
        fullscreenBtn.title = 'Enter fullscreen';
      }
    });
    
    // State
    let words = [];
    let currentIndex = 0;
    let knownWords = {};
    let reviewWords = {};
    
    // Load saved words
    function loadWords() {
      chrome.storage.sync.get(['savedWords', 'flashcardState'], function(data) {
        const savedWords = data.savedWords || {};
        const savedState = data.flashcardState || {
          knownWords: {},
          reviewWords: {},
          lastSortOrder: 'random'
        };
        
        // Restore state
        knownWords = savedState.knownWords;
        reviewWords = savedState.reviewWords;
        sortOrder.value = savedState.lastSortOrder;
        
        // Convert object to array
        words = Object.keys(savedWords).map(word => {
          return {
            word: word,
            data: savedWords[word],
            timestamp: savedWords[word].timestamp || Date.now()
          };
        });
        
        // Apply sort
        sortWords();
        
        // Update UI
        updateStats();
        
        // Show first card if available
        if (words.length > 0) {
          showCard(0);
        } else {
          showEmptyState();
        }
      });
    }
    
    // Sort words based on selected order
    function sortWords() {
      const order = sortOrder.value;
      
      switch (order) {
        case 'alphabetical':
          words.sort((a, b) => a.word.localeCompare(b.word));
          break;
        case 'newest':
          words.sort((a, b) => b.timestamp - a.timestamp);
          break;
        case 'oldest':
          words.sort((a, b) => a.timestamp - b.timestamp);
          break;
        case 'random':
          // Fisher-Yates shuffle
          for (let i = words.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [words[i], words[j]] = [words[j], words[i]];
          }
          break;
      }
      
      // Reset index
      currentIndex = 0;
      
      // Save sort order
      saveState();
    }
    
    // Show empty state
    function showEmptyState() {
      const container = document.querySelector('.flashcard-container');
      container.innerHTML = `
        <div class="empty-state">
          <p>You haven't saved any words yet.</p>
          <button id="goSaveWords">Go Save Some Words</button>
        </div>
      `;
      
      document.getElementById('goSaveWords').addEventListener('click', function() {
        window.location.href = 'popup.html';
      });
      
      // Disable buttons
      flipBtn.disabled = true;
      nextBtn.disabled = true;
      prevBtn.disabled = true;
      knownBtn.disabled = true;
      reviewBtn.disabled = true;
      
      // Update stats
      updateStats();
    }
    
    // Show card at specific index
    function showCard(index) {
      if (words.length === 0) {
        showEmptyState();
        return;
      }
      
      // Ensure index is within bounds
      currentIndex = (index + words.length) % words.length;
      
      const wordObj = words[currentIndex];
      const wordData = wordObj.data;
      
      // Front of card
      const wordText = flashcard.querySelector('.word-text');
      const wordPhonetic = flashcard.querySelector('.word-phonetic');
      
      wordText.textContent = wordObj.word;
      wordPhonetic.textContent = wordData.phonetic || '';
      
      // Back of card
      const partOfSpeech = flashcard.querySelector('.part-of-speech');
      const definition = flashcard.querySelector('.definition');
      const example = flashcard.querySelector('.example');
      const synonyms = flashcard.querySelector('.synonyms');
      
      // Clear previous content
      partOfSpeech.textContent = '';
      definition.innerHTML = ''; // Changed to innerHTML to support formatting
      example.innerHTML = ''; // Changed to innerHTML to support formatting
      synonyms.innerHTML = ''; // Changed to innerHTML to support formatting
      
      // Add new content if available
      if (wordData.meanings && wordData.meanings.length > 0) {
        // Create a comprehensive definition that includes all meanings
        let definitionsHTML = '';
        let examplesHTML = '';
        let synonymsList = [];
        let antonymsList = [];
        
        // Process all meanings
        wordData.meanings.forEach((meaning, meaningIndex) => {
          if (meaning.partOfSpeech) {
            // Add part of speech header for each meaning
            definitionsHTML += `<div class="meaning-header">${meaning.partOfSpeech}</div>`;
            
            // Add definitions for this part of speech
            if (meaning.definitions && meaning.definitions.length > 0) {
              definitionsHTML += '<ol class="definitions-list">';
              
              meaning.definitions.forEach((def, defIndex) => {
                definitionsHTML += `<li>${def.definition}</li>`;
                
                // Collect examples
                if (def.example) {
                  examplesHTML += `<div class="example-item"><span class="example-pos">${meaning.partOfSpeech}:</span> "${def.example}"</div>`;
                }
              });
              
              definitionsHTML += '</ol>';
            }
            
            // Collect synonyms and antonyms
            if (meaning.synonyms && meaning.synonyms.length > 0) {
              synonymsList = [...synonymsList, ...meaning.synonyms];
            }
            
            if (meaning.antonyms && meaning.antonyms.length > 0) {
              antonymsList = [...antonymsList, ...meaning.antonyms];
            }
          }
        });
        
        // Display the first part of speech in the header
        partOfSpeech.textContent = wordData.meanings[0].partOfSpeech || '';
        
        // Set all definitions
        definition.innerHTML = definitionsHTML;
        
        // Set examples if any
        if (examplesHTML) {
          example.innerHTML = `<div class="examples-header">Examples:</div>${examplesHTML}`;
        }
        
        // Set synonyms and antonyms
        let relatedWordsHTML = '';
        
        if (synonymsList.length > 0) {
          // Remove duplicates and limit to 10
          const uniqueSynonyms = [...new Set(synonymsList)].slice(0, 10);
          relatedWordsHTML += `<div><strong>Synonyms:</strong> ${uniqueSynonyms.join(', ')}</div>`;
        }
        
        if (antonymsList.length > 0) {
          // Remove duplicates and limit to 10
          const uniqueAntonyms = [...new Set(antonymsList)].slice(0, 10);
          relatedWordsHTML += `<div><strong>Antonyms:</strong> ${uniqueAntonyms.join(', ')}</div>`;
        }
        
        synonyms.innerHTML = relatedWordsHTML;
      } else {
        // If no meanings available
        definition.innerHTML = '<div class="no-definition">Definition not available</div>';
      }
      
      // Reset card to front side
      flashcard.classList.remove('flipped');
      
      // Update UI
      updateStats();
      
      // Update feedback button states
      const currentWord = wordObj.word;
      knownBtn.classList.toggle('active', knownWords[currentWord]);
      reviewBtn.classList.toggle('active', reviewWords[currentWord]);
    }
    
    // Update statistics
    function updateStats() {
      // Update progress
      if (words.length > 0) {
        currentIndexEl.textContent = currentIndex + 1;
        totalCardsEl.textContent = words.length;
        progressBar.style.width = `${((currentIndex + 1) / words.length) * 100}%`;
      } else {
        currentIndexEl.textContent = 0;
        totalCardsEl.textContent = 0;
        progressBar.style.width = '0%';
      }
      
      // Update known/review counts
      const knownCount = Object.keys(knownWords).length;
      const reviewCount = Object.keys(reviewWords).length;
      
      knownCountEl.textContent = knownCount;
      reviewCountEl.textContent = reviewCount;
    }
    
    // Save current state
    function saveState() {
      chrome.storage.sync.set({
        flashcardState: {
          knownWords: knownWords,
          reviewWords: reviewWords,
          lastSortOrder: sortOrder.value
        }
      });
    }
    
    // Event Listeners
    flashcard.addEventListener('click', function() {
      flashcard.classList.toggle('flipped');
    });
    
    flipBtn.addEventListener('click', function() {
      flashcard.classList.toggle('flipped');
    });
    
    nextBtn.addEventListener('click', function() {
      showCard(currentIndex + 1);
    });
    
    prevBtn.addEventListener('click', function() {
      showCard(currentIndex - 1);
    });
    
    knownBtn.addEventListener('click', function() {
      if (words.length === 0) return;
      
      const currentWord = words[currentIndex].word;
      
      // Toggle known state
      if (knownWords[currentWord]) {
        delete knownWords[currentWord];
      } else {
        knownWords[currentWord] = true;
        // Remove from review if marked as known
        delete reviewWords[currentWord];
      }
      
      // Update UI
      knownBtn.classList.toggle('active', knownWords[currentWord]);
      reviewBtn.classList.toggle('active', reviewWords[currentWord]);
      
      // Save state
      saveState();
      updateStats();
      
      // Move to next card
      showCard(currentIndex + 1);
    });
    
    reviewBtn.addEventListener('click', function() {
      if (words.length === 0) return;
      
      const currentWord = words[currentIndex].word;
      
      // Toggle review state
      if (reviewWords[currentWord]) {
        delete reviewWords[currentWord];
      } else {
        reviewWords[currentWord] = true;
        // Remove from known if marked for review
        delete knownWords[currentWord];
      }
      
      // Update UI
      reviewBtn.classList.toggle('active', reviewWords[currentWord]);
      knownBtn.classList.toggle('active', knownWords[currentWord]);
      
      // Save state
      saveState();
      updateStats();
      
      // Move to next card
      showCard(currentIndex + 1);
    });
    
    sortOrder.addEventListener('change', function() {
      sortWords();
      showCard(0);
    });
    
    backToPopup.addEventListener('click', function() {
      window.location.href = 'popup.html';
    });
    
    // Keyboard navigation
    document.addEventListener('keydown', function(e) {
      switch (e.key) {
        case 'ArrowRight':
          showCard(currentIndex + 1);
          break;
        case 'ArrowLeft':
          showCard(currentIndex - 1);
          break;
        case ' ':
          flashcard.classList.toggle('flipped');
          break;
        case 'k':
          knownBtn.click();
          break;
        case 'r':
          reviewBtn.click();
          break;
      }
    });
    
    // Initialize
    loadWords();
  });