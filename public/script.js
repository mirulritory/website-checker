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
  console.log('Checking authentication, token exists:', !!token);
  
  if (!token) {
    console.log('No token found in localStorage');
    return false;
  }
  
  try {
    const payload = parseJwt(token);
    console.log('Token payload:', payload);
    
    if (!payload) {
      console.log('Failed to parse token payload');
      localStorage.removeItem('token');
      return false;
    }
    
    // Check if token is expired
    const currentTime = Date.now() / 1000;
    console.log('Current time:', currentTime, 'Token exp:', payload.exp);
    
    if (payload.exp && payload.exp < currentTime) {
      console.log('Token expired, removing from localStorage');
      localStorage.removeItem('token');
      return false;
    }
    
    console.log('Token is valid');
    return true;
  } catch (error) {
    console.log('Error parsing token:', error);
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
  if (!url) {
    resultDiv.textContent = 'Please enter a URL.';
    return;
  }
  resultDiv.textContent = 'Checking...';
  ws.send(JSON.stringify({ url, token: localStorage.getItem('token') }));

  // Also add to active monitors with a default interval (e.g., 10s)
  const res = await fetch('/api/monitor', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + localStorage.getItem('token')
    },
    body: JSON.stringify({ url, interval_seconds: 10 }) // Default interval: 10s
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
  const password = document.getElementById('signupPassword').value;
  const confirmPassword = document.getElementById('signupConfirmPassword').value;
  signupError.textContent = '';

  // Check for empty fields
  if (!username || !email || !password || !confirmPassword) {
    signupError.textContent = 'All fields are required.';
    return;
  }
  // Email validation
  if (!email.includes('@') || !email.endsWith('.com')) {
    signupError.textContent = 'Please enter a valid email address (must contain @ and end with .com).';
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
      body: JSON.stringify({ username, email, password, confirmPassword })
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