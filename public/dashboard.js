function isAuthenticated() {
  const token = localStorage.getItem('token');
  if (!token) return false;
  
  try {
    const payload = parseJwt(token);
    if (!payload) return false;
    
    // Check if token is expired
    const currentTime = Date.now() / 1000;
    if (payload.exp && payload.exp < currentTime) {
      console.log('Token expired, removing from localStorage');
      localStorage.removeItem('token');
      return false;
    }
    
    return true;
  } catch (error) {
    console.log('Invalid token, removing from localStorage');
    localStorage.removeItem('token');
    return false;
  }
}

function parseJwt(token) {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return null;
  }
}

// URL validation function
function validateURL(url) {
  // Remove leading/trailing whitespace
  url = url.trim();
  
  // Check if URL is empty
  if (!url) {
    return { isValid: false, error: 'Please enter a URL.' };
  }
  
  // Check if URL starts with http:// or https://
  if (!url.match(/^https?:\/\//i)) {
    return { isValid: false, error: 'URL must start with http:// or https://' };
  }
  
  // Check if URL has a valid domain structure
  try {
    const urlObj = new URL(url);
    
    // Check if hostname is valid (not empty and has at least one dot)
    if (!urlObj.hostname || urlObj.hostname.length === 0) {
      return { isValid: false, error: 'Invalid URL: missing hostname' };
    }
    
    // Check if hostname has at least one dot (for domain)
    if (!urlObj.hostname.includes('.')) {
      return { isValid: false, error: 'Invalid URL: hostname must contain a domain (e.g., example.com)' };
    }
    
    // Check if hostname doesn't start or end with a dot
    if (urlObj.hostname.startsWith('.') || urlObj.hostname.endsWith('.')) {
      return { isValid: false, error: 'Invalid URL: hostname cannot start or end with a dot' };
    }
    
    // Check if hostname has valid characters
    if (!urlObj.hostname.match(/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/)) {
      return { isValid: false, error: 'Invalid URL: hostname contains invalid characters' };
    }
    
    // Check if URL is not too long (reasonable limit)
    if (url.length > 2048) {
      return { isValid: false, error: 'URL is too long (maximum 2048 characters)' };
    }
    
    return { isValid: true, url: url };
  } catch (error) {
    return { isValid: false, error: 'Invalid URL format' };
  }
}

// Function to show error message
function showError(message) {
  resultDiv.textContent = message;
  resultDiv.style.color = '#ff4444';
  resultDiv.style.fontWeight = 'bold';
  // Add invalid class to input
  urlInput.classList.remove('valid');
  urlInput.classList.add('invalid');
}

// Function to show success message
function showSuccess(message) {
  resultDiv.textContent = message;
  resultDiv.style.color = '#00b518';
  resultDiv.style.fontWeight = 'normal';
  // Add valid class to input
  urlInput.classList.remove('invalid');
  urlInput.classList.add('valid');
}

// Function to clear result message
function clearResult() {
  resultDiv.textContent = '';
  resultDiv.style.color = '';
  resultDiv.style.fontWeight = '';
  // Remove validation classes from input
  urlInput.classList.remove('valid', 'invalid');
}

const urlInput = document.getElementById('urlInput');
const checkBtn = document.getElementById('checkBtn');
const resultDiv = document.getElementById('result');
const signoutBtn = document.getElementById('signoutBtn');
const profileBtn = document.getElementById('profileBtn');
const ongoingBtn = document.getElementById('ongoingBtn');
const historyBtn = document.getElementById('historyBtn');
const userInfo = document.getElementById('userInfo');
const usernameDisplay = document.getElementById('usernameDisplay');
const intervalSelect = document.getElementById('intervalSelect');
const topUrlsList = document.getElementById('topUrlsList');

// Add real-time URL validation
urlInput.addEventListener('input', () => {
  const url = urlInput.value.trim();
  
  // Clear previous validation messages if input is empty
  if (!url) {
    clearResult();
    return;
  }
  
  // Only validate if user has started typing a URL
  if (url.length > 0) {
    const validation = validateURL(url);
    if (!validation.isValid) {
      showError(validation.error);
    } else {
      showSuccess('✓ Valid URL');
    }
  }
});

// Handle Enter key press
urlInput.addEventListener('keypress', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    checkBtn.click();
  }
});

// Clear validation message when user starts typing
urlInput.addEventListener('focus', () => {
  const url = urlInput.value.trim();
  if (url) {
    const validation = validateURL(url);
    if (!validation.isValid) {
      showError(validation.error);
    } else {
      showSuccess('✓ Valid URL');
    }
  }
});

function showUserInfo() {
  const token = localStorage.getItem('token');
  const payload = parseJwt(token);
  if (payload && payload.username) {
    usernameDisplay.textContent = payload.username;
    userInfo.style.display = '';
  } else {
    userInfo.style.display = 'none';
  }
}

async function loadTopMonitoredUrls() {
  try {
    const response = await fetch('/api/top-monitored-urls');
    if (!response.ok) {
      throw new Error('Failed to fetch top URLs');
    }
    
    const topUrls = await response.json();
    
    if (topUrls.length === 0) {
      topUrlsList.innerHTML = '<div class="no-data">No monitored URLs found.</div>';
      return;
    }
    
    const topUrlsHTML = topUrls.map((item, index) => `
      <div class="top-url-item">
        <div class="url">${index + 1}. ${item.url}</div>
        <div class="stats">
          <span class="monitor-count">${item.monitor_count} checks</span>
          <span class="user-count">${item.unique_users} users</span>
        </div>
      </div>
    `).join('');
    
    topUrlsList.innerHTML = topUrlsHTML;
  } catch (error) {
    console.error('Error loading top monitored URLs:', error);
    topUrlsList.innerHTML = '<div class="error">Failed to load top URLs.</div>';
  }
}

if (!isAuthenticated()) {
  window.location.href = 'index.html';
} else {
  showUserInfo();
  loadTopMonitoredUrls();
}

profileBtn.onclick = () => window.location.href = 'profile.html';
ongoingBtn.onclick = () => window.location.href = 'monitor.html';
historyBtn.onclick = () => window.location.href = 'history.html';
signoutBtn.onclick = () => {
  // Close WebSocket connection before signing out
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.close();
  }
  localStorage.removeItem('token');
  window.location.href = 'index.html';
};

// Handle browser/tab closing
window.addEventListener('beforeunload', () => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.close();
  }
});

let ws;
function connectWebSocket() {
  // Only connect if user is authenticated
  if (!isAuthenticated()) {
    console.log('User not authenticated, skipping WebSocket connection');
    return;
  }

  // Close existing connection if any
  if (ws && ws.readyState === WebSocket.OPEN) {
    console.log('Closing existing WebSocket connection');
    ws.close();
  }

  ws = new WebSocket(`ws://${window.location.host}`);

  ws.onopen = () => {
    console.log('Dashboard WebSocket connection established from dashboard.html');
    const token = localStorage.getItem('token');
    if (token) {
        // Ensure monitoring agents are active on the server
        ws.send(JSON.stringify({ type: 'getMonitors', token }));
    }
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.error) {
      resultDiv.textContent = `Error: ${data.error}`;
    } else if (data.type === 'statusUpdate') {
      const { monitor } = data;
      const lastUrlEntered = urlInput.value.trim();
      // Only show status for the URL just submitted on this page
      if (lastUrlEntered && monitor.url.toLowerCase() === lastUrlEntered.toLowerCase()) {
        const statusText = monitor.status === 'online' ? 'Online' : 'Offline';
        const latencyText = monitor.latency !== null ? `${monitor.latency} ms` : 'N/A';
        resultDiv.textContent = `Initial Status for ${monitor.url}: ${statusText} | Latency: ${latencyText}`;
      }
    }
  };
  ws.onerror = () => {
    resultDiv.textContent = 'WebSocket error. Please refresh the page.';
  };
  
  ws.onclose = () => {
    console.log('Dashboard WebSocket connection closed');
    // Only reconnect if still authenticated
    setTimeout(() => {
      if (isAuthenticated()) {
        connectWebSocket();
      }
    }, 2000);
  };
}
connectWebSocket();

checkBtn.addEventListener('click', async () => {
  if (!isAuthenticated()) {
    window.location.href = 'index.html';
    return;
  }
  
  const url = urlInput.value.trim();
  
  // Validate URL before proceeding
  const validation = validateURL(url);
  if (!validation.isValid) {
    showError(validation.error);
    return;
  }
  
  // Clear any previous error messages
  clearResult();
  
  const interval = intervalSelect ? parseInt(intervalSelect.value, 10) : 10;
  showSuccess('Starting monitor...');
  
  // Add to active monitors
  const res = await fetch('/api/monitors', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + localStorage.getItem('token')
    },
    body: JSON.stringify({ url: validation.url })
  });

  // Handle the response
  if (!res.ok) {
    const data = await res.json();
    showError(`Error: ${data.error || 'Failed to start monitoring.'}`);
  } else {
    showSuccess('Monitoring started successfully!');
  }
}); 