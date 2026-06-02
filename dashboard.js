// dashboard.js
// Handles list rendering, category filtering, search, modal control, manual additions, and CSV export

// --- HYBRID STORAGE ADAPTER ---
// Detects if running inside a Chrome Extension or a standard mobile/desktop web browser
const isExtension = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

function getStorageData(keys, callback) {
  if (isExtension) {
    chrome.storage.local.get(keys, callback);
  } else {
    const result = {};
    keys.forEach(key => {
      const val = localStorage.getItem(key);
      try {
        result[key] = val ? JSON.parse(val) : null;
      } catch (e) {
        result[key] = val;
      }
    });
    callback(result);
  }
}

function setStorageData(data, callback) {
  if (isExtension) {
    chrome.storage.local.set(data, callback);
  } else {
    Object.keys(data).forEach(key => {
      const val = typeof data[key] === 'string' ? data[key] : JSON.stringify(data[key]);
      localStorage.setItem(key, val);
    });
    if (callback) callback();
  }
}

let allSites = [];
let activeCategory = 'all';
let searchQuery = '';
let editingDomain = null;

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const platformGrid = document.getElementById('platform-grid');
  const emptyState = document.getElementById('empty-state');
  const searchInput = document.getElementById('search-input');
  const activeCategoryTitle = document.getElementById('active-category-title');
  const navItems = document.querySelectorAll('.nav-item');

  // Modals & Forms
  const addModal = document.getElementById('add-modal');
  const btnManualAdd = document.getElementById('btn-manual-add');
  const closeAddModal = document.getElementById('close-add-modal');
  const addForm = document.getElementById('add-form');

  const guideModal = document.getElementById('guide-modal');
  const openSyncGuide = document.getElementById('open-sync-guide');
  const closeGuideModal = document.getElementById('close-guide-modal');
  const btnCopyCode = document.getElementById('btn-copy-code');
  const codeSnippet = document.getElementById('code-snippet');
  
  const btnCsv = document.getElementById('btn-csv');
  const syncBadge = document.getElementById('sync-badge');
  const syncDesc = document.getElementById('sync-desc');

  // Settings & Mobile Sync elements
  const btnSettings = document.getElementById('btn-settings');
  const settingsModal = document.getElementById('settings-modal');
  const closeSettingsModal = document.getElementById('close-settings-modal');
  const sheetsWebhookUrlInput = document.getElementById('sheets-webhook-url');
  const btnSaveSync = document.getElementById('btn-save-sync');
  const modalSheetsWebhookUrlInput = document.getElementById('modal-sheets-webhook-url');
  const modalBtnSaveSync = document.getElementById('modal-btn-save-sync');
  const modalBtnGuide = document.getElementById('modal-btn-guide');

  // 1. Initial Load of Storage Data
  function loadData() {
    getStorageData(['savedSites', 'sheetsWebhookUrl'], (result) => {
      allSites = result.savedSites || [];
      const webhookUrl = result.sheetsWebhookUrl || "";

      // Update sheets connection banner status
      if (webhookUrl) {
        syncBadge.className = 'sync-dot active';
        syncDesc.innerHTML = 'Linked to Google Sheets. Updates sync in real-time.';
        if (sheetsWebhookUrlInput) sheetsWebhookUrlInput.value = webhookUrl;
        if (modalSheetsWebhookUrlInput) modalSheetsWebhookUrlInput.value = webhookUrl;
        fetchDataFromCloud(); // Auto pull from Google Sheet on startup!
      } else {
        syncBadge.className = 'sync-dot';
        syncDesc.innerHTML = 'Sync is inactive. Go to Connection Guide to link Google Sheets.';
      }

      calculateCategoryCounts();
      renderGrid();
    });
  }

  // Real-time Cloud Pull GET sync using secure JSONP (bypasses browser CORS blocks entirely)
  function fetchDataFromCloud() {
    getStorageData(['sheetsWebhookUrl'], (result) => {
      const webhookUrl = result.sheetsWebhookUrl;
      if (!webhookUrl) return;
      
      syncDesc.innerText = "Syncing with cloud...";
      
      // Create a unique callback name
      const callbackName = 'jsonpCallback_' + Math.round(100000 * Math.random());
      
      // Define the callback globally so the script can invoke it
      window[callbackName] = function(cloudData) {
        // Clean up script tag and global callback function
        delete window[callbackName];
        const scriptEl = document.getElementById(callbackName);
        if (scriptEl) scriptEl.remove();
        
        if (Array.isArray(cloudData)) {
          allSites = cloudData;
          setStorageData({ savedSites: allSites }, () => {
            calculateCategoryCounts();
            renderGrid();
            console.log("Synced websites from Google Sheets via JSONP:", allSites);
            syncDesc.innerHTML = 'Linked to Google Sheets. Updates sync in real-time.';
          });
        } else {
          console.error("Cloud data is not an array:", cloudData);
          syncDesc.innerHTML = 'Linked to Google Sheets. Sync Format Error.';
        }
      };
      
      // Inject the script element
      const script = document.createElement('script');
      script.id = callbackName;
      
      // Append callback parameter to URL
      const separator = webhookUrl.includes('?') ? '&' : '?';
      script.src = `${webhookUrl}${separator}callback=${callbackName}`;
      
      // Error fallback
      script.onerror = function() {
        delete window[callbackName];
        const scriptEl = document.getElementById(callbackName);
        if (scriptEl) scriptEl.remove();
        console.error("JSONP sync request failed.");
        syncDesc.innerHTML = 'Linked to Google Sheets. Offline/Sync Error.';
      };
      
      document.body.appendChild(script);
    });
  }

  // 2. Sidebar Badge Category Counter Engine
  function calculateCategoryCounts() {
    const counts = {
      'all': allSites.length,
      '🤖 AI Chatbots & Writing': 0,
      '🎨 AI Image Generators': 0,
      '🎥 AI Video & Audio': 0,
      '💻 Developer Tools & Cloud': 0,
      '🛍️ E-Commerce & Shopping': 0,
      '📱 Social Media & Networking': 0,
      '🎥 Entertainment & Media': 0,
      '💼 Work & Productivity': 0,
      '🌐 General / Personal Website': 0
    };

    allSites.forEach(site => {
      if (counts.hasOwnProperty(site.category)) {
        counts[site.category]++;
      } else {
        counts['🌐 General / Personal Website']++;
      }
    });

    document.getElementById('count-all').innerText = counts['all'];
    document.getElementById('count-ai-chats').innerText = counts['🤖 AI Chatbots & Writing'];
    document.getElementById('count-ai-images').innerText = counts['🎨 AI Image Generators'];
    document.getElementById('count-ai-videos').innerText = counts['🎥 AI Video & Audio'];
    document.getElementById('count-dev').innerText = counts['💻 Developer Tools & Cloud'];
    document.getElementById('count-shop').innerText = counts['🛍️ E-Commerce & Shopping'];
    document.getElementById('count-social').innerText = counts['📱 Social Media & Networking'];
    document.getElementById('count-media').innerText = counts['🎥 Entertainment & Media'];
    document.getElementById('count-work').innerText = counts['💼 Work & Productivity'];
    document.getElementById('count-general').innerText = counts['🌐 General / Personal Website'];
  }

  // Helper to match category-specific styling tags
  function getBadgeClass(category) {
    switch (category) {
      case '🤖 AI Chatbots & Writing': return 'badge-chats';
      case '🎨 AI Image Generators': return 'badge-images';
      case '🎥 AI Video & Audio': return 'badge-videos';
      case '💻 Developer Tools & Cloud': return 'badge-dev';
      case '🛍️ E-Commerce & Shopping': return 'badge-shop';
      default: return '';
    }
  }

  // 3. Grid Renderer
  function renderGrid() {
    platformGrid.innerHTML = '';
    
    // Filter array by search query AND active category
    const filteredSites = allSites.filter(site => {
      const matchesSearch = 
        site.title.toLowerCase().includes(searchQuery) ||
        site.url.toLowerCase().includes(searchQuery) ||
        site.description.toLowerCase().includes(searchQuery) ||
        site.category.toLowerCase().includes(searchQuery);

      const matchesCategory = 
        activeCategory === 'all' || 
        site.category === activeCategory;

      return matchesSearch && matchesCategory;
    });

    // Check empty state
    if (filteredSites.length === 0) {
      platformGrid.style.display = 'none';
      emptyState.style.display = 'flex';
      return;
    }

    platformGrid.style.display = 'grid';
    emptyState.style.display = 'none';

    // Generate Cards
    filteredSites.forEach((site) => {
      const card = document.createElement('div');
      card.className = 'card-item';
      
      const badgeClass = getBadgeClass(site.category);
      const faviconUrl = `https://www.google.com/s2/favicons?sz=64&domain=${site.domain}`;

      card.innerHTML = `
        <div class="card-header">
          <div class="card-icon">
            <img src="${faviconUrl}" onerror="this.src='https://www.google.com/s2/favicons?sz=64&domain=google.com'" alt="favicon">
          </div>
          <div class="card-info">
            <h3 class="card-name">${escapeHTML(site.title)}</h3>
            <span class="card-domain">${escapeHTML(site.domain)}</span>
          </div>
        </div>
        <div class="card-badge ${badgeClass}">${escapeHTML(site.category)}</div>
        <p class="card-body">${escapeHTML(site.description)}</p>
        <div class="card-actions">
          <a href="${site.url}" target="_blank" class="btn-launch">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            <span>Launch Site</span>
          </a>
          <div style="display: flex; gap: 6px;">
            <button class="btn-icon-only btn-edit" data-domain="${site.domain}" title="Edit platform">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
            </button>
            <button class="btn-icon-only btn-delete" data-domain="${site.domain}" title="Delete platform">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
            </button>
          </div>
        </div>
      `;

      // Premium visual card hover glow effect (Dynamic Coordinate Tracking)
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        card.style.setProperty('--x', `${x}px`);
        card.style.setProperty('--y', `${y}px`);
      });

      // Bind edit action
      card.querySelector('.btn-edit').addEventListener('click', (e) => {
        const domainToEdit = e.currentTarget.getAttribute('data-domain');
        openEditModal(domainToEdit);
      });

      // Bind delete action
      card.querySelector('.btn-delete').addEventListener('click', (e) => {
        const domainToDelete = e.currentTarget.getAttribute('data-domain');
        deleteSite(domainToDelete);
      });

      platformGrid.appendChild(card);
    });
  }

  // 4. Delete Site Action (with remote cloud sync)
  function deleteSite(domain) {
    if (!confirm(`Are you sure you want to remove this platform?`)) return;

    allSites = allSites.filter(site => site.domain !== domain);
    
    getStorageData(['sheetsWebhookUrl'], (result) => {
      setStorageData({ savedSites: allSites }, () => {
        calculateCategoryCounts();
        renderGrid();

        // Direct webhook automated sync for permanent deletion
        const webhookUrl = result.sheetsWebhookUrl;
        if (webhookUrl) {
          fetch(webhookUrl, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'delete', domain: domain })
          }).then(() => console.log('Automated Sync deletion successful.'))
            .catch(err => console.error('Automated deletion sync failed:', err));
        }
      });
    });
  }

  // 4b. Open Edit Modal Action
  function openEditModal(domain) {
    const site = allSites.find(s => s.domain === domain);
    if (!site) return;

    editingDomain = domain;
    
    document.getElementById('add-title').value = site.title;
    document.getElementById('add-url').value = site.url;
    document.getElementById('add-category').value = site.category;
    document.getElementById('add-desc').value = site.description;

    // Modify modal titles
    document.querySelector('#add-modal h2').innerText = "Edit Web Platform";
    addForm.querySelector('button[type="submit"]').innerText = "Update Web Platform";
    
    addModal.classList.add('active');
  }

  // Mobile drawer controls
  const menuToggle = document.getElementById('btn-menu-toggle');
  const closeSidebarBtn = document.getElementById('close-sidebar');
  const sidebarOverlay = document.getElementById('sidebar-overlay');
  const sidebar = document.querySelector('.sidebar');

  if (menuToggle) {
    menuToggle.addEventListener('click', () => {
      sidebar.classList.add('active');
      sidebarOverlay.classList.add('active');
    });
  }

  function closeMobileSidebar() {
    if (sidebar) sidebar.classList.remove('active');
    if (sidebarOverlay) sidebarOverlay.classList.remove('active');
  }

  if (closeSidebarBtn) {
    closeSidebarBtn.addEventListener('click', closeMobileSidebar);
  }

  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', closeMobileSidebar);
  }

  // 5. Category Navigation click handling
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      closeMobileSidebar(); // Slide drawer back off-screen on click
      
      navItems.forEach(i => i.classList.remove('active'));
      e.currentTarget.classList.add('active');

      activeCategory = e.currentTarget.getAttribute('data-category');
      
      // Update Title
      if (activeCategory === 'all') {
        activeCategoryTitle.innerText = 'All Platforms';
      } else {
        // Strip emoji for title readability
        activeCategoryTitle.innerText = activeCategory.replace(/[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, '').trim();
      }

      renderGrid();
    });
  });

  // 6. Search input dynamic filtering
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase().trim();
    renderGrid();
  });

  // --- MODAL DIALOGS CONTROLS ---

  // Settings Modal opening/closing
  if (btnSettings) {
    btnSettings.addEventListener('click', () => {
      settingsModal.classList.add('active');
    });
  }
  if (closeSettingsModal) {
    closeSettingsModal.addEventListener('click', () => {
      settingsModal.classList.remove('active');
    });
  }
  if (modalBtnGuide) {
    modalBtnGuide.addEventListener('click', () => {
      settingsModal.classList.remove('active');
      guideModal.classList.add('active');
    });
  }

  // Save Sync Link Logic
  function saveSyncUrl(url) {
    url = url.trim();
    if (url === '') {
      setStorageData({ sheetsWebhookUrl: '' }, () => {
        alert('Sheets connection link cleared.');
        if (sheetsWebhookUrlInput) sheetsWebhookUrlInput.value = '';
        if (modalSheetsWebhookUrlInput) modalSheetsWebhookUrlInput.value = '';
        syncBadge.className = 'sync-dot';
        syncDesc.innerHTML = 'Sync is inactive. Go to Connection Guide to link Google Sheets.';
        loadData();
      });
      return;
    }
    if (!url.startsWith('https://script.google.com/')) {
      alert('Invalid Web App URL. Must start with https://script.google.com/');
      return;
    }
    setStorageData({ sheetsWebhookUrl: url }, () => {
      alert('Google Sheets Sync URL successfully saved!');
      if (sheetsWebhookUrlInput) sheetsWebhookUrlInput.value = url;
      if (modalSheetsWebhookUrlInput) modalSheetsWebhookUrlInput.value = url;
      syncBadge.className = 'sync-dot active';
      syncDesc.innerHTML = 'Linked to Google Sheets. Updates sync in real-time.';
      if (settingsModal) settingsModal.classList.remove('active');
      fetchDataFromCloud(); // Automatic pull on save!
    });
  }

  if (btnSaveSync) {
    btnSaveSync.addEventListener('click', () => {
      saveSyncUrl(sheetsWebhookUrlInput.value);
    });
  }
  if (modalBtnSaveSync) {
    modalBtnSaveSync.addEventListener('click', () => {
      saveSyncUrl(modalSheetsWebhookUrlInput.value);
    });
  }

  // Manual Add Modal opening/closing
  btnManualAdd.addEventListener('click', () => {
    editingDomain = null;
    addForm.reset();
    document.querySelector('#add-modal h2').innerText = "Add New Web Platform";
    addForm.querySelector('button[type="submit"]').innerText = "Save Web Platform";
    addModal.classList.add('active');
  });
  closeAddModal.addEventListener('click', () => addModal.classList.remove('active'));

  // Sync Guide Modal opening/closing
  openSyncGuide.addEventListener('click', () => guideModal.classList.add('active'));
  closeGuideModal.addEventListener('click', () => guideModal.classList.remove('active'));

  // Clicking outside modals closes them
  window.addEventListener('click', (e) => {
    if (e.target === addModal) addModal.classList.remove('active');
    if (e.target === guideModal) guideModal.classList.remove('active');
    if (e.target === settingsModal) settingsModal.classList.remove('active');
  });

  // 7. Manual Add Website Form Submit (supports Edit and Add modes)
  addForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const title = document.getElementById('add-title').value.trim();
    const url = document.getElementById('add-url').value.trim();
    const category = document.getElementById('add-category').value;
    const description = document.getElementById('add-desc').value.trim();

    let domain = '';
    try {
      const parsedUrl = new URL(url);
      const parts = parsedUrl.hostname.split('.');
      domain = parts.length >= 2 ? parts.slice(-2).join('.') : parsedUrl.hostname;
    } catch (err) {
      alert('Please enter a valid website link (including https://).');
      return;
    }

    const newRecord = {
      domain: domain,
      title: title,
      url: url,
      description: description,
      category: category,
      timestamp: new Date().toISOString()
    };

    if (editingDomain) {
      // EDIT MODE
      const index = allSites.findIndex(site => site.domain === editingDomain);
      if (index !== -1) {
        allSites[index] = newRecord;
      } else {
        allSites.push(newRecord);
      }

      getStorageData(['sheetsWebhookUrl'], (result) => {
        setStorageData({ savedSites: allSites }, () => {
          const original = editingDomain;
          editingDomain = null;
          addForm.reset();
          addModal.classList.remove('active');
          
          calculateCategoryCounts();
          renderGrid();

          const webhookUrl = result.sheetsWebhookUrl;
          if (webhookUrl) {
            fetch(webhookUrl, {
              method: 'POST',
              mode: 'no-cors',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'edit',
                originalDomain: original,
                ...newRecord
              })
            }).then(() => console.log('Automated Edit Sync successful.'))
              .catch(err => console.error('Automated edit sync failed:', err));
          }
        });
      });
    } else {
      // ADD MODE
      const duplicateIndex = allSites.findIndex(site => site.domain === domain);
      if (duplicateIndex !== -1) {
        if (!confirm('A saved platform with this domain already exists. Do you want to update it?')) {
          return;
        }
        allSites[duplicateIndex] = newRecord;
      } else {
        allSites.push(newRecord);
      }

      getStorageData(['sheetsWebhookUrl'], (result) => {
        setStorageData({ savedSites: allSites }, () => {
          addForm.reset();
          addModal.classList.remove('active');
          
          calculateCategoryCounts();
          renderGrid();

          const webhookUrl = result.sheetsWebhookUrl;
          if (webhookUrl) {
            fetch(webhookUrl, {
              method: 'POST',
              mode: 'no-cors',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(newRecord)
            }).then(() => console.log('Automated Add Sync successful.'))
              .catch(err => console.error('Automated add sync failed:', err));
          }
        });
      });
    }
  });

  // 8. Copy Apps Script Code to Clipboard
  btnCopyCode.addEventListener('click', () => {
    const textToCopy = codeSnippet.innerText;
    navigator.clipboard.writeText(textToCopy).then(() => {
      btnCopyCode.innerText = 'Copied!';
      btnCopyCode.style.background = '#10b981';
      setTimeout(() => {
        btnCopyCode.innerText = 'Copy Code';
        btnCopyCode.style.background = 'rgba(255,255,255,0.05)';
      }, 2000);
    });
  });

  // 9. Export to CSV Engine with click-ready formulas
  btnCsv.addEventListener('click', () => {
    if (allSites.length === 0) {
      alert('No platforms logged to export.');
      return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    
    // CSV Headers
    csvContent += `"Website Name","Category","Description","Website URL","Domain Key","Date Added"\n`;

    allSites.forEach(site => {
      // Escape inner quotes inside descriptions and names
      const escapedTitle = (site.title || '').replace(/"/g, '""');
      const escapedDesc = (site.description || '').replace(/"/g, '""');
      
      // Injecting standard URL cell which Excel/Google Sheets automatically formats as clickable!
      const row = `"${escapedTitle}","${site.category}","${escapedDesc}","${site.url}","${site.domain}","${new Date(site.timestamp).toLocaleString()}"`;
      csvContent += row + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `website_launchpad_export_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    
    link.click();
    document.body.removeChild(link);
  });

  // Helper function to escape HTML to prevent XSS
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

  // Load active configurations on launch
  loadData();
});
