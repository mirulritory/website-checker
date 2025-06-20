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

  ws.onopen = () => {
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
  resultDiv.textContent = 'Starting monitor...';
  
  // This is no longer needed; the fetch call below triggers the monitoring.
  // ws.send(JSON.stringify({ url, token: localStorage.getItem('token') }));

  // Add to active monitors with selected interval
  const res = await fetch('/api/monitors', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + localStorage.getItem('token')
    },
    body: JSON.stringify({ url, interval: interval })
  });

  // The result will be displayed via the websocket onmessage handler.
  // We only handle the error case here.
  if (!res.ok) {
    const data = await res.json();
    resultDiv.textContent = `Error: ${data.error || 'Failed to start monitoring.'}`;
  }
}); 