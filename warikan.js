// warikan.js
// Handles Gemini AI OCR, Japanese translation maps, split selectors, manual entry forms, and settlement math

let currentLedger = [];
let currentScannedItems = [];
let currentTaxMultiplier = 1.0;

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

  // Ledger Table
  const ledgerBody = document.getElementById('ledger-body');
  
  // Statistics Elements
  const totalPaidB = document.getElementById('total-paid-b');
  const totalPaidR = document.getElementById('total-paid-r');
  const totalShared = document.getElementById('total-shared');
  const totalIndividual = document.getElementById('total-individual');
  const settlementBanner = document.getElementById('settlement-banner');

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

  loadLedger();

  // --- DRAG & DROP FILE LISTENERS ---
  function handleFileInput(file) {
    const key = localStorage.getItem('warikanGeminiKey');
    if (!key) {
      alert('⚠️ Please enter your Gemini API key in the sidebar first, then click "Save Key". You only need to do this once!');
      return;
    }
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

          const prompt = `You are analyzing a Japanese supermarket or convenience store receipt photo. Your job is to extract all purchase information.

CRITICAL INSTRUCTION: You MUST read the receipt image line-by-line from the top of the slip to the bottom. Extract every product in the exact sequence it appears vertically on the physical receipt paper. DO NOT stop extracting items until you have reached the final subtotal (小計) or grand total (合計) lines. Check the bottom of the list carefully so that no items (like salt, condiments, or fruits) are left out. DO NOT group items by category, price, or assignee. The items array in your JSON output MUST match the top-to-bottom vertical order of the printed receipt, line by line.

IMPORTANT: Look at the image carefully. Find every product line that has a price next to it.

Extract the following:
1. store - The name of the store (in English). If you can't read it, write "Japanese Supermarket".
2. date - The purchase date in YYYY-MM-DD format. Look for numbers that could be a date. If not found, use: ${new Date().toISOString().slice(0, 10)}
3. items - A list of every product purchased.

For each item:
- japanese: the original Japanese text on the receipt (copy exactly as shown)
- english: translate the item name to clear English. Be specific (e.g., "Whole Milk 1L" not just "Milk")
- price: the price as a whole number integer (Yen only, no decimals)
- assignedTo: one of these three values only: "shared" (household items, food ingredients, cleaning supplies, toiletries), "Bishnu" (beer, alcohol, energy drinks, snacks for one person), or "Radha" (cosmetics, skincare, feminine hygiene)

Rules:
- Include EVERY single item you can see with a price, making sure not to skip the last items at the bottom.
- Extract and list the items in the EXACT SAME ORDER as they appear from top to bottom on the receipt. Do not re-order, sort, or skip any items.
- If an item repeats, include it multiple times
- Ignore totals, taxes, subtotals, and discounts (lines like 合計, 小計, 消費税, 割引)
- Default to "shared" if unsure about assignedTo
- prices must be plain integers like 198, not "198円" or "¥198"

Respond with ONLY a raw JSON object — no markdown, no explanation, no backticks. Just the JSON:
{"store":"AEON","date":"2026-05-28","items":[{"japanese":"牛乳","english":"Whole Milk 1L","price":198,"assignedTo":"shared"}]}`;

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
      receiptPayer.value = "Bishnu";
      currentScannedItems = parsedData.items;

      // Reset tax multiplier to default (no tax added / 1.0)
      currentTaxMultiplier = 1.0;
      [taxBtnNone, taxBtn8].forEach(btn => {
        if (btn) btn.classList.remove('active');
      });
      if (taxBtnNone) taxBtnNone.classList.add('active');

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
    
    receiptPayer.value = "Bishnu";
    
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
        receiptPayer.value = template.paidBy;
        currentScannedItems = template.items;
        
        // Reset tax multiplier to default (no tax added / 1.0)
        currentTaxMultiplier = 1.0;
        [taxBtnNone, taxBtn8].forEach(btn => {
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

      // English inputs change hook
      tr.querySelector('.edit-english').addEventListener('change', (e) => {
        const idx = parseInt(e.target.getAttribute('data-index'));
        currentScannedItems[idx].english = e.target.value;
      });

      // Price inputs change hook
      tr.querySelector('.edit-price').addEventListener('change', (e) => {
        const idx = parseInt(e.target.getAttribute('data-index'));
        const newPrice = Math.abs(parseInt(e.target.value) || 0);
        // Save base price by dividing by currentTaxMultiplier
        currentScannedItems[idx].price = Math.round(newPrice / currentTaxMultiplier);
      });

      receiptItemsBody.appendChild(tr);
    });
  }

  // --- SAVE SCANNED ITEMS TO LEDGER ---
  btnCommitReceipt.addEventListener('click', () => {
    // Check if there are any unassigned items left
    const unassignedCount = currentScannedItems.filter(i => i.assignedTo === 'unassigned').length;
    if (unassignedCount > 0) {
      alert(`Please assign who owns the ${unassignedCount} highlighted unassigned item(s) before saving!`);
      return;
    }

    const payer = receiptPayer.value;
    const store = receiptStoreName.innerText;
    const selectedDate = receiptDateInput.value || new Date().toISOString().slice(0, 10);
    const syncUrl = localStorage.getItem('warikanSyncUrl');

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
          assignedTo: item.assignedTo
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
            assignedTo: item.assignedTo
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
          assignedTo: item.assignedTo
        });
      });
      saveLedger();
      alert('All receipt items successfully itemized and committed to your monthly ledger!');
    }

    sectionReceiptEditor.style.display = 'none';
    currentScannedItems = [];
  });

  btnCancelReceipt.addEventListener('click', () => {
    if (confirm('Cancel scan? Scanned lines will be lost.')) {
      sectionReceiptEditor.style.display = 'none';
      currentScannedItems = [];
    }
  });

  // --- TAX MODE SELECTION HANDLERS ---
  function setTaxMultiplier(multiplier, activeBtn) {
    currentTaxMultiplier = multiplier;
    [taxBtnNone, taxBtn8].forEach(btn => {
      if (btn) btn.classList.remove('active');
    });
    if (activeBtn) activeBtn.classList.add('active');
    renderReceiptEditor();
  }

  if (taxBtnNone) taxBtnNone.addEventListener('click', () => setTaxMultiplier(1.0, taxBtnNone));
  if (taxBtn8) taxBtn8.addEventListener('click', () => setTaxMultiplier(1.08, taxBtn8));

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
    const payer = document.getElementById('manual-payer').value;
    const desc = document.getElementById('manual-store').value.trim();
    const cost = parseInt(document.getElementById('manual-cost').value);
    const split = document.getElementById('manual-split').value;

    const newItem = {
      date: date,
      store: desc,
      paidBy: payer,
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

  // --- LEDGER CONTROLLER & MATH ENGINE ---
  function loadLedger() {
    const raw = localStorage.getItem('warikanLedger');
    if (raw) {
      currentLedger = JSON.parse(raw);
    } else {
      currentLedger = [];
    }
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

    currentLedger.forEach(item => {
      const cost = item.cost;
      
      // 1. Calculate Payer totals
      if (item.paidBy === 'Bishnu') {
        paidB += cost;
      } else {
        paidR += cost;
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

    if (currentLedger.length === 0) {
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

  // --- RENDER DYNAMIC HISTORICAL LEDGER TABLE ---
  function renderLedgerTable() {
    ledgerBody.innerHTML = '';

    if (currentLedger.length === 0) {
      ledgerBody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; color: var(--text-dim); padding: 40px;">
            No expenses logged yet. Try loading a mock receipt above!
          </td>
        </tr>
      `;
      return;
    }

    // Sort descending by date
    const sorted = [...currentLedger].sort((a, b) => new Date(b.date) - new Date(a.date));

    sorted.forEach((item, sortedIndex) => {
      // Find index in main currentLedger array to delete accurately
      const mainIndex = currentLedger.findIndex(x => x === item);
      const tr = document.createElement('tr');

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

      tr.innerHTML = `
        <td style="color: var(--text-muted); font-size:12px;">${item.date}</td>
        <td style="font-weight: 500;">${escapeHTML(item.store)}</td>
        <td style="text-align: center;">
          <span class="avatar ${item.paidBy === 'Bishnu' ? 'avatar-b' : 'avatar-r'}">${item.paidBy[0]}</span>
        </td>
        <td style="text-align: right; font-weight:700;">¥${item.cost.toLocaleString()}</td>
        <td style="text-align: center;">
          <span class="ledger-badge ${badgeClass}">${splitText}</span>
        </td>
        <td style="text-align: right; color:#818cf8;">¥${Math.round(bShare).toLocaleString()}</td>
        <td style="text-align: right; color:#f472b6;">¥${Math.round(rShare).toLocaleString()}</td>
        <td style="text-align: center;">
          <button class="btn-trash" data-index="${mainIndex}" title="Delete expense">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </td>
      `;

      tr.querySelector('.btn-trash').addEventListener('click', (e) => {
        const idx = parseInt(e.currentTarget.getAttribute('data-index'));
        deleteLedgerItem(idx);
      });

      ledgerBody.appendChild(tr);
    });
  }

  // --- DELETE TRANSACTION ACTION ---
  function deleteLedgerItem(index) {
    if (confirm('Delete this expense?')) {
      currentLedger.splice(index, 1);
      saveLedger();
    }
  }

  // --- RESET ALL LEDGER DATA ---
  btnClearLedger.addEventListener('click', () => {
    if (confirm('Are you absolutely sure you want to reset this month\'s ledger? All records will be wiped.')) {
      currentLedger = [];
      saveLedger();
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
