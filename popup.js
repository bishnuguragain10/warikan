// popup.js
// Handles popup UI interaction, storage saving, and Google Sheets status triggers

document.addEventListener('DOMContentLoaded', () => {
  const openDashboardBtn = document.getElementById('open-dashboard');
  const logCurrentBtn = document.getElementById('log-current');
  const webhookUrlInput = document.getElementById('webhook-url');
  const saveWebhookBtn = document.getElementById('save-webhook');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');

  // 1. Open the full tab Launchpad Dashboard
  openDashboardBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'dashboard.html' });
  });

  // 2. Load existing webhook and update status
  chrome.storage.local.get(['sheetsWebhookUrl'], (result) => {
    if (result.sheetsWebhookUrl) {
      webhookUrlInput.value = result.sheetsWebhookUrl;
      updateStatus(true);
    } else {
      updateStatus(false);
    }
  });

  // 3. Save Webhook Connection URL
  saveWebhookBtn.addEventListener('click', () => {
    const url = webhookUrlInput.value.trim();
    
    if (url === "") {
      chrome.storage.local.remove('sheetsWebhookUrl', () => {
        updateStatus(false);
        alert('Google Sheets connection cleared.');
      });
      return;
    }

    if (!url.startsWith('https://script.google.com/')) {
      alert('Please enter a valid Google Apps Script Web App URL starting with https://script.google.com/');
      return;
    }

    chrome.storage.local.set({ sheetsWebhookUrl: url }, () => {
      updateStatus(true);
      alert('Google Sheets synced successfully!');
    });
  });

  // 4. Force manual save of the current active tab
  logCurrentBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) return;
      const activeTab = tabs[0];

      if (activeTab.url.startsWith('chrome://') || activeTab.url.startsWith('chrome-extension://')) {
        alert('Cannot log internal browser pages.');
        return;
      }

      // Execute a quick script on the tab to retrieve metadata
      chrome.scripting ? chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        func: () => {
          const meta = document.querySelector('meta[name="description"]') || 
                       document.querySelector('meta[property="og:description"]');
          return {
            title: document.title || window.location.hostname,
            url: window.location.href,
            description: meta ? meta.getAttribute('content') : 'No description loaded.'
          };
        }
      }, (injectionResults) => {
        let metaData = {
          title: activeTab.title,
          url: activeTab.url,
          description: 'No description loaded.'
        };

        if (injectionResults && injectionResults[0] && injectionResults[0].result) {
          metaData = injectionResults[0].result;
        }

        // Fire message to background script to log
        chrome.runtime.sendMessage({
          action: "logWebsite",
          forceSync: true, // ALWAYS sync manual button clicks
          data: {
            ...metaData,
            timestamp: new Date().toISOString()
          }
        });
        alert('Current website saved successfully!');
      }) : (function() {
        // Fallback if scripting API is unavailable (based on permissions)
        chrome.runtime.sendMessage({
          action: "logWebsite",
          forceSync: true, // ALWAYS sync manual button clicks
          data: {
            title: activeTab.title,
            url: activeTab.url,
            description: 'No description loaded.',
            timestamp: new Date().toISOString()
          }
        });
        alert('Current website saved successfully!');
      })();
    });
  });

  // Helper to update connection UI status
  function updateStatus(isLinked) {
    if (isLinked) {
      statusDot.className = 'dot dot-active';
      statusText.innerText = 'Connected';
      statusText.style.color = '#10b981';
    } else {
      statusDot.className = 'dot dot-inactive';
      statusText.innerText = 'Not Linked';
      statusText.style.color = '#ef4444';
    }
  }
});
