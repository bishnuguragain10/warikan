// warikan.js
// Handles Gemini AI OCR, Japanese translation maps, split selectors, manual entry forms, and settlement math

let currentLedger = [];
let currentScannedItems = [];
let currentTaxMultiplier = 1.0;
let currentReceiptPhotoBase64 = null; // Temp storage for scanned receipt image

// --- INDEXEDDB HELPER FOR RECEIPT PHOTOS ---
const DB_NAME = 'WarikanDB';
const DB_VERSION = 1;
const STORE_NAME = 'receipt_photos';

function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function saveReceiptPhoto(id, base64Data) {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put({ id: id, photo: base64Data });
      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error("IndexedDB error saving photo:", err);
  }
}

async function getReceiptPhoto(id) {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);
      request.onsuccess = (e) => resolve(e.target.result ? e.target.result.photo : null);
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error("IndexedDB error getting photo:", err);
    return null;
  }
}

async function deleteReceiptPhoto(id) {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);
      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error("IndexedDB error deleting photo:", err);
  }
}

// Local Japanese Translation & Assignment Heuristics Map
const JPN_DICTIONARY = {
  "牛乳": { english: "Milk", category: "shared" },
  "食パン": { english: "Sliced Bread", category: "shared" },
  "パン": { english: "Pastry/Bread", category: "shared" },
  "ビール": { english: "Beer", category: "Bishnu" },
  "酒": { english: "Alcohol", category: "Bishnu" },
  "化粧水": { english: "Skin Lotion", category: "Radha" },
  "コスメ": { english: "Cosmetics", category: "Radha" },
  "卵": { english: "Eggs", category: "shared" },
  "トイレットペーパー": { english: "Toilet Paper", category: "shared" },
  "洗剤": { english: "Detergent", category: "shared" },
  "シャンプー": { english: "Shampoo", category: "shared" },
  "リンス": { english: "Hair Conditioner", category: "shared" },
  "醤油": { english: "Soy Sauce", category: "shared" },
  "塩": { english: "Salt", category: "shared" },
  "肉": { english: "Meat", category: "shared" },
  "豚肉": { english: "Pork", category: "shared" },
  "牛肉": { english: "Beef", category: "shared" },
  "鶏肉": { english: "Chicken", category: "shared" },
  "水": { english: "Bottled Water", category: "shared" },
  "茶": { english: "Green Tea", category: "shared" },
  "ポテトチップス": { english: "Potato Chips", category: "shared" },
  "おにぎり": { english: "Onigiri (Rice Ball)", category: "unassigned" },
  "弁当": { english: "Bento Box", category: "unassigned" },
  "カップヌードル": { english: "Cup Noodles", category: "shared" },
  "ラーメン": { english: "Ramen", category: "shared" },
  "ティッシュ": { english: "Kleenex Tissues", category: "shared" },
  "ゴミ袋": { english: "Trash Bags", category: "shared" }
};

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const ocrLoader = document.getElementById('ocr-loader');
  const ocrProgress = document.getElementById('ocr-progress');
  
  // Scanned receipt editor
  const sectionReceiptEditor = document.getElementById('section-receipt-editor');
  const receiptStoreName = document.getElementById('receipt-store-name');
  const receiptDateInput = document.getElementById('receipt-date');
  const receiptPayer = document.getElementById('receipt-payer');
  const receiptItemsBody = document.getElementById('receipt-items-body');
  const btnCommitReceipt = document.getElementById('btn-commit-receipt');
  const btnCancelReceipt = document.getElementById('btn-cancel-receipt');

  // Tax Mode elements
  const taxBtnNone = document.getElementById('tax-btn-none');
  const taxBtn8 = document.getElementById('tax-btn-8');
  const taxBtn10 = document.getElementById('tax-btn-10');

  // Ledger Table
  const ledgerBody = document.getElementById('ledger-body');
  
  // Statistics Elements
  const totalPaidB = document.getElementById('total-paid-b');
  const totalPaidR = document.getElementById('total-paid-r');
  const totalShared = document.getElementById('total-shared');
  const totalIndividual = document.getElementById('total-individual');
  const settlementBanner = document.getElementById('settlement-banner');

  // Month Filter Selector State
  const ledgerMonthFilter = document.getElementById('ledger-month-filter');
  let currentMonthFilter = 'all';

  // Manual Modal
  const manualModal = document.getElementById('manual-modal');
  const btnManualForm = document.getElementById('btn-manual-form');
  const closeManualModal = document.getElementById('close-manual-modal');
  const manualForm = document.getElementById('manual-form');

  // Main Actions
  const btnExportCsv = document.getElementById('btn-export-csv');
  const btnClearLedger = document.getElementById('btn-clear-ledger');
  


  // Cloud Sync Elements
  const sheetsSyncUrlInput = document.getElementById('sheets-sync-url');
  const btnSaveSync = document.getElementById('btn-save-sync');

  // Gemini AI Elements
  const geminiApiKeyInput = document.getElementById('gemini-api-key');
  const btnSaveGemini = document.getElementById('btn-save-gemini');

  // --- INITIAL RUN ---
  // Load saved Gemini Key from localStorage
  const savedGeminiKey = localStorage.getItem('warikanGeminiKey') || '';
  if (geminiApiKeyInput && savedGeminiKey) {
    geminiApiKeyInput.value = savedGeminiKey;
  }

  if (btnSaveGemini) {
    btnSaveGemini.addEventListener('click', () => {
      const key = geminiApiKeyInput.value.trim();
      if (key === '') {
        localStorage.removeItem('warikanGeminiKey');
        alert('API key cleared.');
        return;
      }
      localStorage.setItem('warikanGeminiKey', key);
      alert('✅ Gemini AI connected! You only need to do this once per browser.');
    });
  }

  // Load saved Sync URL
  const savedSyncUrl = localStorage.getItem('warikanSyncUrl') || '';
  if (sheetsSyncUrlInput) {
    sheetsSyncUrlInput.value = savedSyncUrl;
  }

  if (btnSaveSync) {
    btnSaveSync.addEventListener('click', () => {
      const url = sheetsSyncUrlInput.value.trim();
      if (url === '') {
        localStorage.removeItem('warikanSyncUrl');
        alert('Google Sheets Sync URL cleared.');
        loadLedger();
        return;
      }
      if (!url.startsWith('https://script.google.com/')) {
        alert('Invalid Web App URL. Must start with https://script.google.com/');
        return;
      }
      localStorage.setItem('warikanSyncUrl', url);
      alert('Google Sheets URL saved. Syncing with cloud...');
      fetchLedgerFromCloud();
    });
  }

  // --- LIGHTBOX RECEIPT PHOTO MODAL LISTENERS ---
  const lightboxModal = document.getElementById('lightbox-modal');
  const closeLightboxModal = document.getElementById('close-lightbox-modal');

  if (closeLightboxModal && lightboxModal) {
    closeLightboxModal.addEventListener('click', () => {
      lightboxModal.classList.remove('active');
    });
    
    window.addEventListener('click', (e) => {
      if (e.target === lightboxModal) {
        lightboxModal.classList.remove('active');
      }
    });
  }

  // Reset receipt payer selection on start to prevent browser autocomplete cache
  if (receiptPayer) {
    receiptPayer.value = "";
    receiptPayer.selectedIndex = 0;
  }

  // DEFEAT AGGRESSIVE BROWSER AUTOFILL: Password managers and Chrome autofill scripts
  // execute pre-fill routines a fraction of a second after DOMContentLoaded.
  // We place a reset call in the macro-task queue to overwrite and force it to empty.
  setTimeout(() => {
    if (receiptPayer) {
      receiptPayer.value = "";
      receiptPayer.selectedIndex = 0;
    }
  }, 150);

  // --- DYNAMIC MONTH GROUPING & FILTER POPULATION LOGIC ---
  function updateMonthSelector() {
    if (!ledgerMonthFilter) return;
    
    // 1. Scan dates in currentLedger and gather unique months (formatted like "YYYY-MM")
    const uniqueMonths = new Set();
    currentLedger.forEach(item => {
      if (item.date && item.date.length >= 7) {
        uniqueMonths.add(item.date.slice(0, 7)); // get YYYY-MM
      }
    });
    
    // 2. Sort months descending (most recent first)
    const sortedMonths = Array.from(uniqueMonths).sort().reverse();
    
    // 3. Keep track of current selected value to restore it
    const previousSelection = ledgerMonthFilter.value || 'all';
    
    // 4. Reset options
    ledgerMonthFilter.innerHTML = '<option value="all">📅 Show All Months</option>';
    
    // 5. Populate options dynamically
    sortedMonths.forEach(month => {
      const [year, monthNum] = month.split('-');
      const dateObj = new Date(year, parseInt(monthNum) - 1, 1);
      const monthLabel = dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
      
      const option = document.createElement('option');
      option.value = month;
      option.innerText = `📅 ${monthLabel}`;
      ledgerMonthFilter.appendChild(option);
    });
    
    // 6. Restore previous selection if still available, otherwise default to 'all'
    if (Array.from(ledgerMonthFilter.options).some(opt => opt.value === previousSelection)) {
      ledgerMonthFilter.value = previousSelection;
      currentMonthFilter = previousSelection;
    } else {
      ledgerMonthFilter.value = 'all';
      currentMonthFilter = 'all';
    }
  }

  // Bind change event to month filter
  if (ledgerMonthFilter) {
    ledgerMonthFilter.addEventListener('change', (e) => {
      currentMonthFilter = e.target.value;
      calculateSettlement();
      renderLedgerTable();
    });
  }

  loadLedger();

  // --- DRAG & DROP FILE LISTENERS ---
  function handleFileInput(file) {
    const key = localStorage.getItem('warikanGeminiKey');
    if (!key) {
      alert('⚠️ Please enter your Gemini API key in the sidebar first, then click "Save Key". You only need to do this once!');
      return;
    }

    // 1. Process and compress image for local IndexedDB cache
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1000; // Optimal width for text reading & performance
        let width = img.width;
        let height = img.height;
        
        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        // Compress as JPEG with 70% quality (retains crystal-clear text but extremely lightweight)
        currentReceiptPhotoBase64 = canvas.toDataURL('image/jpeg', 0.7);
        console.log("Compressed receipt image stored (length:", currentReceiptPhotoBase64.length, ")");
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);

    // 2. Proceed with Gemini OCR
    parseReceiptWithGemini(file, key);
  }

  dropZone.addEventListener('click', () => fileInput.click());
  
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileInput(e.target.files[0]);
    }
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = 'var(--primary)';
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.style.borderColor = 'rgba(255, 255, 255, 0.1)';
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = 'rgba(255, 255, 255, 0.1)';
    if (e.dataTransfer.files.length > 0) {
      handleFileInput(e.dataTransfer.files[0]);
    }
  });



  // Helper to convert file to Base64
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64String = reader.result.split(',')[1];
        resolve(base64String);
      };
      reader.onerror = error => reject(error);
      reader.readAsDataURL(file);
    });
  }

  // Preferred models in order — auto-discovery will pick first available one
  const PREFERRED_MODELS = [
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-flash-lite-latest',
    'gemini-flash-latest',
    'gemini-1.5-flash',
    'gemini-1.5-flash-8b',
    'gemini-1.5-pro',
    'gemini-pro-vision'
  ];

  // Discover which models are actually available for this API key, ordered by preference
  async function getOrderedModelsToTry(apiKey) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to list models');
      
      const availableModels = (data.models || [])
        .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
        .map(m => m.name.replace('models/', ''));
      
      console.log('Available models for this API key:', availableModels);
      
      // Order available models based on our preference list
      const orderedToTry = [];
      for (const preferred of PREFERRED_MODELS) {
        if (availableModels.includes(preferred)) {
          orderedToTry.push(preferred);
        }
      }
      
      // Add any other available models that support generateContent but aren't in our preference list
      for (const model of availableModels) {
        if (!orderedToTry.includes(model)) {
          orderedToTry.push(model);
        }
      }
      
      if (orderedToTry.length > 0) return orderedToTry;
      throw new Error('No generateContent-capable models found for this API key.');
    } catch (e) {
      console.warn('Model discovery failed, defaulting to preferred models list:', e);
      return PREFERRED_MODELS; // safe fallback
    }
  }

  // --- GEMINI MULTIMODAL AI OCR & TRANSLATION ENGINE ---
  async function parseReceiptWithGemini(file, apiKey) {
    ocrLoader.style.display = 'flex';
    ocrProgress.innerText = 'Gemini AI: detecting available models...';

    try {
      const base64Data = await fileToBase64(file);
      
      // Smart MIME type detection — mobile cameras often send '' or wrong type
      let mimeType = file.type;
      if (!mimeType || mimeType === '' || mimeType === 'application/octet-stream') {
        const name = file.name ? file.name.toLowerCase() : '';
        if (name.endsWith('.png')) mimeType = 'image/png';
        else if (name.endsWith('.gif')) mimeType = 'image/gif';
        else if (name.endsWith('.webp')) mimeType = 'image/webp';
        else mimeType = 'image/jpeg'; // Default safe fallback for all camera photos
      }
      
      // Auto-discover the best models available for this API key
      const modelsToTry = await getOrderedModelsToTry(apiKey);
      console.log('Ordered list of models to try:', modelsToTry);
      
      let parsedData = null;
      let lastError = null;

      for (let i = 0; i < modelsToTry.length; i++) {
        const chosenModel = modelsToTry[i];
        ocrProgress.innerText = `Gemini AI (${chosenModel}) is reading receipt... [Attempt ${i + 1}/${modelsToTry.length}]`;
        console.log(`Attempting OCR with model: ${chosenModel}`);

        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${chosenModel}:generateContent?key=${apiKey}`;

          const prompt = `You are a world-class multimodal AI engineer specializing in document parsing of dense supermarket receipts.
Your task is to extract every purchased product from a Japanese supermarket or convenience store receipt in their EXACT top-to-bottom vertical order with 100% accurate price-to-product pairing.

STRICT POSITIONAL INDEX-TO-INDEX MATCHING PROTOCOL:
Receipts have two main vertical columns: product names on the left, and matching line-item prices on the far right. 
Because photos are often tilted or skewed, standard horizontal scanning fails. You MUST use a strict positional sequence index matching protocol:

1. LEFT COLUMN SCAN:
   Scan the left side of the receipt vertically from top to bottom. Identify and extract every purchased product name in a strict 1-based sequential array.
   List them as: Name 1, Name 2, ..., Name N.

2. RIGHT COLUMN SCAN:
   Scan the right side of the receipt vertically from top to bottom. Identify and extract every line-item price in a strict 1-based sequential array.
   List them as: Price 1, Price 2, ..., Price N.

3. STRICT 1-TO-1 INDEX PAIRING RULE:
   Pair the items STRICTLY by their vertical sequence index:
   - Name 1 MUST pair with Price 1.
   - Name 2 MUST pair with Price 2.
   - Name 3 MUST pair with Price 3.
   - ...
   - Name N MUST pair with Price N.
   This guarantees that if the first item printed on the receipt has a price of 188, Name 1 is paired with Price 1 (188) with 100% mathematical certainty, completely ignoring geometric paper tilts!

4. EXCLUDE SUMMARY BLOCKS:
   STOP scanning both columns the moment you reach the words "小計" (Subtotal), "合計" (Total), "割引" (Discount), "対象" (tax targets), or "お釣" (change). NEVER include subtotal prices, taxable target total numbers, or cash change in your right-column scan array.

JSON STRUCTURE RULES:
Your JSON output must contain these keys in this EXACT sequence:
1. "store": The merchant name in English (e.g., "AEON", "Gyomu Super", "7-Eleven"). If unknown, use "Japanese Supermarket".
2. "date": The purchase date in YYYY-MM-DD format. Look for the printed date on the receipt. If missing, use: ${new Date().toISOString().slice(0, 10)}
3. "taxRate": Look at the tax summary lines at the very bottom. If a wholesome tax is added to the prices (exclusive tax system), output 8 or 10. If tax is already included in printed prices (税込), or there is no tax, output 0.
4. "left_column_names": Sequential array of extracted Japanese product names from top to bottom.
5. "right_column_prices": Sequential array of extracted line-item prices (integers) from top to bottom.
6. "items": Clean array of paired item objects, built by strictly matching "left_column_names[i]" to "right_column_prices[i]" 1-to-1.

For each item object in the "items" array:
- "japanese": The original Japanese name (strip tax rate symbols like "*" or "軽" completely, e.g. "たまご 軽" should be extracted as "たまご").
- "english": Specific English translation (e.g. "Whole Milk 1L" instead of just "Milk").
- "price": The exact paired line-item price as a clean integer (Yen only, no decimals, no currency symbols).
- "assignedTo": Split suggestion - "shared" (general groceries, milk, eggs, bread, household cleaning supplies, veggies), "Bishnu" (beers, alcohol, energy drinks, single-serving snacks), or "Radha" (cosmetics, skincare, beauty products). Default to "shared" if unsure.

Respond with ONLY a raw, minified JSON object matching this schema. No markdown wrappers, no explaining, no backticks, no text wrappers.
Example JSON structure:
{
  "store": "AEON",
  "date": "2026-05-28",
  "taxRate": 8,
  "left_column_names": ["牛乳 1L", "ビール缶"],
  "right_column_prices": [198, 220],
  "items": [
    {"japanese":"牛乳 1L","english":"Whole Milk 1L","price":198,"assignedTo":"shared"},
    {"japanese":"ビール缶","english":"Beer Can","price":220,"assignedTo":"Bishnu"}
  ]
}`;

          const payload = {
            contents: [
              {
                parts: [
                  { text: prompt },
                  {
                    inlineData: {
                      mimeType: mimeType,
                      data: base64Data
                    }
                  }
                ]
              }
            ],
            generationConfig: {
              temperature: 0.1,
              topP: 0.8,
              maxOutputTokens: 2048
            }
          };

          ocrProgress.innerText = `Gemini AI is analyzing layout & items with ${chosenModel}...`;

          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
          });

          const responseData = await response.json();
          
          // Check for API-level errors (wrong key, quota, etc.)
          if (!response.ok) {
            const errMsg = responseData.error?.message || `API Error ${response.status}`;
            throw new Error(`Gemini API Error: ${errMsg}`);
          }
          
          if (!responseData.candidates || responseData.candidates.length === 0) {
            const blockReason = responseData.promptFeedback?.blockReason || "Unknown";
            throw new Error(`Gemini blocked the request. Reason: ${blockReason}`);
          }

          let aiText = responseData.candidates[0].content.parts[0].text.trim();
          console.log(`Raw Gemini AI response (${chosenModel}):`, aiText);

          // Robust JSON extraction
          try {
            parsedData = JSON.parse(aiText);
          } catch (_e1) {
            const cleaned = aiText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
            try {
              parsedData = JSON.parse(cleaned);
            } catch (_e2) {
              const jsonMatch = aiText.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                parsedData = JSON.parse(jsonMatch[0]);
              } else {
                throw new Error("No JSON structure found in response.");
              }
            }
          }
          
          if (!parsedData.items || !Array.isArray(parsedData.items) || parsedData.items.length === 0) {
            throw new Error("Gemini could not find any items in the receipt image.");
          }

          console.log(`Successfully parsed receipt using model: ${chosenModel}`);
          break; // Exit the retry loop!

        } catch (error) {
          console.warn(`Model ${chosenModel} failed:`, error);
          lastError = error;
          // If we have more models, update the UI to show we are falling back
          if (i < modelsToTry.length - 1) {
            const nextModel = modelsToTry[i + 1];
            ocrProgress.innerText = `⚠️ ${chosenModel} busy/quota reached. Retrying with ${nextModel}...`;
            // Brief pause before retry
            await new Promise(r => setTimeout(r, 500));
          }
        }
      }

      if (!parsedData) {
        throw new Error(lastError ? lastError.message : "All available Gemini models failed to process the request.");
      }

      // Sanitize items — ensure prices are integers and assignedTo values are valid
      const validAssignees = ['shared', 'Bishnu', 'Radha'];
      parsedData.items = parsedData.items
        .map(item => ({
          japanese: item.japanese || '',
          english: item.english || 'Unknown Item',
          price: Math.abs(parseInt(String(item.price).replace(/[^0-9]/g, '')) || 0),
          assignedTo: validAssignees.includes(item.assignedTo) ? item.assignedTo : 'shared'
        }))
        .filter(item => item.price > 0); // Remove zero-price lines (totals, etc.)

      if (parsedData.items.length === 0) {
        throw new Error("No valid product prices found after cleaning. Try a clearer photo.");
      }

      ocrLoader.style.display = 'none';

      // Set editor UI state
      receiptStoreName.innerText = parsedData.store || "Scanned Store Bill";
      receiptDateInput.value = parsedData.date || new Date().toISOString().slice(0, 10);
      receiptPayer.value = "";
      receiptPayer.selectedIndex = 0;
      currentScannedItems = parsedData.items;

      // Auto-initialize tax selector from AI extraction
      const extractedTax = parseInt(parsedData.taxRate) || 0;
      console.log('AI Extracted Tax Rate:', extractedTax);
      
      [taxBtnNone, taxBtn8, taxBtn10].forEach(btn => {
        if (btn) btn.classList.remove('active');
      });

      if (extractedTax === 8) {
        currentTaxMultiplier = 1.08;
        if (taxBtn8) taxBtn8.classList.add('active');
      } else if (extractedTax === 10) {
        currentTaxMultiplier = 1.10;
        if (taxBtn10) taxBtn10.classList.add('active');
      } else {
        currentTaxMultiplier = 1.0;
        if (taxBtnNone) taxBtnNone.classList.add('active');
      }

      renderReceiptEditor();

    } catch (error) {
      ocrLoader.style.display = 'none';
      console.error('Gemini OCR Error:', error);
      const errorMsg = error.message || 'Unknown error';
      alert(`⚠️ Gemini AI could not scan this receipt.\n\nReason: ${errorMsg}\n\nTips:\n• Make sure the photo is clear and well-lit\n• Check your internet connection\n• Make sure your API key is from aistudio.google.com\n\nLoading AEON template as a demo example.`);
      loadMockTemplate(0);
    }
  }

  // --- TESSERACT CLIENT-SIDE OCR ENGINE ---
  async function processReceiptImage(file) {
    ocrLoader.style.display = 'flex';
    ocrProgress.innerText = "Initializing OCR engine...";

    try {
      // Create a local Tesseract worker targeting Japanese
      const worker = await Tesseract.createWorker({
        logger: m => {
          if (m.status === 'recognizing text') {
            ocrProgress.innerText = `Parsing Japanese characters: ${Math.round(m.progress * 100)}%`;
          }
        }
      });
      
      await worker.loadLanguage('jpn');
      await worker.initialize('jpn');
      
      // Run the image character recognition
      const { data: { text } } = await worker.recognize(file);
      await worker.terminate();
      
      ocrLoader.style.display = 'none';
      parseOcrText(text);
      
    } catch (error) {
      ocrLoader.style.display = 'none';
      console.error(error);
      alert("Error parsing image. Falling back to a mock template for demo safety.");
      // Fallback in case of sandboxed network block on CDN Tesseract worker files
      loadMockTemplate(0);
    }
  }

  // --- DATE EXTRACTION ENGINE (Extracts Japanese date formatting) ---
  function extractDateFromText(text) {
    // 1. Western YYYY/MM/DD or YYYY-MM-DD or YYYY.MM.DD
    const pattern1 = /(\d{4})[/\-\.](\d{1,2})[/\-\.](\d{1,2})/;
    const match1 = text.match(pattern1);
    if (match1) {
      const y = match1[1];
      const m = match1[2].padStart(2, '0');
      const d = match1[3].padStart(2, '0');
      return `${y}-${m}-${d}`;
    }

    // 2. Japanese Kanji YYYY年MM月DD日
    const pattern2 = /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/;
    const match2 = text.match(pattern2);
    if (match2) {
      const y = match2[1];
      const m = match2[2].padStart(2, '0');
      const d = match2[3].padStart(2, '0');
      return `${y}-${m}-${d}`;
    }

    // 3. Short Year YY/MM/DD (e.g. 26/05/28 or 26.05.28 - representing 2026)
    const pattern3 = /\b(\d{2})[/\-\.](\d{2})[/\-\.](\d{2})\b/;
    const match3 = text.match(pattern3);
    if (match3) {
      const y = "20" + match3[1];
      const m = match3[2].padStart(2, '0');
      const d = match3[3].padStart(2, '0');
      return `${y}-${m}-${d}`;
    }

    // Fallback: today YYYY-MM-DD
    return new Date().toISOString().slice(0, 10);
  }

  // --- HEURISTIC OCR TEXT PARSING ALGORITHM ---
  function parseOcrText(text) {
    const lines = text.split('\n');
    currentScannedItems = [];

    lines.forEach(line => {
      const cleanLine = line.trim();
      if (cleanLine.length < 3) return; // ignore short debris lines

      // Heuristic: Search for Yen amounts or prices at the end of the line (e.g. 240, 1,200, ¥350)
      const priceMatch = cleanLine.match(/[¥\\]?\s*([0-9,]{3,7})\s*$/);
      if (priceMatch) {
        const priceVal = parseInt(priceMatch[1].replace(/,/g, ''));
        
        // Remove the price values to isolate the product text name
        let jpnName = cleanLine.substring(0, priceMatch.index).trim();
        // Strip off common receipt characters like * 軽 %
        jpnName = jpnName.replace(/[¥\\*軽%•\-#]/g, '').trim();

        if (jpnName.length >= 2 && priceVal > 0) {
          // Attempt Japanese Translation & Auto-Assignment heuristics
          const translationResult = translateAndCategorize(jpnName);
          
          currentScannedItems.push({
            japanese: jpnName,
            english: translationResult.english,
            price: priceVal,
            assignedTo: translationResult.category,
            confidence: translationResult.category === 'unassigned' ? 'none' : 'high'
          });
        }
      }
    });

    if (currentScannedItems.length === 0) {
      alert("Could not extract any product prices from this photo. Loading AEON template as a guide.");
      loadMockTemplate(0);
      return;
    }

    // Set editor UI state
    receiptStoreName.innerText = "Scanned Supermarket / Store Bill";
    
    // Auto extract and prefill scanned date
    const scannedDate = extractDateFromText(text);
    receiptDateInput.value = scannedDate;
    
    receiptPayer.value = "";
    receiptPayer.selectedIndex = 0;
    
    renderReceiptEditor();
  }

  // --- DYNAMIC DICTIONARY LOOKUP & TRANSLATION ENGINE ---
  function translateAndCategorize(jpnText) {
    // Exact or partial match checks against JPN dictionary
    for (const key in JPN_DICTIONARY) {
      if (jpnText.toLowerCase().includes(key)) {
        return JPN_DICTIONARY[key];
      }
    }
    
    // Default fallback if no match found
    return { english: "Imported Grocery/Item", category: "unassigned" };
  }

  // --- LOAD SAMPLE TEMPLATES ---
  function loadMockTemplate(index) {
    // Fetch from mock_receipts.json template data
    fetch('mock_receipts.json')
      .then(res => res.json())
      .then(data => {
        const template = data[index];
        receiptStoreName.innerText = template.store;
        receiptDateInput.value = template.date;
        receiptPayer.value = "";
        receiptPayer.selectedIndex = 0;
        currentScannedItems = template.items;
        
        // Reset tax multiplier to default (no tax added / 1.0)
        currentTaxMultiplier = 1.0;
        [taxBtnNone, taxBtn8, taxBtn10].forEach(btn => {
          if (btn) btn.classList.remove('active');
        });
        if (taxBtnNone) taxBtnNone.classList.add('active');

        renderReceiptEditor();
      })
      .catch(err => {
        console.error('Error loading mock data:', err);
        alert('Could not load mock templates.');
      });
  }

  // --- CALCULATE SCANNED RECEIPT GRAND TOTAL ---
  function updateReceiptGrandTotal() {
    const grandTotalSpan = document.getElementById('receipt-grand-total');
    if (!grandTotalSpan) return;

    let total = 0;
    currentScannedItems.forEach(item => {
      total += Math.round(item.price * currentTaxMultiplier);
    });

    grandTotalSpan.innerText = total.toLocaleString();
  }

  // --- RENDER DYNAMIC CARD EDITOR SPLITTER ---
  function renderReceiptEditor() {
    receiptItemsBody.innerHTML = '';
    sectionReceiptEditor.style.display = 'block';
    
    // Scroll down to editor smoothly
    sectionReceiptEditor.scrollIntoView({ behavior: 'smooth' });

    currentScannedItems.forEach((item, index) => {
      const tr = document.createElement('tr');
      
      // Check if unassigned (shows orange highlight alert)
      if (item.assignedTo === 'unassigned') {
        tr.className = 'row-unassigned';
      }

      tr.innerHTML = `
        <td>
          ${item.assignedTo === 'unassigned' ? '<span class="warning-dot"></span>' : ''}
          ${escapeHTML(item.japanese)}
        </td>
        <td>
          <input type="text" class="edit-english" data-index="${index}" value="${escapeHTML(item.english)}" style="background:transparent; border:none; color:var(--text-muted); width:100%; font-size:13px; outline:none; border-bottom:1px dashed var(--border);">
        </td>
        <td style="text-align: right; font-weight:700;">
          <span style="color: var(--text-dim); font-size: 13px; font-weight:700; margin-right: 2px;">¥</span>
          <input type="number" class="edit-price" data-index="${index}" value="${Math.round(item.price * currentTaxMultiplier)}" style="background:transparent; border:none; color:var(--text); width:75px; font-size:13px; font-weight:700; text-align:right; outline:none; border-bottom:1px dashed var(--border); font-family:var(--font-body);">
        </td>
        <td style="text-align: center;">
          <div class="segment-control">
            <button class="segment-btn ${item.assignedTo === 'Bishnu' ? 'active' : ''}" data-index="${index}" data-split="Bishnu">Bishnu</button>
            <button class="segment-btn ${item.assignedTo === 'Radha' ? 'active' : ''}" data-index="${index}" data-split="Radha">Radha</button>
            <button class="segment-btn ${item.assignedTo === 'shared' ? 'active' : ''}" data-index="${index}" data-split="shared">👥 Shared</button>
          </div>
        </td>
        <td style="text-align: center;">
          <button class="btn-split-row" data-index="${index}" title="Split item price 50/50" style="background: rgba(168, 85, 247, 0.08); border: 1px solid rgba(168, 85, 247, 0.25); color: #c084fc; border-radius: 6px; padding: 4px 8px; font-size: 11px; font-weight:600; cursor: pointer; display: inline-flex; align-items: center; gap: 2px; transition: all 0.2s; outline: none;">
            ✂️ Split
          </button>
        </td>
      `;

      // Segment click choices
      tr.querySelectorAll('.segment-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const idx = parseInt(e.currentTarget.getAttribute('data-index'));
          const split = e.currentTarget.getAttribute('data-split');
          
          currentScannedItems[idx].assignedTo = split;
          
          // Re-render editor row dynamically to update active states
          tr.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
          e.currentTarget.classList.add('active');
          
          if (split !== 'unassigned') {
            tr.className = ''; // remove alert highlight
            const dot = tr.querySelector('.warning-dot');
            if (dot) dot.remove();
          }
        });
      });

      // Split button listener
      const btnSplit = tr.querySelector('.btn-split-row');
      if (btnSplit) {
        btnSplit.addEventListener('click', (e) => {
          const idx = parseInt(e.currentTarget.getAttribute('data-index'));
          const originalItem = currentScannedItems[idx];
          
          // Halve the original item's base price
          const halvedPrice = originalItem.price / 2;
          originalItem.price = halvedPrice;
          
          // Create duplicate item with halved price
          const duplicate = {
            japanese: originalItem.japanese + " (Split)",
            english: originalItem.english + " (Split)",
            price: halvedPrice,
            assignedTo: 'shared'
          };
          
          // Insert duplicate right below the original item in the scanned items array
          currentScannedItems.splice(idx + 1, 0, duplicate);
          
          // Re-render editor
          renderReceiptEditor();
        });
      }

      // English inputs change hook
      tr.querySelector('.edit-english').addEventListener('change', (e) => {
        const idx = parseInt(e.target.getAttribute('data-index'));
        currentScannedItems[idx].english = e.target.value;
      });

      // Price inputs real-time input hook
      tr.querySelector('.edit-price').addEventListener('input', (e) => {
        const idx = parseInt(e.target.getAttribute('data-index'));
        const newPrice = Math.abs(parseInt(e.target.value) || 0);
        // Save base price by dividing by currentTaxMultiplier
        currentScannedItems[idx].price = newPrice / currentTaxMultiplier;
        updateReceiptGrandTotal();
      });

      receiptItemsBody.appendChild(tr);
    });

    updateReceiptGrandTotal();
  }

  // --- SAVE SCANNED ITEMS TO LEDGER ---
  btnCommitReceipt.addEventListener('click', async () => {
    // Check if there are any unassigned items left
    const unassignedCount = currentScannedItems.filter(i => i.assignedTo === 'unassigned').length;
    if (unassignedCount > 0) {
      alert(`Please assign who owns the ${unassignedCount} highlighted unassigned item(s) before saving!`);
      return;
    }

    const payer = receiptPayer.value;
    if (!payer) {
      alert('⚠️ Please select who paid for this bill before saving!');
      return;
    }
    const store = receiptStoreName.innerText;
    const selectedDate = receiptDateInput.value || new Date().toISOString().slice(0, 10);
    const syncUrl = localStorage.getItem('warikanSyncUrl');

    // 1. Generate unique receipt ID and write photo to local IndexedDB
    const receiptId = currentReceiptPhotoBase64 ? 'rcpt_' + Date.now() : '';
    if (receiptId && currentReceiptPhotoBase64) {
      await saveReceiptPhoto(receiptId, currentReceiptPhotoBase64);
    }

    if (syncUrl) {
      // Show loading overlay
      ocrLoader.style.display = 'flex';
      ocrProgress.innerText = "Syncing items to Google Sheets...";

      // Perform parallel POST requests to the Google Sheets Web App
      const promises = currentScannedItems.map(item => {
        const newItem = {
          date: selectedDate,
          store: `${store} - ${item.english} (${item.japanese})`,
          paidBy: payer,
          cost: Math.round(item.price * currentTaxMultiplier),
          assignedTo: item.assignedTo,
          receiptId: receiptId // Save receipt ID association in Google Sheets
        };
        return fetch(syncUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newItem)
        });
      });

      Promise.all(promises).then(() => {
        ocrLoader.style.display = 'none';
        fetchLedgerFromCloud();
        alert('All receipt items successfully synced directly to Google Sheets!');
      }).catch(err => {
        ocrLoader.style.display = 'none';
        console.error("Error syncing items to Google Sheets:", err);
        // Fallback: save locally
        currentScannedItems.forEach(item => {
          currentLedger.push({
            date: selectedDate,
            store: `${store} - ${item.english} (${item.japanese})`,
            paidBy: payer,
            cost: Math.round(item.price * currentTaxMultiplier),
            assignedTo: item.assignedTo,
            receiptId: receiptId
          });
        });
        saveLedger();
      });
    } else {
      // Commit itemized items locally
      currentScannedItems.forEach(item => {
        currentLedger.push({
          date: selectedDate,
          store: `${store} - ${item.english} (${item.japanese})`,
          paidBy: payer,
          cost: Math.round(item.price * currentTaxMultiplier),
          assignedTo: item.assignedTo,
          receiptId: receiptId
        });
      });
      saveLedger();
      alert('All receipt items successfully itemized and committed to your ledger!');
    }

    sectionReceiptEditor.style.display = 'none';
    currentScannedItems = [];
    currentReceiptPhotoBase64 = null; // Clear image buffer
  });

  btnCancelReceipt.addEventListener('click', () => {
    if (confirm('Cancel scan? Scanned lines will be lost.')) {
      sectionReceiptEditor.style.display = 'none';
      currentScannedItems = [];
      currentReceiptPhotoBase64 = null; // Clear image buffer
    }
  });

  // --- TAX MODE SELECTION HANDLERS ---
  function setTaxMultiplier(multiplier, activeBtn) {
    currentTaxMultiplier = multiplier;
    [taxBtnNone, taxBtn8, taxBtn10].forEach(btn => {
      if (btn) btn.classList.remove('active');
    });
    if (activeBtn) activeBtn.classList.add('active');
    renderReceiptEditor();
  }

  if (taxBtnNone) taxBtnNone.addEventListener('click', () => setTaxMultiplier(1.0, taxBtnNone));
  if (taxBtn8) taxBtn8.addEventListener('click', () => setTaxMultiplier(1.08, taxBtn8));
  if (taxBtn10) taxBtn10.addEventListener('click', () => setTaxMultiplier(1.10, taxBtn10));

  // --- PROFILE MENU DROPDOWN HANDLER (Dynamic Reparenting) ---
  const profileMenuBtn = document.getElementById('profile-menu-btn');
  const profileMenuBtnMobile = document.getElementById('profile-menu-btn-mobile');
  const profileDropdown = document.getElementById('profile-dropdown');
  const desktopContainer = document.getElementById('desktop-profile-container');
  const mobileContainer = document.getElementById('mobile-profile-container');

  function toggleDropdown(button, targetContainer) {
    if (!profileDropdown || !targetContainer) return;
    
    const isVisible = profileDropdown.style.display === 'block' && profileDropdown.parentElement === targetContainer;
    
    if (isVisible) {
      profileDropdown.style.display = 'none';
    } else {
      // Append to the active container dynamically so it anchors correctly
      targetContainer.appendChild(profileDropdown);
      profileDropdown.style.display = 'block';
      
      // Fun active pulse micro-animation
      button.style.transform = 'scale(0.95)';
      setTimeout(() => button.style.transform = 'scale(1)', 100);
    }
  }

  if (profileMenuBtn && desktopContainer) {
    profileMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDropdown(profileMenuBtn, desktopContainer);
    });
  }

  if (profileMenuBtnMobile && mobileContainer) {
    profileMenuBtnMobile.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDropdown(profileMenuBtnMobile, mobileContainer);
    });
  }

  // Close dropdown when clicking anywhere outside
  document.addEventListener('click', (e) => {
    if (profileDropdown && !profileDropdown.contains(e.target)) {
      if (profileMenuBtn && (e.target === profileMenuBtn || profileMenuBtn.contains(e.target))) return;
      if (profileMenuBtnMobile && (e.target === profileMenuBtnMobile || profileMenuBtnMobile.contains(e.target))) return;
      profileDropdown.style.display = 'none';
    }
  });

  // --- MANUAL EXPENSE ENTRY ACTION ---
  btnManualForm.addEventListener('click', () => {
    // Default today's date in form input
    document.getElementById('manual-date').value = new Date().toISOString().slice(0, 10);
    manualModal.classList.add('active');
  });

  closeManualModal.addEventListener('click', () => manualModal.classList.remove('active'));

  window.addEventListener('click', (e) => {
    if (e.target === manualModal) manualModal.classList.remove('active');
  });

  manualForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const date = document.getElementById('manual-date').value;
    const paidB = parseInt(document.getElementById('manual-paid-b').value) || 0;
    const paidR = parseInt(document.getElementById('manual-paid-r').value) || 0;
    const desc = document.getElementById('manual-store').value.trim();
    const cost = paidB + paidR;
    const split = document.getElementById('manual-split').value;
    
    if (cost === 0) {
      alert("Total paid cannot be 0.");
      return;
    }

    let payer = 'Custom';
    if (paidB > 0 && paidR === 0) payer = 'Bishnu';
    if (paidR > 0 && paidB === 0) payer = 'Radha';

    const newItem = {
      date: date,
      store: desc,
      paidBy: payer,
      paidB: paidB,
      paidR: paidR,
      cost: cost,
      assignedTo: split
    };

    const syncUrl = localStorage.getItem('warikanSyncUrl');
    if (syncUrl) {
      postExpenseToCloud(newItem);
    } else {
      currentLedger.push(newItem);
      saveLedger();
    }

    manualForm.reset();
    manualModal.classList.remove('active');
  });

  // Helper to generate a unique footprint for transactions to enable resilient filtering
  function getTransactionKey(item) {
    return `${item.date}_${item.store}_${item.cost}_${item.paidBy}`;
  }

  // --- CLOUD SYNCING FUNCTIONS (Google Sheets database) ---
  async function fetchLedgerFromCloud() {
    const syncUrl = localStorage.getItem('warikanSyncUrl');
    if (!syncUrl) return;

    settlementBanner.innerHTML = `
      <div class="settlement-loader">
        <div class="spinner" style="width:14px; height:16px;"></div>
        <span>Syncing Cloud Sheet...</span>
      </div>
    `;

    try {
      const response = await fetch(syncUrl);
      const data = await response.json();
      
      if (Array.isArray(data)) {
        currentLedger = data;
        localStorage.setItem('warikanLedger', JSON.stringify(currentLedger));
        updateMonthSelector(); // Refresh month selector options after cloud sync
        console.log("Successfully synced ledger from Google Sheets:", currentLedger);
      }
    } catch (error) {
      console.error("Error fetching ledger from Google Sheets:", error);
    } finally {
      calculateSettlement();
      renderLedgerTable();
    }
  }

  async function postExpenseToCloud(item) {
    const syncUrl = localStorage.getItem('warikanSyncUrl');
    if (!syncUrl) return;

    try {
      await fetch(syncUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(item)
      });
      console.log("Successfully posted expense to cloud:", item);
      
      // Pull latest from cloud to ensure perfect sync
      fetchLedgerFromCloud();
    } catch (error) {
      console.error("Error posting expense to cloud:", error);
      // Fail-safe: Save locally
      currentLedger.push(item);
      saveLedger();
    }
  }

  async function deleteExpenseFromCloud(item) {
    const syncUrl = localStorage.getItem('warikanSyncUrl');
    if (!syncUrl) return;

    settlementBanner.innerHTML = `
      <div class="settlement-loader">
        <div class="spinner" style="width:14px; height:16px;"></div>
        <span>Deleting from Cloud Sheet...</span>
      </div>
    `;

    try {
      await fetch(syncUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'delete',
          item: item
        })
      });
      console.log("Delete request posted to cloud for item:", item);
    } catch (error) {
      console.error("Error deleting expense from cloud:", error);
    } finally {
      calculateSettlement();
      renderLedgerTable();
    }
  }

  async function clearLedgerFromCloud() {
    const syncUrl = localStorage.getItem('warikanSyncUrl');
    if (!syncUrl) return;

    settlementBanner.innerHTML = `
      <div class="settlement-loader">
        <div class="spinner" style="width:14px; height:16px;"></div>
        <span>Clearing Cloud Sheet...</span>
      </div>
    `;

    try {
      await fetch(syncUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'clear'
        })
      });
      console.log("Clear request posted to cloud");
    } catch (error) {
      console.error("Error clearing ledger from cloud:", error);
    } finally {
      calculateSettlement();
      renderLedgerTable();
    }
  }

  // --- LEDGER CONTROLLER & MATH ENGINE ---
  function loadLedger() {
    const raw = localStorage.getItem('warikanLedger');
    if (raw) {
      currentLedger = JSON.parse(raw);
    } else {
      currentLedger = [];
    }
    updateMonthSelector(); // Populate months dropdown on load
    calculateSettlement();
    renderLedgerTable();

    // Automatically sync from cloud if linked
    const syncUrl = localStorage.getItem('warikanSyncUrl');
    if (syncUrl) {
      fetchLedgerFromCloud();
    }
  }

  function saveLedger() {
    localStorage.setItem('warikanLedger', JSON.stringify(currentLedger));
    updateMonthSelector(); // Refresh month filter options
    calculateSettlement();
    renderLedgerTable();
  }

  // --- THE SETTLEMENT MATH CALCULATOR ---
  function calculateSettlement() {
    let paidB = 0; // Total actually paid out of pocket by Bishnu
    let paidR = 0; // Total actually paid out of pocket by Radha
    let sharedSum = 0; // Total shared expenses
    let individualSum = 0; // Total direct individual expenses
    
    let oweB = 0; // What Bishnu is responsible for
    let oweR = 0; // What Radha is responsible for

    // Filter items based on selected month dropdown
    const filteredLedger = currentLedger.filter(item => {
      if (currentMonthFilter === 'all') return true;
      return item.date && item.date.startsWith(currentMonthFilter);
    });

    filteredLedger.forEach(item => {
      const cost = item.cost;
      
      // 1. Calculate Payer totals
      if (item.paidBy === 'Bishnu') {
        paidB += cost;
      } else if (item.paidBy === 'Radha') {
        paidR += cost;
      } else if (item.paidBy === 'Custom') {
        paidB += (item.paidB || 0);
        paidR += (item.paidR || 0);
      }

      // 2. Calculate Split responsibilities
      if (item.assignedTo === 'shared') {
        sharedSum += cost;
        oweB += cost / 2;
        oweR += cost / 2;
      } else if (item.assignedTo === 'Bishnu') {
        individualSum += cost;
        oweB += cost;
      } else if (item.assignedTo === 'Radha') {
        individualSum += cost;
        oweR += cost;
      }
    });

    // Update Stats text
    totalPaidB.innerText = `¥${paidB.toLocaleString()}`;
    totalPaidR.innerText = `¥${paidR.toLocaleString()}`;
    totalShared.innerText = `¥${sharedSum.toLocaleString()}`;
    totalIndividual.innerText = `¥${individualSum.toLocaleString()}`;

    // Net double-entry balance sheets:
    // Net Balance = Paid - Owed.
    const netB = paidB - oweB;
    const netR = paidR - oweR;

    settlementBanner.className = 'settlement-banner';

    if (filteredLedger.length === 0) {
      settlementBanner.className = 'settlement-banner settlement-even';
      settlementBanner.innerHTML = `
        <div class="settlement-title">Ledger is Empty</div>
        <div class="settlement-main" style="font-size:15px; color:var(--text-dim);">No transactions logged</div>
        <div class="settlement-sub">Upload a Japanese receipt above to begin!</div>
      `;
      return;
    }

    // Render credit state visual boards
    if (Math.abs(netB) < 1) {
      settlementBanner.className = 'settlement-banner settlement-even';
      settlementBanner.innerHTML = `
        <div class="settlement-title">Perfectly Balanced</div>
        <div class="settlement-main" style="color:var(--success);">¥0 Difference</div>
        <div class="settlement-sub">Radha and Bishnu have completely clear accounts!</div>
      `;
    } else if (netB > 0) {
      // Bishnu is in positive credit. Radha is in negative debt.
      // Radha must pay Bishnu the credit difference!
      settlementBanner.classList.add('settlement-b-credit');
      settlementBanner.innerHTML = `
        <div class="settlement-title">Account Settle Result</div>
        <div class="settlement-main">Radha owes Bishnu</div>
        <div style="font-size: 26px; font-weight:800; color:#34d399; margin: 4px 0;">¥${Math.round(netB).toLocaleString()}</div>
        <div class="settlement-sub">Give this to Bishnu to clear this month's account.</div>
      `;
    } else {
      // Radha is in positive credit. Bishnu is in negative debt.
      // Bishnu must pay Radha the absolute debt difference!
      const debtAmount = Math.abs(netB);
      settlementBanner.classList.add('settlement-r-credit');
      settlementBanner.innerHTML = `
        <div class="settlement-title">Account Settle Result</div>
        <div class="settlement-main">Bishnu owes Radha</div>
        <div style="font-size: 26px; font-weight:800; color:#f472b6; margin: 4px 0;">¥${Math.round(debtAmount).toLocaleString()}</div>
        <div class="settlement-sub">Give this to Radha to clear this month's account.</div>
      `;
    }
  }

  // --- DELETE ENTIRE RECEIPT (All matching items) ---
  async function deleteLedgerReceipt(receiptId) {
    if (confirm('Delete this entire receipt and all its items?')) {
      const syncUrl = localStorage.getItem('warikanSyncUrl');
      
      // 1. Gather all items to delete in background
      const itemsToDelete = currentLedger.filter(item => item.receiptId === receiptId);
      
      // 2. Local filter-out and save instantly to prevent race conditions
      currentLedger = currentLedger.filter(item => item.receiptId !== receiptId);
      saveLedger();
      
      // 3. Dispatch background cloud sync deletions in parallel
      if (syncUrl) {
        itemsToDelete.forEach(item => {
          deleteExpenseFromCloud(item);
        });
      }
      
      // Clean up receipt photo binary
      if (receiptId) {
        await deleteReceiptPhoto(receiptId);
        console.log("Cleaned up receipt photo from IndexedDB for deleted receipt:", receiptId);
      }
    }
  }

  // --- RENDER DYNAMIC HISTORICAL LEDGER TABLE ---
  function renderLedgerTable() {
    ledgerBody.innerHTML = '';

    // Filter items based on selected month dropdown
    const filteredLedger = currentLedger.filter(item => {
      if (currentMonthFilter === 'all') return true;
      return item.date && item.date.startsWith(currentMonthFilter);
    });

    if (filteredLedger.length === 0) {
      ledgerBody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; color: var(--text-dim); padding: 40px;">
            No expenses logged for this month filter.
          </td>
        </tr>
      `;
      return;
    }

    // Sort descending by date
    const sorted = [...filteredLedger].sort((a, b) => new Date(b.date) - new Date(a.date));

    // Group items by receiptId
    const groups = [];
    const groupMap = new Map();

    sorted.forEach(item => {
      const mainIndex = currentLedger.findIndex(x => x === item);
      
      if (item.receiptId) {
        if (!groupMap.has(item.receiptId)) {
          const g = {
            receiptId: item.receiptId,
            date: item.date,
            store: item.store.split(' - ')[0] || item.store,
            paidBy: item.paidBy,
            cost: 0,
            items: []
          };
          groups.push(g);
          groupMap.set(item.receiptId, g);
        }
        const g = groupMap.get(item.receiptId);
        g.cost += item.cost;
        g.items.push({ item, mainIndex });
      } else {
        // Independent item
        groups.push({
          receiptId: '',
          date: item.date,
          store: item.store,
          paidBy: item.paidBy,
          cost: item.cost,
          items: [{ item, mainIndex }]
        });
      }
    });

    groups.forEach(g => {
      if (g.receiptId) {
        // Render Group Parent Row
        let receiptBShare = 0;
        let receiptRShare = 0;
        const receiptAssignments = new Set();
        
        g.items.forEach(child => {
          let bShare = child.item.cost / 2;
          let rShare = child.item.cost / 2;
          if (child.item.assignedTo === 'Bishnu') {
            bShare = child.item.cost;
            rShare = 0;
          } else if (child.item.assignedTo === 'Radha') {
            bShare = 0;
            rShare = child.item.cost;
          }
          receiptBShare += bShare;
          receiptRShare += rShare;
          receiptAssignments.add(child.item.assignedTo || 'shared');
        });

        let groupSplitText = 'Shared';
        let groupBadgeClass = 'ledger-badge-s';
        
        if (receiptAssignments.size > 1) {
          groupSplitText = 'Mixed Split';
          groupBadgeClass = 'ledger-badge-mixed';
        } else if (receiptAssignments.has('Bishnu')) {
          groupSplitText = 'Bishnu (100%)';
          groupBadgeClass = 'ledger-badge-b';
        } else if (receiptAssignments.has('Radha')) {
          groupSplitText = 'Radha (100%)';
          groupBadgeClass = 'ledger-badge-r';
        }

        const parentTr = document.createElement('tr');
        parentTr.className = 'parent-row';
        parentTr.setAttribute('data-receipt-id', g.receiptId);

        parentTr.innerHTML = `
          <td style="color: var(--text-muted); font-size:12px;">${g.date}</td>
          <td style="font-weight: 600;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="accordion-toggle" id="toggle-${g.receiptId}">▶</span>
              <span>${escapeHTML(g.store)} <span style="font-size:10px; font-weight:600; color:var(--text-dim); background:rgba(255,255,255,0.04); border:1px solid var(--border); padding:1px 5px; border-radius:4px; margin-left:4px;">${g.items.length} items</span></span>
              ${g.receiptId ? `
                <button class="btn-view-receipt" data-receipt-id="${g.receiptId}" title="View original receipt photo" style="background: rgba(168, 85, 247, 0.1); border: 1px solid rgba(168, 85, 247, 0.3); color: #c084fc; border-radius: 4px; padding: 2px 6px; font-size: 10px; font-weight:600; cursor: pointer; display: inline-flex; align-items: center; gap: 2px; transition: all 0.2s;">
                  <span>📷</span> View
                </button>
              ` : ''}
            </div>
          </td>
          <td style="text-align: center;">
            ${g.paidBy === 'Custom' ? '<span class="avatar avatar-s" title="Split Contribution">👥</span>' : `<span class="avatar ${g.paidBy === 'Bishnu' ? 'avatar-b' : 'avatar-r'}">${g.paidBy[0]}</span>`}
          </td>
          <td style="text-align: right; font-weight:700;">¥${g.cost.toLocaleString()}</td>
          <td style="text-align: center;">
            <span class="ledger-badge ${groupBadgeClass}">${groupSplitText}</span>
          </td>
          <td style="text-align: right; color:#818cf8; font-weight:600;">¥${Math.round(receiptBShare).toLocaleString()}</td>
          <td style="text-align: right; color:#f472b6; font-weight:600;">¥${Math.round(receiptRShare).toLocaleString()}</td>
          <td style="text-align: center;">
            <button class="btn-trash btn-trash-parent" data-receipt-id="${g.receiptId}" title="Delete entire receipt">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </td>
        `;

        parentTr.querySelector('.btn-trash-parent').addEventListener('click', (e) => {
          e.stopPropagation();
          const rId = e.currentTarget.getAttribute('data-receipt-id');
          deleteLedgerReceipt(rId);
        });

        // Bind View Receipt Action on Parent Row
        const btnView = parentTr.querySelector('.btn-view-receipt');
        if (btnView) {
          btnView.addEventListener('click', async (e) => {
            e.stopPropagation();
            const rId = e.currentTarget.getAttribute('data-receipt-id');
            const photoBase64 = await getReceiptPhoto(rId);
            if (photoBase64) {
              document.getElementById('lightbox-img').src = photoBase64;
              document.getElementById('lightbox-modal').classList.add('active');
            } else {
              alert("⚠️ Receipt photo could not be found locally in this browser's cache.");
            }
          });
        }

        // Accordion slide listener
        parentTr.addEventListener('click', (e) => {
          if (e.target.closest('.btn-trash-parent') || e.target.closest('.btn-view-receipt')) {
            return;
          }
          const toggleSpan = parentTr.querySelector(`#toggle-${g.receiptId}`);
          const isExpanded = toggleSpan.classList.contains('expanded');
          const childRows = ledgerBody.querySelectorAll(`.child-of-${g.receiptId}`);
          
          childRows.forEach(row => {
            if (isExpanded) {
              row.classList.add('hidden');
            } else {
              row.classList.remove('hidden');
            }
          });

          if (isExpanded) {
            toggleSpan.classList.remove('expanded');
            toggleSpan.innerText = '▶';
          } else {
            toggleSpan.classList.add('expanded');
            toggleSpan.innerText = '▼';
          }
        });

        ledgerBody.appendChild(parentTr);

        // Render Child Rows for Group
        g.items.forEach(child => {
          const item = child.item;
          const mainIndex = child.mainIndex;
          
          let splitText = 'Shared';
          let badgeClass = 'ledger-badge-s';
          let bShare = item.cost / 2;
          let rShare = item.cost / 2;

          if (item.assignedTo === 'Bishnu') {
            splitText = 'Bishnu (100%)';
            badgeClass = 'ledger-badge-b';
            bShare = item.cost;
            rShare = 0;
          } else if (item.assignedTo === 'Radha') {
            splitText = 'Radha (100%)';
            badgeClass = 'ledger-badge-r';
            bShare = 0;
            rShare = item.cost;
          }

          const childTr = document.createElement('tr');
          childTr.className = `child-row child-of-${g.receiptId} hidden`;
          
          let cleanDesc = item.store;
          if (item.store.includes(' - ')) {
            cleanDesc = item.store.split(' - ').slice(1).join(' - ');
          }

          childTr.innerHTML = `
            <td style="color: var(--text-muted); font-size:12px; text-align: right;"></td>
            <td class="child-row-title">
              <span>${escapeHTML(cleanDesc)}</span>
            </td>
            <td style="text-align: center; color: var(--text-dim); font-size: 11px;">
              -
            </td>
            <td style="text-align: right; font-weight:500; color: var(--text-muted);">¥${item.cost.toLocaleString()}</td>
            <td style="text-align: center;">
              <span class="ledger-badge ${badgeClass}">${splitText}</span>
            </td>
            <td style="text-align: right; color:#818cf8; font-size: 13px;">¥${Math.round(bShare).toLocaleString()}</td>
            <td style="text-align: right; color:#f472b6; font-size: 13px;">¥${Math.round(rShare).toLocaleString()}</td>
            <td style="text-align: center;">
              <button class="btn-trash btn-trash-child" data-index="${mainIndex}" title="Delete this item only">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </td>
          `;

          childTr.querySelector('.btn-trash-child').addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(e.currentTarget.getAttribute('data-index'));
            deleteLedgerItem(idx);
          });

          ledgerBody.appendChild(childTr);
        });

      } else {
        // Flat independent item (standard row)
        const child = g.items[0];
        const item = child.item;
        const mainIndex = child.mainIndex;
        
        let splitText = 'Shared';
        let badgeClass = 'ledger-badge-s';
        let bShare = item.cost / 2;
        let rShare = item.cost / 2;

        if (item.assignedTo === 'Bishnu') {
          splitText = 'Bishnu (100%)';
          badgeClass = 'ledger-badge-b';
          bShare = item.cost;
          rShare = 0;
        } else if (item.assignedTo === 'Radha') {
          splitText = 'Radha (100%)';
          badgeClass = 'ledger-badge-r';
          bShare = 0;
          rShare = item.cost;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="color: var(--text-muted); font-size:12px;">${item.date}</td>
          <td style="font-weight: 500;">
            <span>${escapeHTML(item.store)}</span>
          </td>
          <td style="text-align: center;">
            ${item.paidBy === 'Custom' ? '<span class="avatar avatar-s" title="Split Contribution">👥</span>' : `<span class="avatar ${item.paidBy === 'Bishnu' ? 'avatar-b' : 'avatar-r'}">${item.paidBy[0]}</span>`}
          </td>
          <td style="text-align: right; font-weight:700;">¥${item.cost.toLocaleString()}</td>
          <td style="text-align: center;">
            <span class="ledger-badge ${badgeClass}">${splitText}</span>
          </td>
          <td style="text-align: right; color:#818cf8;">¥${Math.round(bShare).toLocaleString()}</td>
          <td style="text-align: right; color:#f472b6;">¥${Math.round(rShare).toLocaleString()}</td>
          <td style="text-align: center;">
            <button class="btn-trash btn-trash-single" data-index="${mainIndex}" title="Delete expense">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </td>
        `;

        tr.querySelector('.btn-trash-single').addEventListener('click', (e) => {
          const idx = parseInt(e.currentTarget.getAttribute('data-index'));
          deleteLedgerItem(idx);
        });

        ledgerBody.appendChild(tr);
      }
    });
  }

  // --- DELETE TRANSACTION ACTION ---
  async function deleteLedgerItem(index) {
    if (confirm('Delete this expense?')) {
      const itemToDelete = currentLedger[index];
      const rId = itemToDelete.receiptId;
      const syncUrl = localStorage.getItem('warikanSyncUrl');
      
      // 1. Instantly delete from local state and save to avoid race conditions
      currentLedger.splice(index, 1);
      saveLedger();

      // 2. Dispatch background cloud sync deletion
      if (syncUrl) {
        deleteExpenseFromCloud(itemToDelete);
      }

      // Garbage collect / clean up unused receipt photo from local storage
      if (rId) {
        const stillReferenced = currentLedger.some(item => item.receiptId === rId);
        if (!stillReferenced) {
          await deleteReceiptPhoto(rId);
          console.log("Cleaned up orphaned receipt photo from IndexedDB:", rId);
        }
      }
    }
  }

  // --- RESET ALL LEDGER DATA ---
  btnClearLedger.addEventListener('click', async () => {
    if (confirm('Are you absolutely sure you want to reset this month\'s ledger? All records will be wiped.')) {
      const syncUrl = localStorage.getItem('warikanSyncUrl');
      
      // 1. Wipe all local IndexedDB photo binaries
      currentLedger.forEach(async (item) => {
        if (item.receiptId) {
          await deleteReceiptPhoto(item.receiptId);
        }
      });

      // 2. Wipes local memory instantly
      currentLedger = [];
      saveLedger();

      // 3. Dispatch background cloud sheet clear
      if (syncUrl) {
        clearLedgerFromCloud();
      }
    }
  });

  // --- EXPORT TO CSV ENGINE ---
  btnExportCsv.addEventListener('click', () => {
    if (currentLedger.length === 0) {
      alert('Ledger is empty. Nothing to export.');
      return;
    }

    let csv = "data:text/csv;charset=utf-8,";
    csv += `"Date","Description","Paid By","Total Cost (Yen)","Split Assignment","Bishnu Share (Yen)","Radha Share (Yen)"\n`;

    currentLedger.forEach(item => {
      let bShare = item.cost / 2;
      let rShare = item.cost / 2;

      if (item.assignedTo === 'Bishnu') {
        bShare = item.cost;
        rShare = 0;
      } else if (item.assignedTo === 'Radha') {
        bShare = 0;
        rShare = item.cost;
      }

      const escapedDesc = (item.store || '').replace(/"/g, '""');
      csv += `"${item.date}","${escapedDesc}","${item.paidBy}",${item.cost},"${item.assignedTo}",${Math.round(bShare)},${Math.round(rShare)}\n`;
    });

    const encodedUri = encodeURI(csv);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `warikan_ledger_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    
    link.click();
    document.body.removeChild(link);
  });

  // Helper to escape HTML and prevent inject attacks
  function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
      tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      }[tag] || tag)
    );
  }
});
