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

const urlInput = document.getElementById('urlInput');
const checkBtn = document.getElementById('checkBtn');
const resultDiv = document.getElementById('result');
const signoutBtn = document.getElementById('signoutBtn');
const ongoingBtn = document.getElementById('ongoingBtn');
const historyBtn = document.getElementById('historyBtn');
const userInfo = document.getElementById('userInfo');
const usernameDisplay = document.getElementById('usernameDisplay');
const intervalSelect = document.getElementById('intervalSelect');

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

if (!isAuthenticated()) {
  window.location.href = 'index.html';
} else {
  showUserInfo();
}

ongoingBtn.onclick = () => window.location.href = 'monitor.html';
historyBtn.onclick = () => window.location.href = 'history.html';
signoutBtn.onclick = () => {
  localStorage.removeItem('token');
  window.location.href = 'index.html';
};

let ws;
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
connectWebSocket();

checkBtn.addEventListener('click', async () => {
  if (!isAuthenticated()) {
    window.location.href = 'index.html';
    return;
  }
  const url = urlInput.value.trim();
  const interval = parseInt(intervalSelect.value, 10);
  if (!url) {
    resultDiv.textContent = 'Please enter a URL.';
    return;
  }
  resultDiv.textContent = 'Checking...';
  ws.send(JSON.stringify({ url, token: localStorage.getItem('token') }));

  // Add to active monitors with selected interval
  const res = await fetch('/api/monitor', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + localStorage.getItem('token')
    },
    body: JSON.stringify({ url, interval_seconds: interval })
  });
  // Optionally, handle the response if you want to show a message
  // const data = await res.json();
  // if (res.ok) resultDiv.textContent += ' (Now monitoring)';
}); 