// WebSocket connection (will be reconnected after auth)
let ws;

// Immediately check for authentication and redirect if necessary
if (localStorage.getItem('token')) {
  window.location.replace('dashboard.html');
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
  return !!localStorage.getItem('token');
}

function parseJwt(token) {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return null;
  }
}

function connectWebSocket() {
  ws = new WebSocket(`ws://${window.location.host}`);
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.error) {
      resultDiv.textContent = `Error: ${data.error}`;
    } else {
      resultDiv.textContent = `Status for ${data.url}: ${data.status} (${data.statusText})`;
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
  connectWebSocket();
};

ongoingBtn.onclick = () => window.location.href = 'monitor.html';
historyBtn.onclick = () => window.location.href = 'history.html';

function updateAuthUI() {
  if (isAuthenticated()) {
    signoutBtn.style.display = '';
    navButtons.style.display = '';
    authButtons.style.display = 'none';
    preAuthSection.style.display = 'none';
    // Show username
    const token = localStorage.getItem('token');
    const payload = parseJwt(token);
    if (payload && payload.username) {
      usernameDisplay.textContent = payload.username;
      userInfo.style.display = '';
    } else {
      userInfo.style.display = 'none';
    }
  } else {
    signoutBtn.style.display = 'none';
    navButtons.style.display = 'none';
    userInfo.style.display = 'none';
    authButtons.style.display = '';
    preAuthSection.style.display = '';
    resultDiv.textContent = '';
  }
}

// Initial UI setup
updateAuthUI();
connectWebSocket(); 