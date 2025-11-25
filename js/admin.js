import { db, auth } from './config.js';

// --- GLOBAL STATE ---
let state = { users: [], clubs: [], chartInstance: null };
let listeners = { users: null, clubs: null }; 

// --- DOM CACHE ---
const dom = {
    gate: document.getElementById('admin-gate'),
    dashboard: document.getElementById('admin-dashboard'),
    gateBtn: document.getElementById('gate-btn'),
    gateId: document.getElementById('gate-id'),
    gatePass: document.getElementById('gate-pass'),
    error: document.getElementById('gate-error'),
    
    // Views & Tables
    usersView: document.getElementById('view-users'),
    clubsView: document.getElementById('view-clubs'),
    analyticsView: document.getElementById('view-analytics'),
    usersTable: document.getElementById('users-table-body'),
    clubsTable: document.getElementById('clubs-table-body'),
    
    // Stats & Title
    statTotal: document.getElementById('stat-total'),
    statOnline: document.getElementById('stat-online'),
    pageTitle: document.getElementById('page-title'),
    clock: document.getElementById('live-clock')
};

// --- AUTHENTICATION ---
dom.gateBtn.addEventListener('click', async () => {
    const id = dom.gateId.value.trim();
    const pass = dom.gatePass.value.trim();
    if (!id || !pass) return;

    dom.gateBtn.textContent = "Connecting...";
    try {
        await auth.signInAnonymously();
        const doc = await db.collection('settings').doc('admin_access').get();
        
        if (!doc.exists) throw new Error("Settings DB missing.");
        const data = doc.data();
        
        if (id === data.adminId && pass === data.adminPass) {
            unlockDashboard();
        } else {
            throw new Error("Invalid Credentials.");
        }
    } catch (e) {
        dom.error.textContent = e.message;
        dom.gateBtn.textContent = "Authorize Access";
    }
});

function unlockDashboard() {
    dom.gate.style.display = 'none';
    dom.dashboard.classList.remove('hidden');
    
    setInterval(() => {
        dom.clock.textContent = new Date().toLocaleTimeString();
    }, 1000);
    
    listenToUsers();
    listenToClubs();

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.action-menu-container')) {
            document.querySelectorAll('.admin-dropdown').forEach(el => el.classList.add('hidden'));
        }
    });

    setInterval(updateLiveRows, 1000);
}

// --- DATA LISTENERS ---
function listenToUsers() {
    dom.usersTable.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">Establishing Uplink...</td></tr>';
    listeners.users = db.collection('users').orderBy('lastSeen', 'desc').onSnapshot(snap => {
        state.users = [];
        snap.forEach(doc => state.users.push({ id: doc.id, ...doc.data() }));
        renderUsers(); 
        updateStats();
        updateChart();
    });
}

function listenToClubs() {
    listeners.clubs = db.collection('clubs').onSnapshot(snap => {
        state.clubs = [];
        snap.forEach(doc => state.clubs.push({ id: doc.id, ...doc.data() }));
        renderClubs();
    });
}

// --- LOGIC ---
function calculateRealStatus(lastSeenTimestamp) {
    if (!lastSeenTimestamp) return false;
    const date = lastSeenTimestamp.toDate ? lastSeenTimestamp.toDate() : new Date(lastSeenTimestamp);
    const diff = (new Date() - date) / 1000;
    return diff < 25; 
}

function formatLastSeen(timestamp) {
    if (!timestamp) return 'Never';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();

    if (date.toDateString() === now.toDateString()) return `Today ${timeStr}`;
    if (date.toDateString() === yesterday.toDateString()) return `Yesterday ${timeStr}`;
    
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    return `${day}/${month}/${year} ${timeStr}`;
}

// --- RENDERERS ---
function renderUsers() {
    if (!state.users.length) return;
    const openMenuId = document.querySelector('.admin-dropdown:not(.hidden)')?.id;

    let html = '';
    state.users.forEach(user => {
        const isOnline = calculateRealStatus(user.lastSeen);
        const isBanned = user.isBanned === true;
        const timeFormatted = formatLastSeen(user.lastSeen);
        const avatar = user.photoURL || 'https://via.placeholder.com/40';

        html += `
            <tr id="row-${user.id}" class="user-row" data-uid="${user.id}" style="opacity: ${isBanned ? '0.5' : '1'}">
                <td style="display:flex; align-items:center; gap:12px;">
                    <img src="${avatar}" style="width:35px; height:35px; border-radius:50%; object-fit:cover;">
                    <div>
                        <div style="font-weight:600; color:white;">${user.displayName || 'Unknown'}</div>
                        <div style="font-size:11px; opacity:0.7;">${user.email}</div>
                    </div>
                </td>
                <td style="color:var(--accent-color);">@${user.customId || '--'}</td>
                <td class="last-seen-label" style="font-size:12px;">${timeFormatted}</td>
                <td>
                    <span class="status-badge ${isBanned ? 'badge-banned' : (isOnline ? 'badge-online' : 'badge-offline')}">
                        ${isBanned ? 'BANNED' : (isOnline ? 'Online' : 'Offline')}
                    </span>
                </td>
                <td style="overflow: visible;">
                    <div class="action-menu-container">
                        <div class="action-buttons-row">
                            <button class="btn-mini btn-ban" onclick="window.toggleBan('${user.id}', ${isBanned})" title="${isBanned ? 'Unban' : 'Ban'}">
                                <i class="fa-solid ${isBanned ? 'fa-rotate-left' : 'fa-ban'}"></i>
                            </button>
                            <button class="btn-mini btn-menu" onclick="event.stopPropagation(); window.toggleMenu('${user.id}')">
                                <i class="fa-solid fa-ellipsis-vertical"></i>
                            </button>
                        </div>
                        <div id="menu-${user.id}" class="admin-dropdown hidden">
                            <div class="dropdown-item danger" onclick="window.deleteUser('${user.id}')">
                                <i class="fa-solid fa-trash"></i> Delete User
                            </div>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    });
    dom.usersTable.innerHTML = html;

    if (openMenuId) {
        const menu = document.getElementById(openMenuId);
        if (menu) menu.classList.remove('hidden');
    }
}

function updateLiveRows() {
    state.users.forEach(user => {
        const row = document.getElementById(`row-${user.id}`);
        if (!row) return;

        const timeLabel = row.querySelector('.last-seen-label');
        if (timeLabel) timeLabel.textContent = formatLastSeen(user.lastSeen);

        const isOnline = calculateRealStatus(user.lastSeen);
        const isBanned = user.isBanned === true;
        const badge = row.querySelector('.status-badge');
        
        if (badge && !isBanned) {
            const currentClass = badge.classList.contains('badge-online') ? 'online' : 'offline';
            const newStatus = isOnline ? 'online' : 'offline';

            if (currentClass !== newStatus) {
                badge.className = `status-badge ${isOnline ? 'badge-online' : 'badge-offline'}`;
                badge.textContent = isOnline ? 'Online' : 'Offline';
            }
        }
    });
    updateStats();
    updateChart();
}

function renderClubs() {
    let html = '';
    state.clubs.forEach(club => {
        html += `
            <tr>
                <td style="display:flex; align-items:center; gap:12px;">
                    <i class="${club.icon || 'fa-solid fa-users'}" style="color: var(--gold);"></i>
                    <span style="font-weight:600; color:white;">${club.name}</span>
                </td>
                <td>${club.isAnonymous ? 'Anonymous' : 'Public'}</td>
                <td style="font-family:monospace; font-size:11px; color:var(--text-secondary);">${club.id}</td>
                <td>
                    <button class="btn-mini btn-ban" onclick="window.deleteClub('${club.id}')">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    });
    dom.clubsTable.innerHTML = html;
}

// --- ACTIONS ---
window.toggleBan = async (uid, currentStatus) => {
    if(!confirm(`Confirm ${currentStatus ? 'UNBAN' : 'BAN'} action?`)) return;
    try { await db.collection('users').doc(uid).update({ isBanned: !currentStatus }); }
    catch(e) { alert("Error: " + e.message); }
};

window.toggleMenu = (uid) => {
    const targetMenu = document.getElementById(`menu-${uid}`);
    const isHidden = targetMenu.classList.contains('hidden');
    document.querySelectorAll('.admin-dropdown').forEach(el => el.classList.add('hidden'));
    if (isHidden) targetMenu.classList.remove('hidden');
};

window.deleteUser = async (uid) => {
    if (!confirm("⚠️ DANGER: PERMANENTLY DELETE USER?\n\nThis will wipe their profile. It cannot be undone.")) return;
    try {
        const batch = db.batch();
        const userRef = db.collection('users').doc(uid);
        batch.delete(userRef);
        await batch.commit();
        alert("User Profile Erased.");
    } catch(e) {
        console.error(e);
        alert("Delete failed: " + e.message + "\n\n(Check Firestore Rules!)");
    }
};

document.getElementById('btn-create-club').addEventListener('click', async () => {
    const name = document.getElementById('new-club-name').value.trim();
    const icon = document.getElementById('new-club-icon').value;
    if(!name) return;
    try {
        await db.collection('clubs').add({
            name: name, icon: icon, isAnonymous: icon.includes('mask'),
            createdAt: firebase.firestore.FieldValue.serverTimestamp(), createdBy: 'ADMIN'
        });
        document.getElementById('new-club-name').value = '';
    } catch(e) { alert("Error"); }
});

window.deleteClub = async (id) => {
    if(!confirm("Permanently delete this club?")) return;
    try { await db.collection('clubs').doc(id).delete(); } catch(e) { alert("Error"); }
};

function updateStats() {
    const online = state.users.filter(u => calculateRealStatus(u.lastSeen)).length;
    dom.statTotal.textContent = state.users.length;
    dom.statOnline.textContent = online;
    return online;
}

function updateChart() {
    const online = updateStats();
    const offline = state.users.length - online;
    const ctx = document.getElementById('userChart').getContext('2d');
    
    if (state.chartInstance) {
        state.chartInstance.data.datasets[0].data = [online, offline];
        state.chartInstance.update();
    } else {
        state.chartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Online Agents', 'Offline Agents'],
                datasets: [{ data: [online, offline], backgroundColor: ['#00b894', '#2d3436'], borderWidth: 0 }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#b2bec3' } } } }
        });
    }
}

// --- NAVIGATION (FIXED) ---
window.switchView = (viewName) => {
    // 1. HIDE ALL VIEWS
    [dom.usersView, dom.clubsView, dom.analyticsView].forEach(el => el.classList.add('hidden'));
    
    // 2. SHOW TARGET VIEW
    if(viewName === 'users') { dom.usersView.classList.remove('hidden'); dom.pageTitle.textContent = "User Management"; }
    if(viewName === 'clubs') { dom.clubsView.classList.remove('hidden'); dom.pageTitle.textContent = "Club Manager"; }
    if(viewName === 'analytics') { dom.analyticsView.classList.remove('hidden'); dom.pageTitle.textContent = "Data Visualizer"; }

    // 3. UPDATE SIDEBAR BUTTONS
    const buttons = document.querySelectorAll('.nav-tab');
    buttons.forEach(btn => {
        // Simple logic: check if the onclick attribute contains the viewName
        if (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(viewName)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
};