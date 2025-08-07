// WebSocket connection (will be reconnected after auth)
let ws;

console.log('Script.js loaded, checking authentication...');

// Immediately check for authentication and redirect if necessary
if (isAuthenticated()) {
  console.log('User is authenticated, showing authenticated UI');
  // User is already signed in, show authenticated UI
  document.getElementById('authButtons').style.display = 'none';
  document.getElementById('navButtons').style.display = 'block';
  showUserInfo();
  connectWebSocket();
} else {
  console.log('User is not authenticated, showing login UI');
  // User is not signed in, show sign-in/sign-up buttons
  document.getElementById('authButtons').style.display = 'block';
  document.getElementById('navButtons').style.display = 'none';
}

const urlInput = document.getElementById('urlInput');
const checkBtn = document.getElementById('checkBtn');
const resultDiv = document.getElementById('result');

// Modal elements
const signinModal = document.getElementById('signinModal');
const signupModal = document.getElementById('signupModal');
const closeSignin = document.getElementById('closeSignin');
const closeSignup = document.getElementById('closeSignup');
const showSignup = document.getElementById('showSignup');
const showSignin = document.getElementById('showSignin');
const signinSubmit = document.getElementById('signinSubmit');
const signupSubmit = document.getElementById('signupSubmit');
const signinError = document.getElementById('signinError');
const signupError = document.getElementById('signupError');
const signoutBtn = document.getElementById('signoutBtn');
const userInfo = document.getElementById('userInfo');
const usernameDisplay = document.getElementById('usernameDisplay');

const navButtons = document.getElementById('navButtons');
const ongoingBtn = document.getElementById('ongoingBtn');
const historyBtn = document.getElementById('historyBtn');

const authButtons = document.getElementById('authButtons');
const showSigninBtn = document.getElementById('showSigninBtn');
const showSignupBtn = document.getElementById('showSignupBtn');
const preAuthSection = document.getElementById('preAuthSection');

function showModal(modal) {
  modal.style.display = 'block';
}
function hideModal(modal) {
  modal.style.display = 'none';
}

closeSignin.onclick = () => hideModal(signinModal);
closeSignup.onclick = () => hideModal(signupModal);
showSignup.onclick = () => {
  hideModal(signinModal);
  showModal(signupModal);
};
showSignin.onclick = () => {
  hideModal(signupModal);
  showModal(signinModal);
};

showSigninBtn.onclick = () => showModal(signinModal);
showSignupBtn.onclick = () => showModal(signupModal);

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

// URL validation function (same as dashboard.js)
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
    
    // Special exception for localhost URLs
    if (urlObj.hostname === 'localhost') {
      // Allow localhost URLs without requiring a dot
      if (url.length > 2048) {
        return { isValid: false, error: 'URL is too long (maximum 2048 characters)' };
      }
      return { isValid: true, url: url };
    }
    
    // Check if hostname has at least one dot (for domain) - except for localhost
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

function connectWebSocket() {
  console.log('connectWebSocket called');
  
  // Only connect if user is authenticated
  if (!isAuthenticated()) {
    console.log('User not authenticated, skipping WebSocket connection');
    return;
  }

  console.log('Creating WebSocket connection...');
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const host = window.location.host;
  ws = new WebSocket(`${protocol}://${host}`);

  ws.onopen = () => {
    console.log('WebSocket connection established from index.html');
    const token = localStorage.getItem('token');
    if (token) {
      console.log('Sending authentication message');
      ws.send(JSON.stringify({ type: 'getMonitors', token }));
    }
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'statusUpdate') {
      const { monitor } = data;
      const lastUrlEntered = urlInput.value.trim();
      if (lastUrlEntered && monitor.url.toLowerCase() === lastUrlEntered.toLowerCase()) {
        const statusText = monitor.status === 'online' ? 'Online' : 'Offline';
        const latencyText = monitor.latency !== null ? `${monitor.latency} ms` : 'N/A';
        resultDiv.textContent = `Status for ${monitor.url}: ${statusText} | Latency: ${latencyText}`;
      }
    }
  };

  ws.onerror = () => {
    resultDiv.textContent = 'WebSocket error. Please refresh the page.';
  };
}

checkBtn.addEventListener('click', async () => {
  if (!isAuthenticated()) {
    showModal(signinModal);
    return;
  }
  const url = urlInput.value.trim();
  
  // Validate URL before proceeding
  const validation = validateURL(url);
  if (!validation.isValid) {
    resultDiv.textContent = validation.error;
    resultDiv.style.color = '#ff4444';
    return;
  }
  
  resultDiv.textContent = 'Checking...';
  resultDiv.style.color = '';
  ws.send(JSON.stringify({ url: validation.url, token: localStorage.getItem('token') }));

  // Also add to active monitors
  const res = await fetch('/api/monitor', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + localStorage.getItem('token')
    },
    body: JSON.stringify({ url: validation.url })
  });
  // Optionally, handle the response if you want to show a message
  // const data = await res.json();
  // if (res.ok) resultDiv.textContent += ' (Now monitoring)';
});

signinSubmit.onclick = async () => {
  const username = document.getElementById('signinUsername').value.trim();
  const password = document.getElementById('signinPassword').value;
  signinError.textContent = '';
  try {
    const res = await fetch('/api/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (res.ok) {
      localStorage.setItem('token', data.token);
      hideModal(signinModal);
      // Immediately redirect without updating UI
      window.location.replace('dashboard.html');
      return; // Stop execution here
    } else {
      signinError.textContent = data.error || 'Sign in failed.';
    }
  } catch {
    signinError.textContent = 'Sign in failed.';
  }
};

signupSubmit.onclick = async () => {
  const username = document.getElementById('signupUsername').value.trim();
  const email = document.getElementById('signupEmail').value.trim();
  const phoneNumber = document.getElementById('signupPhoneNumber').value.trim();
  const password = document.getElementById('signupPassword').value;
  const confirmPassword = document.getElementById('signupConfirmPassword').value;
  signupError.textContent = '';

  // Check for empty fields
  if (!username || !email || !phoneNumber || !password || !confirmPassword) {
    signupError.textContent = 'All fields are required.';
    return;
  }
  // Email validation
  if (!email.includes('@') || !email.endsWith('.com')) {
    signupError.textContent = 'Please enter a valid email address (must contain @ and end with .com).';
    return;
  }
  // Phone number validation (basic format check)
  const phoneRegex = /^[\+]?[0-9][\d]{9,10}$/;
  if (!phoneRegex.test(phoneNumber.replace(/\s/g, ''))) {
    signupError.textContent = 'Please enter a valid phone number (10-11 digits).';
    return;
  }
  // Password length validation
  if (password.length < 8) {
    signupError.textContent = 'Password must be at least 8 characters long.';
    return;
  }
  if (password !== confirmPassword) {
    signupError.textContent = 'Passwords do not match.';
    return;
  }
  try {
    const res = await fetch('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, phoneNumber, password, confirmPassword })
    });
    const data = await res.json();
    if (res.ok) {
      // On successful sign up, show success message and open sign in modal
      hideModal(signupModal);
      signinError.textContent = 'Sign up successful! Please sign in.';
      showModal(signinModal);
      return; // Stop execution here
    } else {
      signupError.textContent = data.error || 'Sign up failed.';
    }
  } catch {
    signupError.textContent = 'Sign up failed.';
  }
};

signoutBtn.onclick = () => {
  localStorage.removeItem('token');
  updateAuthUI();
};

ongoingBtn.onclick = () => window.location.href = 'monitor.html';
historyBtn.onclick = () => window.location.href = 'history.html';

function updateAuthUI() {
  if (isAuthenticated()) {
    if (signoutBtn) signoutBtn.style.display = '';
    if (navButtons) navButtons.style.display = '';
    if (authButtons) authButtons.style.display = 'none';
    if (preAuthSection) preAuthSection.style.display = 'none';
    if (usernameDisplay && userInfo) {
      const token = localStorage.getItem('token');
      const payload = parseJwt(token);
      if (payload && payload.username) {
        usernameDisplay.textContent = payload.username;
        userInfo.style.display = '';
      } else {
        userInfo.style.display = 'none';
      }
    }
  } else {
    if (signoutBtn) signoutBtn.style.display = 'none';
    if (navButtons) navButtons.style.display = 'none';
    if (userInfo) userInfo.style.display = 'none';
    if (authButtons) authButtons.style.display = '';
    if (preAuthSection) preAuthSection.style.display = '';
    if (resultDiv) resultDiv.textContent = '';
  }
}

// Initial UI setup
updateAuthUI(); 