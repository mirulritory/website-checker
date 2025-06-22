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
  const interval = intervalSelect ? parseInt(intervalSelect.value, 10) : 10;
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