const websiteListDiv = document.getElementById('websiteList');
const detailsSection = document.getElementById('detailsSection');
const backHomeBtn = document.getElementById('backHomeBtn');

function isAuthenticated() {
  return !!localStorage.getItem('token');
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleString();
}

function renderWebsiteList(urls, selectedUrl) {
  websiteListDiv.innerHTML = '';
  urls.forEach(url => {
    const div = document.createElement('div');
    div.className = 'website-list-item' + (url === selectedUrl ? ' selected' : '');
    div.textContent = url;
    div.onclick = () => renderDetails(url);
    websiteListDiv.appendChild(div);
  });
}

let allLogs = [];
let uniqueUrls = [];

async function fetchHistory() {
  if (!isAuthenticated()) {
    window.location.href = 'index.html';
    return;
  }
  const res = await fetch('/api/history', {
    headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
  });
  allLogs = await res.json();
  // Get unique URLs
  uniqueUrls = [...new Set(allLogs.map(log => log.url))];
  renderWebsiteList(uniqueUrls, null);
  detailsSection.innerHTML = '';
}

function renderDetails(url) {
  renderWebsiteList(uniqueUrls, url);
  const logs = allLogs.filter(log => log.url === url);
  if (logs.length === 0) {
    detailsSection.innerHTML = '';
    return;
  }
  // Calculate stats
  const totalChecks = logs.length;
  const offlineCount = logs.filter(log => log.status !== 'up' && log.status !== 'ONLINE').length;
  let totalOfflineDuration = 0;
  let lastOffline = null;
  let highestLatency = Math.max(...logs.map(log => log.latency || 0));
  logs.forEach((log, i) => {
    if (log.status !== 'up' && log.status !== 'ONLINE') {
      if (!lastOffline) lastOffline = new Date(log.timestamp);
      totalOfflineDuration += 10; // Assume 10s interval for each offline
    } else {
      lastOffline = null;
    }
  });
  // Build details HTML with a table for logs
  let html = `<div class="details-card">
    <div class="details-title">${url}</div>
    <div class="details-section"><b>Total Checks:</b> ${totalChecks}</div>
    <div class="details-section"><b>Offline Count:</b> ${offlineCount}</div>
    <div class="details-section"><b>Highest Latency:</b> ${highestLatency} ms</div>    <div class="details-section"><b>Latency:</b>
    
    <div class="details-section"><b>Recent Checks:</b>
      <table class="log-table">
        <thead>
          <tr>
            <th>Status</th>
            <th>Latency (ms)</th>
            <th>Response Code</th>
            <th>IP</th>
            <th>Checked At</th>
          </tr>
        </thead>
        <tbody>
          ${logs.slice(0, 20).map(log =>
            `<tr>
              <td style="color:${log.status === 'up' || log.status === 'ONLINE' ? 'green' : 'red'};font-weight:bold;">
                ${log.status === 'up' || log.status === 'ONLINE' ? 'ONLINE' : 'OFFLINE'}
              </td>
              <td>${log.latency ?? '-'}</td>
              <td>${log.response_code ?? '-'}</td>
              <td>${log.ip_address ?? '-'}</td>
              <td>${formatDate(log.timestamp)}</td>
            </tr>`
          ).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
  detailsSection.innerHTML = html;

  const chartLogs = logs.slice(0, 50);
  if (chartLogs.length > 1) {
    // Add the canvas if not present
    if (!document.getElementById('latencyChart')) {
      const canvas = document.createElement('canvas');
      canvas.id = 'latencyChart';
      canvas.width = 600;
      canvas.height = 220;
      canvas.style.marginTop = '20px';
      detailsSection.appendChild(canvas);
    }
    renderLatencyChart(chartLogs);
  }
}

function renderLatencyChart(logs) {
  const ctx = document.getElementById('latencyChart').getContext('2d');
  const labels = logs.map(log => {
    const d = new Date(log.timestamp);
    return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
  });
  const data = logs.map(log => log.latency ?? null);

  // Destroy previous chart if exists
  if (window.latencyChartInstance) {
    window.latencyChartInstance.destroy();
  }

  window.latencyChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels.reverse(),
      datasets: [{
        label: 'Latency (ms)',
        data: data.reverse(),
        borderColor: '#0a0',
        backgroundColor: 'rgba(10,160,10,0.1)',
        tension: 0.2,
        pointRadius: 2,
        fill: true
      }]
    },
    options: {
      scales: {
        x: {
          title: { display: true, text: 'Time' },
          ticks: { maxTicksLimit: 10 }
        },
        y: {
          title: { display: true, text: 'Latency (ms)' },
          beginAtZero: true
        }
      }
    }
  });
}

if (backHomeBtn) {
  backHomeBtn.onclick = () => {
    window.location.href = 'dashboard.html';
  };
}

if (!isAuthenticated()) {
  window.location.href = 'index.html';
} else {
  fetchHistory();
} 