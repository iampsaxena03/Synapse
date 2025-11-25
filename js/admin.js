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
    
    // Views
    usersView: document.getElementById('view-users'),
    clubsView: document.getElementById('view-clubs'),
    analyticsView: document.getElementById('view-analytics'),
    
    // Tables
    usersTable: document.getElementById('users-table-body'),
    clubsTable: document.getElementById('clubs-table-body'),
    
    // Stats
    statTotal: document.getElementById('stat-total'),
    statOnline: document.getElementById('stat-online'),
    
    // Title
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
    
    // Start Clock
    setInterval(() => {
        dom.clock.textContent = new Date().toLocaleTimeString();
    }, 1000);
    
    // Start Listeners
    listenToUsers();
    listenToClubs();

    // Fast Local Refresh (1s)
    setInterval(() => refreshUI(), 1000); 
}

// --- DATA LISTENERS ---
function listenToUsers() {
    dom.usersTable.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">Establishing Uplink...</td></tr>';
    listeners.users = db.collection('users').orderBy('lastSeen', 'desc').onSnapshot(snap => {
        state.users = [];
        snap.forEach(doc => state.users.push({ id: doc.id, ...doc.data() }));
        refreshUI();
    });
}

function listenToClubs() {
    listeners.clubs = db.collection('clubs').onSnapshot(snap => {
        state.clubs = [];
        snap.forEach(doc => state.clubs.push({ id: doc.id, ...doc.data() }));
        renderClubs();
    });
}

// --- CORE LOGIC ---
function calculateRealStatus(lastSeenTimestamp) {
    if (!lastSeenTimestamp) return false;
    const date = lastSeenTimestamp.toDate ? lastSeenTimestamp.toDate() : new Date(lastSeenTimestamp);
    const diff = (new Date() - date) / 1000;
    return diff < 20; // 20 Second Threshold
}

function getTimeAgo(timestamp) {
    if (!timestamp) return 'Never';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
}

// --- RENDER FUNCTIONS ---
function refreshUI() {
    renderUsers();
    updateStats();
    updateChart();
}

function renderUsers() {
    if (!state.users.length) return;
    let html = '';
    
    state.users.forEach(user => {
        const isOnline = calculateRealStatus(user.lastSeen);
        const isBanned = user.isBanned === true;
        const time = getTimeAgo(user.lastSeen);
        const avatar = user.photoURL || 'https://via.placeholder.com/40';

        html += `
            <tr style="opacity: ${isBanned ? '0.5' : '1'}">
                <td style="display:flex; align-items:center; gap:12px;">
                    <img src="${avatar}" style="width:35px; height:35px; border-radius:50%; object-fit:cover;">
                    <div>
                        <div style="font-weight:600; color:white;">${user.displayName || 'Unknown'}</div>
                        <div style="font-size:11px; opacity:0.7;">${user.email}</div>
                    </div>
                </td>
                <td style="color:var(--accent-color);">@${user.customId || '--'}</td>
                <td style="font-size:12px;">${time}</td>
                <td>
                    <span class="status-badge ${isBanned ? 'badge-banned' : (isOnline ? 'badge-online' : 'badge-offline')}">
                        ${isBanned ? 'BANNED' : (isOnline ? 'Online' : 'Offline')}
                    </span>
                </td>
                <td>
                    <button class="btn-mini btn-ban" onclick="window.toggleBan('${user.id}', ${isBanned})" title="${isBanned ? 'Unban' : 'Ban'}">
                        <i class="fa-solid ${isBanned ? 'fa-rotate-left' : 'fa-ban'}"></i>
                    </button>
                </td>
            </tr>
        `;
    });
    
    // Only update if changed (simple approach: replace HTML)
    dom.usersTable.innerHTML = html;
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

// --- STATS & CHARTS ---
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

// --- NAVIGATION ---
window.switchView = (viewName) => {
    [dom.usersView, dom.clubsView, dom.analyticsView].forEach(el => el.classList.add('hidden'));
    
    if(viewName === 'users') { dom.usersView.classList.remove('hidden'); dom.pageTitle.textContent = "User Management"; }
    if(viewName === 'clubs') { dom.clubsView.classList.remove('hidden'); dom.pageTitle.textContent = "Club Manager"; }
    if(viewName === 'analytics') { dom.analyticsView.classList.remove('hidden'); dom.pageTitle.textContent = "Data Visualizer"; }
};