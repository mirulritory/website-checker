document.addEventListener('DOMContentLoaded', () => {
    const backHomeBtn = document.getElementById('backHomeBtn');
    const addWebsiteBtn = document.getElementById('addWebsiteBtn');
    const addWebsiteModal = document.getElementById('addWebsiteModal');
    const closeModal = document.getElementById('closeModal');
    const cancelBtn = document.getElementById('cancelBtn');
    const addBtn = document.getElementById('addBtn');
    const websiteUrlInput = document.getElementById('websiteUrlInput');
    const modalError = document.getElementById('modalError');
    const profileInfo = document.getElementById('profileInfo');
    const websitesContainer = document.getElementById('websitesContainer');
    const scheduledMaintenanceContainer = document.getElementById('scheduledMaintenanceContainer');

    // Planned downtime modal elements
    const plannedDowntimeModal = document.getElementById('plannedDowntimeModal');
    const closePlannedDowntimeModal = document.getElementById('closePlannedDowntimeModal');
    const cancelPlannedDowntimeBtn = document.getElementById('cancelPlannedDowntimeBtn');
    const schedulePlannedDowntimeBtn = document.getElementById('schedulePlannedDowntimeBtn');
    const selectedWebsiteUrl = document.getElementById('selectedWebsiteUrl');
    const maintenanceReason = document.getElementById('maintenanceReason');
    const startDateTime = document.getElementById('startDateTime');
    const endDateTime = document.getElementById('endDateTime');
    const plannedDowntimeError = document.getElementById('plannedDowntimeError');

    let currentWebsiteUrl = null;

    // Check authentication
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

    // URL validation function (same as dashboard.js and script.js)
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

    // Redirect if not authenticated
    if (!isAuthenticated()) {
        window.location.href = 'index.html';
        return;
    }

    // Navigation
    backHomeBtn.addEventListener('click', () => {
        window.location.href = 'dashboard.html';
    });

    // Modal functionality
    function showModal() {
        addWebsiteModal.style.display = 'block';
        websiteUrlInput.focus();
        modalError.textContent = '';
    }

    function hideModal() {
        addWebsiteModal.style.display = 'none';
        websiteUrlInput.value = '';
        modalError.textContent = '';
    }

    addWebsiteBtn.addEventListener('click', showModal);
    closeModal.addEventListener('click', hideModal);
    cancelBtn.addEventListener('click', hideModal);

    // Close modal when clicking outside
    addWebsiteModal.addEventListener('click', (e) => {
        if (e.target === addWebsiteModal) {
            hideModal();
        }
    });

    // Load user profile
    async function loadProfile() {
        try {
            const response = await fetch('/api/profile', {
                headers: {
                    'Authorization': 'Bearer ' + localStorage.getItem('token')
                }
            });

            if (response.ok) {
                const profile = await response.json();
                displayProfile(profile);
            } else {
                console.error('Failed to load profile');
            }
        } catch (error) {
            console.error('Error loading profile:', error);
        }
    }

    // Display profile information
    function displayProfile(profile) {
        profileInfo.innerHTML = `
            <div class="info-item">
                <div class="info-label">Username</div>
                <div class="info-value">${profile.username || 'N/A'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Email</div>
                <div class="info-value">${profile.email || 'N/A'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Phone Number</div>
                <div class="info-value">${profile.phone_number || 'N/A'}</div>
            </div>
        `;
    }

    // Load user's websites
    async function loadWebsites() {
        try {
            const response = await fetch('/api/profile/websites', {
                headers: {
                    'Authorization': 'Bearer ' + localStorage.getItem('token')
                }
            });

            if (response.ok) {
                const websites = await response.json();
                displayWebsites(websites);
            } else {
                console.error('Failed to load websites');
            }
        } catch (error) {
            console.error('Error loading websites:', error);
        }
    }

    // Display websites list
    function displayWebsites(websites) {
        if (websites.length === 0) {
            websitesContainer.innerHTML = '<div class="no-websites">No websites added yet. Click "Add Website" to get started.</div>';
            return;
        }

        const websitesList = document.createElement('ul');
        websitesList.className = 'websites-list';

        websites.forEach(website => {
            const listItem = document.createElement('li');
            listItem.className = 'website-item';
            listItem.innerHTML = `
                <div class="website-url">${website.url}</div>
                <div>
                    <button class="add-action-btn" data-url="${website.url}">Add Action</button>
                    <button class="remove-website-btn" data-url="${website.url}">Remove</button>
                </div>
            `;

            // Add action functionality
            const addActionBtn = listItem.querySelector('.add-action-btn');
            addActionBtn.addEventListener('click', () => showPlannedDowntimeModal(website.url));

            // Add remove functionality
            const removeBtn = listItem.querySelector('.remove-website-btn');
            removeBtn.addEventListener('click', () => removeWebsite(website.url));

            websitesList.appendChild(listItem);
        });

        websitesContainer.innerHTML = '';
        websitesContainer.className = 'websites-container';
        websitesContainer.appendChild(websitesList);
    }

    // Load scheduled maintenance
    async function loadScheduledMaintenance() {
        try {
            const response = await fetch('/api/profile/planned-downtime', {
                headers: {
                    'Authorization': 'Bearer ' + localStorage.getItem('token')
                }
            });

            if (response.ok) {
                const maintenanceList = await response.json();
                displayScheduledMaintenance(maintenanceList);
            } else {
                console.error('Failed to load scheduled maintenance');
            }
        } catch (error) {
            console.error('Error loading scheduled maintenance:', error);
        }
    }

    // Display scheduled maintenance list
    function displayScheduledMaintenance(maintenanceList) {
        if (maintenanceList.length === 0) {
            scheduledMaintenanceContainer.innerHTML = '<div class="no-maintenance">No scheduled maintenance.</div>';
            return;
        }

        const maintenanceListElement = document.createElement('div');

        maintenanceList.forEach(maintenance => {
            const maintenanceItem = document.createElement('div');
            maintenanceItem.className = 'maintenance-item';

            // The times from database are stored as UTC
            // We need to convert them to local time for display
            let startTime, endTime;
            
            try {
                // Parse the UTC timestamps and convert to local time
                startTime = new Date(maintenance.start_time);
                endTime = new Date(maintenance.end_time);
                
                // Validate the dates
                if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
                    throw new Error('Invalid date format');
                }
            } catch (error) {
                console.error('Failed to parse maintenance times:', maintenance.start_time, maintenance.end_time, error);
                // Fallback: Use current time
                startTime = new Date();
                endTime = new Date();
            }
            
            const now = new Date();

            let status = maintenance.status;
            let statusClass = 'status-scheduled';

            if (status === 'cancelled') {
                statusClass = 'status-cancelled';
            } else if (now >= startTime && now <= endTime) {
                status = 'active';
                statusClass = 'status-active';
            } else if (now > endTime) {
                status = 'completed';
                statusClass = 'status-completed';
            }

            maintenanceItem.innerHTML = `
                <div class="maintenance-details">
                    <div class="maintenance-url">${maintenance.url}</div>
                    <div class="maintenance-reason">${maintenance.reason}</div>
                    <div class="maintenance-time">
                        ${startTime.toLocaleString()} - ${endTime.toLocaleString()}
                    </div>
                </div>
                <div>
                    <span class="maintenance-status ${statusClass}">${status.toUpperCase()}</span>
                    ${status === 'scheduled' ? `<button class="cancel-maintenance-btn" data-id="${maintenance.id}">Cancel</button>` : ''}
                </div>
            `;

            // Add cancel functionality for scheduled maintenance
            if (status === 'scheduled') {
                const cancelBtn = maintenanceItem.querySelector('.cancel-maintenance-btn');
                cancelBtn.addEventListener('click', () => cancelMaintenance(maintenance.id));
            }

            maintenanceListElement.appendChild(maintenanceItem);
        });

        scheduledMaintenanceContainer.innerHTML = '';
        scheduledMaintenanceContainer.className = 'scheduled-maintenance-container';
        scheduledMaintenanceContainer.appendChild(maintenanceListElement);
    }

    // Cancel maintenance function
    async function cancelMaintenance(maintenanceId) {
        if (!confirm('Are you sure you want to cancel this scheduled maintenance?')) {
            return;
        }

        try {
            const response = await fetch(`/api/planned-downtime/${maintenanceId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': 'Bearer ' + localStorage.getItem('token')
                }
            });

            if (response.ok) {
                alert('Maintenance has been cancelled successfully!');
                loadScheduledMaintenance(); // Reload the list
            } else {
                const data = await response.json();
                alert(data.error || 'Failed to cancel maintenance.');
            }
        } catch (error) {
            console.error('Error cancelling maintenance:', error);
            alert('An error occurred while cancelling maintenance.');
        }
    }

    // Add website functionality
    addBtn.addEventListener('click', async () => {
        const url = websiteUrlInput.value.trim();

        const validationResult = validateURL(url);
        if (!validationResult.isValid) {
            modalError.textContent = validationResult.error;
            return;
        }

        try {
            const response = await fetch('/api/profile/websites', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + localStorage.getItem('token')
                },
                body: JSON.stringify({ url: validationResult.url })
            });

            if (response.ok) {
                hideModal();
                loadWebsites(); // Reload the websites list
            } else {
                const data = await response.json();
                modalError.textContent = data.error || 'Failed to add website.';
            }
        } catch (error) {
            console.error('Error adding website:', error);
            modalError.textContent = 'An error occurred while adding the website.';
        }
    });

    // Remove website functionality
    async function removeWebsite(url) {
        if (!confirm(`Are you sure you want to remove ${url} from your list?`)) {
            return;
        }

        try {
            const response = await fetch('/api/profile/websites', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + localStorage.getItem('token')
                },
                body: JSON.stringify({ url })
            });

            if (response.ok) {
                loadWebsites(); // Reload the websites list
            } else {
                const data = await response.json();
                alert(data.error || 'Failed to remove website.');
            }
        } catch (error) {
            console.error('Error removing website:', error);
            alert('An error occurred while removing the website.');
        }
    }

    // Real-time URL validation
    websiteUrlInput.addEventListener('input', () => {
        const url = websiteUrlInput.value.trim();

        // Clear previous validation messages if input is empty
        if (!url) {
            modalError.textContent = '';
            return;
        }

        // Only validate if user has started typing a URL
        if (url.length > 0) {
            const validation = validateURL(url);
            if (!validation.isValid) {
                modalError.textContent = validation.error;
            } else {
                modalError.textContent = '✓ Valid URL';
                modalError.style.color = '#00b518';
            }
        }
    });

    // Enter key to add website
    websiteUrlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addBtn.click();
        }
    });

    // Clear validation message when user starts typing
    websiteUrlInput.addEventListener('focus', () => {
        const url = websiteUrlInput.value.trim();
        if (url) {
            const validation = validateURL(url);
            if (!validation.isValid) {
                modalError.textContent = validation.error;
                modalError.style.color = '#ff4444';
            } else {
                modalError.textContent = '✓ Valid URL';
                modalError.style.color = '#00b518';
            }
        }
    });

    // Planned downtime modal functionality
    function showPlannedDowntimeModal(url) {
        currentWebsiteUrl = url;
        selectedWebsiteUrl.textContent = `Schedule maintenance for: ${url}`;
        plannedDowntimeModal.style.display = 'block';
        maintenanceReason.focus();
        plannedDowntimeError.textContent = '';

        // Set default start time to current time + 1 hour
        const now = new Date();
        now.setHours(now.getHours() + 1);
        startDateTime.value = now.toISOString().slice(0, 16);

        // Set default end time to start time + 2 hours
        const endTime = new Date(now);
        endTime.setHours(endTime.getHours() + 2);
        endDateTime.value = endTime.toISOString().slice(0, 16);
    }

    function hidePlannedDowntimeModal() {
        plannedDowntimeModal.style.display = 'none';
        currentWebsiteUrl = null;
        maintenanceReason.value = '';
        startDateTime.value = '';
        endDateTime.value = '';
        plannedDowntimeError.textContent = '';
    }

    // Planned downtime modal event listeners
    closePlannedDowntimeModal.addEventListener('click', hidePlannedDowntimeModal);
    cancelPlannedDowntimeBtn.addEventListener('click', hidePlannedDowntimeModal);

    // Close modal when clicking outside
    plannedDowntimeModal.addEventListener('click', (e) => {
        if (e.target === plannedDowntimeModal) {
            hidePlannedDowntimeModal();
        }
    });

    // Schedule planned downtime
    schedulePlannedDowntimeBtn.addEventListener('click', async () => {
        const reason = maintenanceReason.value.trim();
        const start = startDateTime.value;
        const end = endDateTime.value;

        if (!reason) {
            plannedDowntimeError.textContent = 'Please enter a reason for maintenance.';
            return;
        }

        if (!start || !end) {
            plannedDowntimeError.textContent = 'Please select both start and end times.';
            return;
        }

        if (new Date(start) >= new Date(end)) {
            plannedDowntimeError.textContent = 'End time must be after start time.';
            return;
        }

        if (new Date(start) < new Date()) {
            plannedDowntimeError.textContent = 'Start time cannot be in the past.';
            return;
        }

        try {
            const response = await fetch('/api/planned-downtime', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + localStorage.getItem('token')
                },
                body: JSON.stringify({
                    url: currentWebsiteUrl,
                    reason: reason,
                    start_time: start,
                    end_time: end
                })
            });

            if (response.ok) {
                hidePlannedDowntimeModal();
                alert('Maintenance has been scheduled successfully!');
                loadScheduledMaintenance(); // Reload the scheduled maintenance list
            } else {
                const data = await response.json();
                plannedDowntimeError.textContent = data.error || 'Failed to schedule maintenance.';
            }
        } catch (error) {
            console.error('Error scheduling planned downtime:', error);
            plannedDowntimeError.textContent = 'An error occurred while scheduling maintenance.';
        }
    });

    // Load initial data
    loadProfile();
    loadWebsites();
    loadScheduledMaintenance();
}); 