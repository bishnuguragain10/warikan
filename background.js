// background.js
// Handles storage, auto-categorization heuristics, and automated POST syncs to Google Sheets

// Category keywords for local heuristics
const CATEGORY_MAP = [
  {
    category: "🤖 AI Chatbots & Writing",
    keywords: ["chatgpt", "claude.ai", "gemini.google", "copilot", "perplexity", "poe.com", "deepseek", "bard", "character.ai", "jasper", "copy.ai"]
  },
  {
    category: "🎨 AI Image Generators",
    keywords: ["midjourney", "dall-e", "stable-diffusion", "leonardo.ai", "canva", "adobe", "photoshop", "framer", "figma", "sketch", "remove.bg"]
  },
  {
    category: "🎥 AI Video & Audio",
    keywords: ["sora", "runwayml", "pika.art", "heygen", "synthesia", "elevenlabs", "descript", "midjourney-video", "capcut"]
  },
  {
    category: "💻 Developer Tools & Cloud",
    keywords: ["github", "gitlab", "bitbucket", "vercel", "netlify", "stackoverflow", "localhost", "supabase", "firebase", "aws", "digitalocean", "heroku", "mongodb", "mysql", "stackblitz", "replit", "codepen"]
  },
  {
    category: "🛍️ E-Commerce & Shopping",
    keywords: ["amazon", "ebay", "aliexpress", "shopify", "etsy", "walmart", "target", "alibaba", "bestbuy"]
  },
  {
    category: "📱 Social Media & Networking",
    keywords: ["facebook", "instagram", "twitter", "x.com", "linkedin", "reddit", "tiktok", "pinterest", "snapchat", "whatsapp"]
  },
  {
    category: "🎥 Entertainment & Media",
    keywords: ["youtube", "netflix", "spotify", "twitch", "disneyplus", "hulu", "soundcloud", "vimeo"]
  },
  {
    category: "💼 Work & Productivity",
    keywords: ["slack", "trello", "asana", "notion", "zoom", "miro", "clickup", "jira", "google drive", "sheets", "docs"]
  }
];

// Helper to extract base domain (e.g. "https://sub.domain.com/path" -> "domain.com")
function getBaseDomain(urlStr) {
  try {
    const url = new URL(urlStr);
    const parts = url.hostname.split('.');
    if (parts.length >= 2) {
      // Returns e.g. "github.com" or "google.com"
      return parts.slice(-2).join('.');
    }
    return url.hostname;
  } catch (e) {
    return urlStr;
  }
}

// Auto-categorization heuristic engine
function categorizeWebsite(title, url, description) {
  const normalizedTitle = (title || '').toLowerCase();
  const normalizedUrl = (url || '').toLowerCase();
  const normalizedDesc = (description || '').toLowerCase();

  // 1. Check direct URL keyword matches
  for (const item of CATEGORY_MAP) {
    for (const keyword of item.keywords) {
      if (normalizedUrl.includes(keyword)) {
        return item.category;
      }
    }
  }

  // 2. Check title & description text matches
  for (const item of CATEGORY_MAP) {
    for (const keyword of item.keywords) {
      if (normalizedTitle.includes(keyword) || normalizedDesc.includes(keyword)) {
        return item.category;
      }
    }
  }

  // 3. Check generic fallback terms
  if (normalizedDesc.includes("generate image") || normalizedDesc.includes("text to image") || normalizedDesc.includes("ai art")) {
    return "🎨 AI Image Generators";
  }
  if (normalizedDesc.includes("generate video") || normalizedDesc.includes("text to video") || normalizedDesc.includes("voice clone")) {
    return "🎥 AI Video & Audio";
  }
  if (normalizedDesc.includes("chatbot") || normalizedDesc.includes("conversational ai") || normalizedDesc.includes("llm")) {
    return "🤖 AI Chatbots & Writing";
  }
  if (normalizedDesc.includes("developer") || normalizedDesc.includes("api") || normalizedDesc.includes("database") || normalizedDesc.includes("hosting")) {
    return "💻 Developer Tools & Cloud";
  }

  return "🌐 General / Personal Website";
}

// Post entry to Google Sheets webhook
async function syncToGoogleSheets(webhookUrl, data) {
  if (!webhookUrl) return;

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      mode: 'no-cors', // standard for Apps Script Web Apps when not requiring standard JSON return
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    console.log('Automated Sync to Google Sheets triggered.');
  } catch (error) {
    console.error('Error syncing with Google Sheets webhook:', error);
  }
}

// Main message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "logWebsite") {
    const siteData = message.data;
    const domain = getBaseDomain(siteData.url);
    
    // Ignore chrome pages, extension pages, localhost
    if (siteData.url.startsWith('chrome://') || siteData.url.startsWith('chrome-extension://')) {
      return;
    }

    const category = categorizeWebsite(siteData.title, siteData.url, siteData.description);
    
    const finalRecord = {
      domain: domain,
      title: siteData.title,
      url: siteData.url,
      description: siteData.description || "No description loaded.",
      category: category,
      timestamp: siteData.timestamp || new Date().toISOString()
    };

    // Load existing list, append or update, and save
    chrome.storage.local.get(['savedSites', 'sheetsWebhookUrl'], (result) => {
      let savedSites = result.savedSites || [];
      const webhookUrl = result.sheetsWebhookUrl || "";

      // Deduplicate: check if domain already exists
      const existingIndex = savedSites.findIndex(site => site.domain === domain);
      const isNewDomain = (existingIndex === -1);
      const shouldSync = isNewDomain || message.forceSync === true;
      
      if (existingIndex !== -1) {
        // Update details if it's already there
        savedSites[existingIndex].timestamp = finalRecord.timestamp;
        // Keep the best description
        if (finalRecord.description !== "No description loaded." && savedSites[existingIndex].description === "No description loaded.") {
          savedSites[existingIndex].description = finalRecord.description;
        }
      } else {
        // Push new entry
        savedSites.push(finalRecord);
      }

      // Save back to Chrome local storage
      chrome.storage.local.set({ savedSites: savedSites }, () => {
        console.log('Successfully saved to Local Storage:', finalRecord);
        
        // Push to Google Sheets if linked and it is a new domain or forced sync
        if (webhookUrl && shouldSync) {
          syncToGoogleSheets(webhookUrl, finalRecord);
        }
      });
    });
  }
});
