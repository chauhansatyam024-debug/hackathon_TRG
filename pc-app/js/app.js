/* ============================================
   Screenshot Graveyard Solver — App JavaScript
   ============================================ */

// API Base URL (must point to backend on AWS or localhost)
const API_BASE = window.electronAPI ? 'http://ec2-13-127-248-142.ap-south-1.compute.amazonaws.com:3001/api' : '/api';

// State
let selectedFile = null;
let currentTasks = [];
let jwtToken = localStorage.getItem('jwtToken');
let currentMonth = new Date();

// ============================================
// DOM Ready
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    initAuth();
    
    if (jwtToken) {
        completeLogin(jwtToken);
    }

    initFilters();
    initButtons();
    
    // Listen for background uploads from Electron
    if (window.electronAPI) {
        window.electronAPI.onUploadStatus((data) => {
            showToast(data.message, data.status === 'error' ? 'error' : (data.status === 'success' ? 'success' : 'info'));
            if (data.status === 'success') {
                // Aggressively re-fetch: immediately, then at 1s, 3s, 5s to catch AI processing
                fetchTasks();
                setTimeout(fetchTasks, 1000);
                setTimeout(fetchTasks, 3000);
                setTimeout(fetchTasks, 5000);
            }
        });
    }

    // Auto-poll every 2 seconds to catch new background OCR tasks
    setInterval(() => {
        if (jwtToken) fetchTasks();
    }, 2000);
});


// ============================================
// Authentication Flow
// ============================================
function initAuth() {
    const emailInput = document.getElementById('auth-email-input');
    const sendBtn = document.getElementById('auth-send-btn');
    const emailError = document.getElementById('auth-email-error');
    
    const otpInput = document.getElementById('auth-otp-input');
    const verifyBtn = document.getElementById('auth-verify-btn');
    const backBtn = document.getElementById('auth-back-btn');
    const otpError = document.getElementById('auth-otp-error');
    
    let currentEmail = '';

    sendBtn.addEventListener('click', async () => {
        const email = emailInput.value.trim();
        if (!email) {
            emailError.textContent = 'Please enter an email';
            return;
        }
        
        sendBtn.disabled = true;
        sendBtn.textContent = 'Sending...';
        emailError.textContent = '';
        
        try {
            const res = await fetch(`${API_BASE}/auth/request-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            
            if (!res.ok) throw new Error('Failed to send OTP');
            
            currentEmail = email;
            document.getElementById('auth-display-email').textContent = email;
            document.getElementById('auth-card-email').style.display = 'none';
            document.getElementById('auth-card-otp').style.display = 'block';
            
        } catch (err) {
            emailError.textContent = err.message;
        } finally {
            sendBtn.disabled = false;
            sendBtn.textContent = 'Send Code';
        }
    });

    backBtn.addEventListener('click', () => {
        document.getElementById('auth-card-otp').style.display = 'none';
        document.getElementById('auth-card-email').style.display = 'block';
        otpInput.value = '';
        otpError.textContent = '';
    });

    verifyBtn.addEventListener('click', async () => {
        const otp = otpInput.value.trim();
        if (!otp || otp.length !== 6) {
            otpError.textContent = 'Enter 6-digit code';
            return;
        }
        
        verifyBtn.disabled = true;
        verifyBtn.textContent = 'Verifying...';
        otpError.textContent = '';
        
        try {
            const res = await fetch(`${API_BASE}/auth/verify-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: currentEmail, otp })
            });
            
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Invalid OTP');
            
            completeLogin(data.token);
            
        } catch (err) {
            otpError.textContent = err.message;
        } finally {
            verifyBtn.disabled = false;
            verifyBtn.textContent = 'Verify & Login';
        }
    });
}

function completeLogin(token) {
    jwtToken = token;
    localStorage.setItem('jwtToken', token);
    
    if (window.electronAPI) {
        window.electronAPI.setToken(token);
    }
    
    document.getElementById('auth-overlay').style.display = 'none';
    document.getElementById('main-content').style.display = 'block';
    
    fetchTasks();
}

// ============================================
// Filters
// ============================================
function initFilters() {
    document.getElementById('filter-status').addEventListener('change', fetchTasks);
    document.getElementById('filter-source').addEventListener('change', fetchTasks);
}

function initButtons() {
    document.getElementById('refresh-btn').addEventListener('click', forceRefresh);
}

async function forceRefresh() {
    const btn = document.getElementById('refresh-btn');
    btn.disabled = true;
    btn.classList.add('refreshing');
    btn.innerHTML = '<span class="refresh-spinner">↻</span> Syncing...';

    // Step 1: Trigger rescan of local folders (uploads any recent un-uploaded screenshots)
    if (window.electronAPI && window.electronAPI.rescan) {
        window.electronAPI.rescan();
    }

    // Step 2: Fetch current data from server
    try {
        const response = await fetch(`${API_BASE}/tasks`, {
            headers: { 'Authorization': `Bearer ${jwtToken}` },
            cache: 'no-store'
        });
        if (!response.ok) throw new Error(`Server returned ${response.status}`);

        const data = await response.json();
        const oldCount = currentTasks.length;
        currentTasks = data.tasks || [];
        renderTasks(currentTasks);
        updateStats(currentTasks, data.count);

        if (currentTasks.length > oldCount) {
            showToast(`Refreshed — ${currentTasks.length - oldCount} new tasks found!`, 'success');
        } else {
            showToast(`Refreshed — ${currentTasks.length} tasks loaded`, 'success');
        }
    } catch (err) {
        console.error('Force refresh error:', err);
        showToast('Refresh failed: ' + err.message, 'error');
    }

    // Step 3: Re-fetch again after a few seconds (in case rescan triggered an upload that's still processing)
    setTimeout(async () => {
        try { await fetchTasks(); } catch(e) {}
    }, 3000);
    setTimeout(async () => {
        try { await fetchTasks(); } catch(e) {}
        btn.disabled = false;
        btn.classList.remove('refreshing');
        btn.innerHTML = '↻ Refresh Data';
    }, 6000);
}

// ============================================
// API Functions
// ============================================

async function fetchTasks() {
    const status = document.getElementById('filter-status').value;
    const source = document.getElementById('filter-source').value;

    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (source) params.append('source', source);

    const queryStr = params.toString();
    const url = `${API_BASE}/tasks${queryStr ? '?' + queryStr : ''}`;

    try {
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${jwtToken}` },
            cache: 'no-store'
        });
        
        if (response.status === 401) {
            localStorage.removeItem('jwtToken');
            location.reload();
            return;
        }
        if (!response.ok) throw new Error(`Failed to fetch tasks (${response.status})`);

        const data = await response.json();
        currentTasks = data.tasks || [];
        renderTasks(currentTasks);
        updateStats(currentTasks, data.count);

    } catch (err) {
        console.error('Fetch tasks error:', err);
        if (currentTasks.length === 0) {
            showToast('Network error: Could not load tasks (Firewall blocking?)', 'error');
        }
    }
}

async function updateTask(id, updateData) {
    try {
        const response = await fetch(`${API_BASE}/tasks/${id}`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${jwtToken}`
            },
            body: JSON.stringify(updateData),
        });

        if (!response.ok) throw new Error('Failed to update task');

        showToast('Task updated successfully', 'success');
        fetchTasks();

    } catch (err) {
        showToast(err.message || 'Failed to update task', 'error');
        console.error('Update error:', err);
    }
}

async function deleteTask(id) {
    try {
        const response = await fetch(`${API_BASE}/tasks/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${jwtToken}` }
        });

        if (!response.ok) throw new Error('Failed to delete task');

        showToast('Task deleted', 'info');
        fetchTasks();

    } catch (err) {
        showToast(err.message || 'Failed to delete task', 'error');
        console.error('Delete error:', err);
    }
}

// ============================================
// UI Rendering
// ============================================

// UI Rendering
function renderTasks(tasks) {
    renderCalendar(tasks);

    const foldersContainer = document.getElementById('folders-container');
    const emptyEl = document.getElementById('task-grid-empty');

    // --- State Preservation ---
    const expandedPriority = new Set();
    const expandedStatus = new Set();
    
    if (foldersContainer) {
        document.querySelectorAll('.priority-folder > .folder-header.expanded').forEach(el => {
            const title = el.querySelector('.folder-title')?.textContent;
            if (title) expandedPriority.add(title);
        });
        document.querySelectorAll('.status-folder > .status-header.expanded').forEach(el => {
            const pTitle = el.closest('.priority-folder')?.querySelector('.folder-title')?.textContent;
            const sTitle = el.querySelector('.status-title')?.textContent;
            if (pTitle && sTitle) expandedStatus.add(`${pTitle}::${sTitle}`);
        });
    }
    // --------------------------

    if (!tasks || tasks.length === 0) {
        foldersContainer.innerHTML = '';
        foldersContainer.style.display = 'none';
        emptyEl.style.display = 'flex';
        return;
    }

    emptyEl.style.display = 'none';
    foldersContainer.style.display = 'flex';
    foldersContainer.innerHTML = '';
    
    // Group tasks by priority
    const grouped = {
        urgent: { pending: [], in_progress: [], completed: [] },
        high: { pending: [], in_progress: [], completed: [] },
        medium: { pending: [], in_progress: [], completed: [] },
        low: { pending: [], in_progress: [], completed: [] }
    };

    tasks.forEach(task => {
        const priority = task.priority || 'medium';
        const status = task.status || 'pending';
        if (grouped[priority] && grouped[priority][status]) {
            grouped[priority][status].push(task);
        }
    });

    const priorities = ['urgent', 'high', 'medium', 'low'];
    const statuses = ['pending', 'in_progress', 'completed'];

    priorities.forEach(priority => {
        const priorityTasks = grouped[priority].pending.concat(grouped[priority].in_progress, grouped[priority].completed);
        if (priorityTasks.length === 0) return;

        const pFolder = document.createElement('div');
        pFolder.className = 'priority-folder';

        const pHeader = document.createElement('div');
        pHeader.className = 'folder-header';
        
        const pTitleStr = `${priority} Priority`;
        pHeader.innerHTML = `
            <span class="folder-icon">▶</span>
            <span class="folder-title" style="text-transform: capitalize;">${pTitleStr}</span>
            <span class="folder-count">${priorityTasks.length}</span>
        `;
        pFolder.appendChild(pHeader);

        const pContent = document.createElement('div');
        pContent.className = 'folder-content';

        // Restore Priority Folder State
        if (expandedPriority.has(pTitleStr)) {
            pHeader.classList.add('expanded');
            pContent.classList.add('expanded');
        }

        pHeader.onclick = () => toggleFolder(pHeader);

        statuses.forEach(status => {
            const stTasks = grouped[priority][status];
            if (stTasks.length === 0) return;

            const sFolder = document.createElement('div');
            sFolder.className = 'status-folder';

            const sHeader = document.createElement('div');
            sHeader.className = 'status-header';
            
            const sTitleStr = status.replace('_', ' ');
            sHeader.innerHTML = `
                <span class="folder-icon">▶</span>
                <span class="status-title" style="text-transform: capitalize;">${sTitleStr}</span>
                <span class="folder-count">${stTasks.length}</span>
            `;
            sFolder.appendChild(sHeader);

            const sContent = document.createElement('div');
            sContent.className = 'status-content';

            // Restore Status Folder State
            if (expandedStatus.has(`${pTitleStr}::${sTitleStr}`)) {
                sHeader.classList.add('expanded');
                sContent.classList.add('expanded');
            }

            sHeader.onclick = () => toggleFolder(sHeader);

            stTasks.forEach((task, i) => {
                sContent.appendChild(renderTaskCard(task, i));
            });

            sFolder.appendChild(sContent);
            pContent.appendChild(sFolder);
        });

        pFolder.appendChild(pContent);
        foldersContainer.appendChild(pFolder);
    });

    // Auto-expand first priority folder if nothing is expanded yet
    if (expandedPriority.size === 0 && expandedStatus.size === 0) {
        const firstHeader = foldersContainer.querySelector('.folder-header');
        const firstContent = foldersContainer.querySelector('.folder-content');
        if (firstHeader && firstContent) {
            firstHeader.classList.add('expanded');
            firstContent.classList.add('expanded');
            // Also expand the first status sub-folder
            const firstSubHeader = firstContent.querySelector('.status-header');
            const firstSubContent = firstContent.querySelector('.status-content');
            if (firstSubHeader && firstSubContent) {
                firstSubHeader.classList.add('expanded');
                firstSubContent.classList.add('expanded');
            }
        }
    }
}

function toggleFolder(headerElement) {
    headerElement.classList.toggle('expanded');
    const content = headerElement.nextElementSibling;
    content.classList.toggle('expanded');
}

function renderCalendar(tasks) {
    const monthYear = document.getElementById('calendar-month-year');
    const grid = document.getElementById('calendar-grid');
    if (!monthYear || !grid) return;
    
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    
    const date = new Date(year, month, 1);
    const monthName = date.toLocaleString('default', { month: 'long' });
    monthYear.textContent = `${monthName} ${year}`;
    
    const firstDay = date.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    let html = '';
    
    // Empty cells for days before the 1st
    for (let i = 0; i < firstDay; i++) {
        html += `<div class="calendar-cell empty"></div>`;
    }
    
    const today = new Date();
    
    for (let day = 1; day <= daysInMonth; day++) {
        const cellDate = new Date(year, month, day);
        const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
        
        // Find tasks for this day
        const dayTasks = tasks.filter(t => {
            // Use due_date if available, else created_at
            const dateStr = t.due_date ? t.due_date : (t.created_at || '');
            if (!dateStr) return false;
            return dateStr.includes(`${year}-${String(month+1).padStart(2, '0')}-${String(day).padStart(2, '0')}`) ||
                   dateStr.includes(`${monthName.substring(0,3)} ${day},`);
        });
        
        let dotsHtml = '';
        if (dayTasks.length > 0) {
            dotsHtml = '<div class="calendar-task-dots">';
            dayTasks.slice(0, 3).forEach(t => {
                dotsHtml += `<div class="calendar-dot ${t.priority || 'medium'}"></div>`;
            });
            dotsHtml += '</div>';
        }
        
        html += `
            <div class="calendar-cell ${isToday ? 'today' : ''}" title="${dayTasks.length} tasks">
                <span>${day}</span>
                ${dotsHtml}
            </div>
        `;
    }
    
    grid.innerHTML = html;
}

function changeMonth(delta) {
    currentMonth.setMonth(currentMonth.getMonth() + delta);
    if (currentTasks) renderCalendar(currentTasks);
}

function renderTaskCard(task, index) {
    const card = document.createElement('div');
    card.className = `task-card priority-${task.priority || 'medium'} status-${task.status || 'pending'}`;
    card.style.animationDelay = `${index * 0.05}s`;

    const isCompleted = task.status === 'completed';
    const toggleLabel = isCompleted ? 'Completed' : 'Mark Done';
    const toggleClass = isCompleted ? 'completed' : '';

    card.onclick = (e) => {
        if (!e.target.closest('.status-toggle') && !e.target.closest('.btn-danger')) {
            openReviewModal(task);
        }
    };

    card.innerHTML = `
        <div class="task-card-header">
            <div class="task-card-title">${escapeHtml(task.title)}</div>
        </div>
        ${task.description ? `<div class="task-card-description">${escapeHtml(task.description)}</div>` : ''}
        <div class="task-card-meta">
            <div class="task-card-tags">
                <span class="priority-badge ${task.priority || 'medium'}">${(task.priority || 'medium').toUpperCase()}</span>
                ${task.source === 'ocr' ? '<span class="source-badge">OCR Data</span>' : ''}
                ${task.due_date ? `<span class="due-date">Due: ${formatDate(task.due_date)}</span>` : ''}
            </div>
            <div class="task-card-actions">
                <button class="status-toggle ${toggleClass}" onclick="toggleTaskStatus(${task.id}, '${task.status}')" title="Toggle status">
                    ${toggleLabel}
                </button>
                <button class="btn btn-sm btn-danger 3d-button-danger" onclick="confirmDelete(${task.id})" title="Delete task">
                    Delete
                </button>
            </div>
        </div>
    `;

    return card;
}

function updateStats(tasks) {
    fetch(`${API_BASE}/tasks`, {
        headers: { 'Authorization': `Bearer ${jwtToken}` },
        cache: 'no-store'
    })
        .then(r => r.json())
        .then(data => {
            const allTasks = data.tasks || [];
            document.getElementById('stat-total').textContent = allTasks.length;
            document.getElementById('stat-pending').textContent = allTasks.filter(t => t.status === 'pending').length;
            document.getElementById('stat-progress').textContent = allTasks.filter(t => t.status === 'in_progress').length;
            document.getElementById('stat-completed').textContent = allTasks.filter(t => t.status === 'completed').length;
        })
        .catch(() => {});
}


// ============================================
// Toast Notifications
// ============================================
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');

    const toast = document.createElement('div');
    toast.className = `toast ${type} 3d-toast`;
    toast.innerHTML = `
        <span class="toast-indicator"></span>
        <span>${escapeHtml(message)}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ============================================
// Task Interactions
// ============================================
function toggleTaskStatus(id, currentStatus) {
    const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';
    updateTask(id, { status: newStatus });
}

function confirmDelete(id) {
    if (confirm('Permanently delete this task?')) {
        deleteTask(id);
    }
}

// ============================================
// Utility Functions
// ============================================
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;

        const now = new Date();
        const isToday = date.toDateString() === now.toDateString();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const isTomorrow = date.toDateString() === tomorrow.toDateString();

        if (isToday) return 'Today';
        if (isTomorrow) return 'Tomorrow';

        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
        });
    } catch {
        return dateStr;
    }
}

function getPriorityColor(priority) {
    const colors = {
        urgent: '#ef4444',
        high: '#f59e0b',
        medium: '#3b82f6',
        low: '#10b981',
    };
    return colors[priority] || colors.medium;
}

// ============================================
// Task Review Modal Logic
// ============================================
let currentReviewTask = null;

function openReviewModal(task) {
    currentReviewTask = task;
    document.getElementById('review-title').value = task.title || '';
    document.getElementById('review-desc').value = task.description || '';
    document.getElementById('review-priority').value = task.priority || 'medium';
    document.getElementById('review-date').value = task.due_date || '';

    const imgContainer = document.getElementById('review-image-container');
    if (task.source === 'ocr') {
        if (task.source_image) {
            const baseUrl = API_BASE.replace(/\/api\/?$/, ''); // Strip /api from the end
            imgContainer.innerHTML = `<img src="${baseUrl}${task.source_image}" style="width: 100%; border-radius: var(--radius-md); box-shadow: var(--shadow-inner); max-height: 400px; object-fit: contain;">`;
        } else {
            imgContainer.innerHTML = '<div style="text-align:center;"><div class="image-icon"></div><br>Screenshot Image Data (No Image Saved)</div>';
        }
    } else {
        imgContainer.innerHTML = 'No source image (Manual Task)';
    }

    document.getElementById('review-modal').style.display = 'flex';
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('close-review-btn')?.addEventListener('click', () => {
        document.getElementById('review-modal').style.display = 'none';
        currentReviewTask = null;
    });

    document.getElementById('save-review-btn')?.addEventListener('click', async () => {
        if (!currentReviewTask) return;
        
        const updateData = {
            title: document.getElementById('review-title').value,
            description: document.getElementById('review-desc').value,
            priority: document.getElementById('review-priority').value,
            due_date: document.getElementById('review-date').value
        };

        const btn = document.getElementById('save-review-btn');
        btn.disabled = true;
        btn.textContent = 'Committing...';

        try {
            const response = await fetch(`${API_BASE}/tasks/${currentReviewTask.id}`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${jwtToken}`
                },
                body: JSON.stringify(updateData),
            });
            if (!response.ok) throw new Error(`Server returned ${response.status}`);
            showToast('Task synchronized successfully', 'success');
            document.getElementById('review-modal').style.display = 'none';
            fetchTasks();
        } catch (err) {
            showToast('Failed to synchronize task', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Commit Changes';
        }
    });
});
