import { db, auth, FieldValue } from './config.js';

// --- GLOBAL STATE ---
let state = { 
    users: [], 
    clubs: [], 
    activeClubId: null, 
    chartInstance: null,
    listeners: { users: null, clubs: null }
};
let tempMembers = new Set(); 

// --- DOM ELEMENTS ---
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
    
    // Tables & Stats
    usersTable: document.getElementById('users-table-body'),
    clubsTable: document.getElementById('clubs-table-body'),
    statTotal: document.getElementById('stat-total'),
    statOnline: document.getElementById('stat-online'),
    
    // Modals
    modalCreate: document.getElementById('modal-create-club'),
    modalManage: document.getElementById('modal-manage-club'),
    clock: document.getElementById('live-clock')
};

// --- 1. AUTHENTICATION ---
dom.gateBtn.addEventListener('click', async () => {
    const id = dom.gateId.value.trim();
    const pass = dom.gatePass.value.trim();
    if (!id || !pass) return;

    dom.gateBtn.textContent = "Verifying Uplink...";
    try {
        // 1. Anonymous Auth for Firestore Access
        if (!auth.currentUser) await auth.signInAnonymously();
        
        // 2. Verify Admin Credentials against DB
        const doc = await db.collection('settings').doc('admin_access').get();
        
        // Fail-safe for first run if settings doc doesn't exist
        let adminData = { adminId: 'admin', adminPass: 'admin' };
        if (doc.exists) adminData = doc.data();
        
        if (id === adminData.adminId && pass === adminData.adminPass) {
            unlockDashboard();
        } else {
            throw new Error("Access Denied: Invalid Credentials");
        }
    } catch (e) {
        console.error(e);
        dom.error.textContent = e.message;
        dom.gateBtn.textContent = "Authorize Access";
    }
});

function unlockDashboard() {
    dom.gate.style.display = 'none';
    dom.dashboard.classList.remove('hidden');
    
    // Start Clock
    setInterval(() => dom.clock.textContent = new Date().toLocaleTimeString(), 1000);
    
    // Show Loading States
    dom.usersTable.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px; opacity: 0.5;">Establishing Uplink...</td></tr>';
    
    // Initialize Data Streams
    listenToUsers();
    listenToClubs();
    
    // Start Live Ticker (Updates "X minutes ago" without re-fetching DB)
    setInterval(updateLiveRows, 5000); // 5s interval is sufficient

    // Global Click Handler (Close menus)
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.action-menu-container')) {
            document.querySelectorAll('.admin-dropdown').forEach(el => el.classList.add('hidden'));
        }
        if (!e.target.closest('.search-wrapper')) {
            document.querySelectorAll('.dropdown-list').forEach(el => el.classList.add('hidden'));
        }
    });
}

// --- 2. DATA LISTENERS (FLAWLESS LOGIC) ---

function listenToUsers() {
    // CRITICAL FIX: Removed .orderBy('lastSeen').
    // Firestore excludes docs missing the sort field. Removing this gets ALL users.
    state.listeners.users = db.collection('users').onSnapshot(snap => {
        state.users = [];
        snap.forEach(doc => {
            state.users.push({ id: doc.id, ...doc.data() });
        });

        // Sort in Memory (Robust fallback for missing dates)
        state.users.sort((a, b) => {
            const timeA = a.lastSeen ? (a.lastSeen.toMillis ? a.lastSeen.toMillis() : new Date(a.lastSeen).getTime()) : 0;
            const timeB = b.lastSeen ? (b.lastSeen.toMillis ? b.lastSeen.toMillis() : new Date(b.lastSeen).getTime()) : 0;
            return timeB - timeA; // Descending
        });

        renderUsers(); 
        updateStats();
        
        // Only update chart if we are looking at it, otherwise it glitches
        if (!dom.analyticsView.classList.contains('hidden')) {
            updateChart();
        }
    });
}

function listenToClubs() {
    state.listeners.clubs = db.collection('clubs').onSnapshot(snap => {
        state.clubs = [];
        snap.forEach(doc => state.clubs.push({ id: doc.id, ...doc.data() }));
        renderClubs();
    });
}

// --- 3. LOGIC: TIME & STATUS ---

function getSafeDate(ts) {
    if (!ts) return null;
    return ts.toDate ? ts.toDate() : new Date(ts);
}

function calculateRealStatus(ts) {
    const date = getSafeDate(ts);
    if (!date) return false;
    return ((new Date() - date) / 1000) < 40; // Increased to 40s to prevent flickering
}

function formatLastSeen(ts) {
    const date = getSafeDate(ts);
    if (!date) return 'Never';
    
    const now = new Date();
    const diff = (now - date) / 1000;
    
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
    
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// --- 4. RENDERERS ---

function renderUsers() {
    if (state.users.length === 0) {
        dom.usersTable.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">No Users Found</td></tr>';
        return;
    }

    // Preserve open menu if exists
    const openMenuId = document.querySelector('.admin-dropdown:not(.hidden)')?.id;
    
    let html = '';
    state.users.forEach(user => {
        const isOnline = calculateRealStatus(user.lastSeen);
        const isBanned = user.isBanned === true;
        const photo = user.photoURL || 'https://via.placeholder.com/40';
        
        html += `
            <tr id="row-${user.id}" class="user-row" style="opacity: ${isBanned ? '0.5' : '1'}">
                <td style="display:flex; align-items:center; gap:12px;">
                    <img src="${photo}" onerror="this.src='https://via.placeholder.com/40'" style="width:35px; height:35px; border-radius:50%; object-fit:cover;">
                    <div>
                        <div style="font-weight:600; color:white;">${escapeHtml(user.displayName || 'Unknown')}</div>
                        <div style="font-size:11px; opacity:0.7;">${escapeHtml(user.email || 'No Email')}</div>
                    </div>
                </td>
                <td style="color:var(--accent-color);">@${escapeHtml(user.customId || '--')}</td>
                <td class="time-label" style="font-size:12px;">${formatLastSeen(user.lastSeen)}</td>
                <td>
                    <span class="status-badge ${isBanned?'badge-banned':(isOnline?'badge-online':'badge-offline')}">
                        ${isBanned ? 'BANNED' : (isOnline ? 'ONLINE' : 'OFFLINE')}
                    </span>
                </td>
                <td style="overflow:visible;">
                    <div class="action-buttons-row">
                        <div class="action-menu-container">
                            <button class="btn-mini btn-menu" onclick="event.stopPropagation(); window.toggleMenu('${user.id}')"><i class="fa-solid fa-ellipsis-vertical"></i></button>
                            <div id="menu-${user.id}" class="admin-dropdown hidden">
                                <div class="dropdown-item" onclick="window.toggleBan('${user.id}', ${isBanned})"><i class="fa-solid ${isBanned?'fa-rotate-left':'fa-ban'}"></i> ${isBanned?'Unban User':'Ban User'}</div>
                                <div class="dropdown-item danger" onclick="window.deleteUser('${user.id}')"><i class="fa-solid fa-trash"></i> Delete User</div>
                            </div>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    });
    dom.usersTable.innerHTML = html;
    
    // Restore menu state
    if (openMenuId) document.getElementById(openMenuId)?.classList.remove('hidden');
}

function updateLiveRows() {
    // Only update text content, do not re-render innerHTML (Performance)
    state.users.forEach(user => {
        const row = document.getElementById(`row-${user.id}`);
        if (!row) return;
        
        const isOnline = calculateRealStatus(user.lastSeen);
        const isBanned = user.isBanned === true;
        
        // 1. Update Time
        row.querySelector('.time-label').textContent = formatLastSeen(user.lastSeen);
        
        // 2. Update Badge
        const badge = row.querySelector('.status-badge');
        if (badge && !isBanned) {
            const desiredClass = isOnline ? 'badge-online' : 'badge-offline';
            const desiredText = isOnline ? 'ONLINE' : 'OFFLINE';
            
            // Only touch DOM if changed
            if (!badge.classList.contains(desiredClass)) {
                badge.className = `status-badge ${desiredClass}`;
                badge.textContent = desiredText;
            }
        }
    });
    updateStats();
}

function renderClubs() {
    let html = '';
    state.clubs.forEach(club => {
        const count = club.members ? club.members.length : 0;
        const isPrivate = club.isPrivate === true;
        const isOfficial = club.isOfficial === true;
        
        html += `
            <tr>
                <td style="display:flex; align-items:center; gap:12px;">
                    <i class="${club.icon || 'fa-solid fa-users'}" style="color: var(--gold);"></i>
                    <span style="font-weight:600; color:white;">${escapeHtml(club.name)}</span>
                </td>
                <td>
                    ${isOfficial ? '<span style="color:var(--gold); font-size:11px;"><i class="fa-solid fa-certificate"></i> Official</span>' : '<span style="opacity:0.5; font-size:11px;">Community</span>'}
                    ${club.isAnonymous ? '<span style="color:var(--accent-color); font-size:11px; margin-left:5px;"><i class="fa-solid fa-mask"></i> Anon</span>' : ''}
                </td>
                <td>${isPrivate ? '<span style="color:var(--danger)"><i class="fa-solid fa-lock"></i> Private</span>' : '<span style="color:var(--success)">Public</span>'}</td>
                <td>${count} Members</td>
                <td>
                    <div class="action-buttons-row">
                        <button class="btn-mini btn-inspect" onclick="window.openManager('${club.id}')"><i class="fa-solid fa-gear"></i></button>
                    </div>
                </td>
            </tr>
        `;
    });
    dom.clubsTable.innerHTML = html;
}

// --- 5. VISUALIZATION & STATS ---

function updateStats() {
    dom.statTotal.textContent = state.users.length;
    dom.statOnline.textContent = state.users.filter(u => calculateRealStatus(u.lastSeen)).length;
}

function updateChart() {
    const online = state.users.filter(u => calculateRealStatus(u.lastSeen)).length;
    const offline = state.users.length - online;
    
    const ctx = document.getElementById('userChart');
    if (!ctx) return;

    // Destroy old instance to prevent "canvas reuse" errors or memory leaks
    if (state.chartInstance) {
        state.chartInstance.destroy();
    }

    state.chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Online Agents', 'Offline Agents'],
            datasets: [{ 
                data: [online, offline], 
                backgroundColor: ['#00b894', '#2d3436'],
                borderColor: '#15122e',
                borderWidth: 2
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            animation: { duration: 800 },
            plugins: { 
                legend: { position: 'bottom', labels: { color: '#b2bec3', font: { family: 'Outfit' } } } 
            } 
        }
    });
}

// --- 6. NAVIGATION & ACTIONS ---

window.switchView = (v) => {
    // Hide all
    dom.usersView.classList.add('hidden');
    dom.clubsView.classList.add('hidden');
    dom.analyticsView.classList.add('hidden');
    
    // Reset Tabs
    document.querySelectorAll('.nav-tab').forEach(btn => btn.classList.remove('active'));
    
    // Show selected
    if(v === 'users') {
        dom.usersView.classList.remove('hidden');
        document.querySelector('[onclick="window.switchView(\'users\')"]').classList.add('active');
    }
    if(v === 'clubs') {
        dom.clubsView.classList.remove('hidden');
        document.querySelector('[onclick="window.switchView(\'clubs\')"]').classList.add('active');
    }
    if(v === 'analytics') {
        dom.analyticsView.classList.remove('hidden');
        document.querySelector('[onclick="window.switchView(\'analytics\')"]').classList.add('active');
        // CRITICAL FIX: Render chart only when view is visible so dimensions are correct
        setTimeout(updateChart, 50);
    }
};

window.toggleMenu = (uid) => {
    const menu = document.getElementById(`menu-${uid}`);
    const wasHidden = menu.classList.contains('hidden');
    document.querySelectorAll('.admin-dropdown').forEach(el => el.classList.add('hidden'));
    if (wasHidden) menu.classList.remove('hidden');
};

window.toggleBan = async (uid, current) => {
    if (!confirm(`Are you sure you want to ${current ? 'UNBAN' : 'BAN'} this user?`)) return;
    try { await db.collection('users').doc(uid).update({ isBanned: !current }); } catch(e) { alert(e.message); }
};

window.deleteUser = async (uid) => {
    if (!confirm("⚠️ DANGER: This will permanently delete the user profile from the database.")) return;
    try {
        await db.collection('users').doc(uid).delete();
        alert("User record deleted.");
    } catch(e) { alert("Delete Error: " + e.message); }
};

// --- 7. CLUB MANAGEMENT (Create/Edit) ---

window.openClubCreator = () => {
    tempMembers.clear();
    renderTempMembers();
    dom.modalCreate.classList.remove('hidden');
};

window.searchUsersForClub = (q) => {
    const box = document.getElementById('user-search-results');
    if (!q) { box.classList.add('hidden'); return; }
    
    // Filter existing users in memory (fast)
    const matches = state.users
        .filter(u => (u.displayName||'').toLowerCase().includes(q.toLowerCase()))
        .slice(0, 5);
    
    box.innerHTML = '';
    matches.forEach(u => {
        const d = document.createElement('div');
        d.innerHTML = `<img src="${u.photoURL || 'https://via.placeholder.com/30'}"> ${escapeHtml(u.displayName)}`;
        d.onclick = () => { 
            tempMembers.add(u.id); 
            renderTempMembers(); 
            document.getElementById('search-users-input').value=''; 
            box.classList.add('hidden'); 
        };
        box.appendChild(d);
    });
    box.classList.remove('hidden');
};

function renderTempMembers() {
    const c = document.getElementById('selected-members-list');
    c.innerHTML = '';
    tempMembers.forEach(uid => {
        const u = state.users.find(user => user.id === uid);
        if(u) {
            const chip = document.createElement('div');
            chip.className = 'chip';
            chip.innerHTML = `${escapeHtml(u.displayName)} <i class="fa-solid fa-xmark" onclick="window.removeTemp('${uid}')"></i>`;
            c.appendChild(chip);
        }
    });
}
window.removeTemp = (uid) => { tempMembers.delete(uid); renderTempMembers(); };

window.submitNewClub = async () => {
    const name = document.getElementById('create-name').value.trim();
    if(!name) return alert("Name required");
    try {
        await db.collection('clubs').add({
            name: name,
            description: document.getElementById('create-desc').value,
            icon: document.getElementById('create-icon').value,
            isAnonymous: document.getElementById('create-anon').checked,
            isOfficial: document.getElementById('create-official').checked,
            isPrivate: document.getElementById('create-private').checked,
            members: Array.from(tempMembers),
            createdAt: FieldValue.serverTimestamp(),
            lastMessageAt: FieldValue.serverTimestamp(), // Fix for sorting visibility
            createdBy: 'ADMIN'
        });
        window.closeModals();
    } catch(e) { alert(e.message); }
};

// Manager Logic
window.openManager = (cid) => {
    state.activeClubId = cid;
    const club = state.clubs.find(c => c.id === cid);
    if(!club) return;
    document.getElementById('manage-title').textContent = club.name;
    document.getElementById('manage-id').textContent = "ID: " + club.id;
    renderManagerList(club.members || []);
    dom.modalManage.classList.remove('hidden');
};

function renderManagerList(m) {
    const list = document.getElementById('manage-members-list');
    list.innerHTML = '';
    if(!m || !m.length) list.innerHTML = '<div style="padding:20px; text-align:center; opacity:0.5">No Members</div>';
    
    (m || []).forEach(uid => {
        const u = state.users.find(user => user.id === uid);
        if(u) {
            const d = document.createElement('div');
            d.style.cssText = "display:flex; justify-content:space-between; padding:10px; background:rgba(255,255,255,0.05); border-radius:8px; margin-bottom:5px; align-items:center;";
            d.innerHTML = `
                <div style="display:flex;align-items:center;gap:10px">
                    <img src="${u.photoURL || 'https://via.placeholder.com/30'}" style="width:30px;height:30px;border-radius:50%">
                    <span>${escapeHtml(u.displayName)}</span>
                </div> 
                <button class="btn-mini btn-ban" onclick="window.kickMember('${uid}')"><i class="fa-solid fa-minus"></i></button>`;
            list.appendChild(d);
        }
    });
}

window.searchUsersForManager = (q) => {
    const box = document.getElementById('manage-search-results');
    if (!q) { box.classList.add('hidden'); return; }
    
    const club = state.clubs.find(c => c.id === state.activeClubId);
    if (!club) return;
    
    const existing = new Set(club.members || []);
    
    const matches = state.users
        .filter(u => !existing.has(u.id) && (u.displayName||'').toLowerCase().includes(q.toLowerCase()))
        .slice(0, 5);
    
    box.innerHTML = '';
    matches.forEach(u => {
        const d = document.createElement('div');
        d.innerHTML = `<img src="${u.photoURL || 'https://via.placeholder.com/30'}"> ${escapeHtml(u.displayName)}`;
        d.onclick = () => { 
            window.addMemberToClub(u.id); 
            document.getElementById('manage-search-input').value=''; 
            box.classList.add('hidden'); 
        };
        box.appendChild(d);
    });
    box.classList.remove('hidden');
};

window.addMemberToClub = async (uid) => { 
    await db.collection('clubs').doc(state.activeClubId).update({ members: FieldValue.arrayUnion(uid) });
    // UI update handled by listener automatically
    setTimeout(() => {
        const club = state.clubs.find(c => c.id === state.activeClubId);
        if(club) renderManagerList(club.members);
    }, 500);
};

window.kickMember = async (uid) => { 
    if(confirm("Remove user from club?")) {
        await db.collection('clubs').doc(state.activeClubId).update({ members: FieldValue.arrayRemove(uid) });
        // UI update handled by listener automatically
        setTimeout(() => {
            const club = state.clubs.find(c => c.id === state.activeClubId);
            if(club) renderManagerList(club.members);
        }, 500);
    }
};

window.deleteCurrentClub = async () => { 
    if(confirm("Delete Club Permanently? This cannot be undone.")) {
        await db.collection('clubs').doc(state.activeClubId).delete();
        window.closeModals();
    }
};

window.closeModals = () => {
    dom.modalCreate.classList.add('hidden');
    dom.modalManage.classList.add('hidden');
    state.activeClubId = null;
};

// Utils
function escapeHtml(text) {
    if (!text) return text;
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}