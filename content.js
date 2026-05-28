// content.js
// Securely detects login and signup attempts and grabs public website metadata (NO credentials)

// Function to extract page meta description
function getMetaDescription() {
  const meta = document.querySelector('meta[name="description"]') || 
               document.querySelector('meta[property="og:description"]') ||
               document.querySelector('meta[name="twitter:description"]');
  if (meta) {
    return meta.getAttribute('content').trim();
  }
  
  // Fallback: search for first readable paragraph
  const firstParagraph = document.querySelector('p');
  if (firstParagraph && firstParagraph.textContent.trim().length > 30) {
    return firstParagraph.textContent.trim().substring(0, 150) + '...';
  }
  
  return 'No description available.';
}

// Function to report logged site to background worker
function reportLog() {
  const title = document.title || window.location.hostname;
  const url = window.location.href;
  const description = getMetaDescription();
  
  chrome.runtime.sendMessage({
    action: "logWebsite",
    data: {
      title: title,
      url: url,
      description: description,
      timestamp: new Date().toISOString()
    }
  });
}

// Event Listener for form submissions
document.addEventListener('submit', function(event) {
  const form = event.target;
  
  // Check if form contains a password field (indicates login/signup)
  const hasPassword = form.querySelector('input[type="password"]');
  
  if (hasPassword) {
    // Wait briefly for submit to go through, then report the log
    setTimeout(reportLog, 500);
  }
}, true);

// Fallback: also monitor button clicks that might submit dynamically via JS
document.addEventListener('click', function(event) {
  const target = event.target.closest('button, input[type="submit"]');
  if (!target) return;
  
  // Look for adjacent password fields in the same page
  const hasPasswordOnPage = document.querySelector('input[type="password"]');
  const btnText = (target.innerText || target.value || '').toLowerCase();
  
  // Check if the clicked element looks like a sign-in or submit button
  const isSubmitBtn = btnText.includes('log in') || 
                      btnText.includes('sign in') || 
                      btnText.includes('submit') || 
                      btnText.includes('continue') ||
                      btnText.includes('sign up') ||
                      btnText.includes('register');
                      
  if (hasPasswordOnPage && isSubmitBtn) {
    // Wait for authentication process to begin and report
    setTimeout(reportLog, 800);
  }
}, true);

// Smart App-Page Detector (Bypasses form submit limits for OAuth/redirect logins)
function detectDashboard() {
  const url = window.location.href;
  const path = window.location.pathname.toLowerCase();
  
  // List of paths that indicate a logged-in app/dashboard state
  const dashboardIndicators = [
    '/app', '/dashboard', '/console', '/workspace', '/profile', 
    '/account', '/chat', '/home', '/billing'
  ];
  
  const isDashboard = dashboardIndicators.some(indicator => {
    return path.startsWith(indicator) || path.includes(indicator + '/');
  });

  if (isDashboard) {
    // Wait for the page content and title to settle down, then log
    setTimeout(reportLog, 2000);
  }
}

// Run the dashboard detector on load
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  detectDashboard();
} else {
  window.addEventListener('DOMContentLoaded', detectDashboard);
}
