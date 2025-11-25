import { db, auth, FieldValue } from './config.js';

// --- GLOBAL STATE ---
let state = { users: [], clubs: [], activeClubId: null, chartInstance: null };
let tempMembers = new Set(); 
let listeners = { users: null, clubs: null }; 

// --- DOM ELEMENTS ---
const dom = {
    gate: document.getElementById('admin-gate'),
    dashboard: document.getElementById('admin-dashboard'),
    gateBtn: document.getElementById('gate-btn'),
    gateId: document.getElementById('gate-id'),
    gatePass: document.getElementById('gate-pass'),
    error: document.getElementById('gate-error'),
    usersView: document.getElementById('view-users'),
    clubsView: document.getElementById('view-clubs'),
    analyticsView: document.getElementById('view-analytics'),
    usersTable: document.getElementById('users-table-body'),
    clubsTable: document.getElementById('clubs-table-body'),
    modalCreate: document.getElementById('modal-create-club'),
    modalManage: document.getElementById('modal-manage-club'),
    clock: document.getElementById('live-clock')
};

// --- 1. AUTHENTICATION ---
dom.gateBtn.addEventListener('click', async () => {
    const id = dom.gateId.value.trim();
    const pass = dom.gatePass.value.trim();
    if (!id || !pass) return;

    dom.gateBtn.textContent = "Connecting...";
    try {
        await auth.signInAnonymously();
        const doc = await db.collection('settings').doc('admin_access').get();
        if (!doc.exists) throw new Error("System Error: Security DB Missing");
        const data = doc.data();
        
        if (id === data.adminId && pass === data.adminPass) {
            unlockDashboard();
        } else {
            throw new Error("Access Denied");
        }
    } catch (e) {
        dom.error.textContent = e.message;
        dom.gateBtn.textContent = "Authorize Access";
    }
});

function unlockDashboard() {
    dom.gate.style.display = 'none';
    dom.dashboard.classList.remove('hidden');
    
    setInterval(() => dom.clock.textContent = new Date().toLocaleTimeString(), 1000);
    
    listenToUsers();
    listenToClubs();
    
    // Live Surgical Updates (Every 1s)
    setInterval(updateLiveRows, 1000);

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

// --- 2. DATA LISTENERS ---
function listenToUsers() {
    listeners.users = db.collection('users').orderBy('lastSeen', 'desc').onSnapshot(snap => {
        state.users = [];
        snap.forEach(doc => state.users.push({ id: doc.id, ...doc.data() }));
        renderUsers(); // Full render only on data change
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

// --- 3. LOGIC: TIME & STATUS ---
function calculateRealStatus(ts) {
    if (!ts) return false;
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return ((new Date() - date) / 1000) < 25; // 25s Threshold
}

function formatLastSeen(ts) {
    if (!ts) return 'Never';
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    const now = new Date();
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
    const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
    
    if (date.toDateString() === now.toDateString()) return `Today ${time}`;
    if (date.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;
    
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = String(date.getFullYear()).slice(-2);
    return `${d}/${m}/${y} ${time}`;
}

// --- 4. RENDERERS ---
function renderUsers() {
    if (!state.users.length) return;
    const openMenuId = document.querySelector('.admin-dropdown:not(.hidden)')?.id;
    
    let html = '';
    state.users.forEach(user => {
        const isOnline = calculateRealStatus(user.lastSeen);
        const isBanned = user.isBanned === true;
        
        html += `
            <tr id="row-${user.id}" class="user-row" style="opacity: ${isBanned ? '0.5' : '1'}">
                <td style="display:flex; align-items:center; gap:12px;">
                    <img src="${user.photoURL || 'https://via.placeholder.com/40'}" style="width:35px; height:35px; border-radius:50%; object-fit:cover;">
                    <div><div style="font-weight:600; color:white;">${user.displayName}</div><div style="font-size:11px; opacity:0.7;">${user.email}</div></div>
                </td>
                <td style="color:var(--accent-color);">@${user.customId || '--'}</td>
                <td class="time-label" style="font-size:12px;">${formatLastSeen(user.lastSeen)}</td>
                <td><span class="status-badge ${isBanned?'badge-banned':(isOnline?'badge-online':'badge-offline')}">${isBanned?'BANNED':(isOnline?'Online':'Offline')}</span></td>
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
    if (openMenuId) document.getElementById(openMenuId)?.classList.remove('hidden');
}

function updateLiveRows() {
    state.users.forEach(user => {
        const row = document.getElementById(`row-${user.id}`);
        if (!row) return;
        
        // Update Time Text
        row.querySelector('.time-label').textContent = formatLastSeen(user.lastSeen);
        
        // Update Badge Logic
        const isOnline = calculateRealStatus(user.lastSeen);
        const isBanned = user.isBanned === true;
        const badge = row.querySelector('.status-badge');
        
        if (badge && !isBanned) {
            const newClass = isOnline ? 'badge-online' : 'badge-offline';
            if (!badge.classList.contains(newClass)) {
                badge.className = `status-badge ${newClass}`;
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
        const count = club.members ? club.members.length : 0;
        const isPrivate = club.isPrivate === true;
        const isOfficial = club.isOfficial === true;
        
        html += `
            <tr>
                <td style="display:flex; align-items:center; gap:12px;">
                    <i class="${club.icon || 'fa-solid fa-users'}" style="color: var(--gold);"></i>
                    <span style="font-weight:600; color:white;">${club.name}</span>
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

// --- 5. ACTIONS ---
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
    if (!confirm("⚠️ DANGER: This will permanently delete the user profile and data.")) return;
    try {
        const batch = db.batch();
        batch.delete(db.collection('users').doc(uid));
        await batch.commit();
        alert("Profile Deleted. (Auth removal requires Cloud Function)");
    } catch(e) { alert("Delete Error: " + e.message); }
};

// --- 6. CLUB MANAGEMENT ---
window.openClubCreator = () => {
    tempMembers.clear();
    renderTempMembers();
    dom.modalCreate.classList.remove('hidden');
};

window.searchUsersForClub = (q) => {
    const box = document.getElementById('user-search-results');
    if (!q) { box.classList.add('hidden'); return; }
    const matches = state.users.filter(u => u.displayName.toLowerCase().includes(q.toLowerCase())).slice(0, 5);
    
    box.innerHTML = '';
    matches.forEach(u => {
        const d = document.createElement('div');
        d.innerHTML = `<img src="${u.photoURL}"> ${u.displayName}`;
        d.onclick = () => { tempMembers.add(u.id); renderTempMembers(); document.getElementById('search-users-input').value=''; box.classList.add('hidden'); };
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
            chip.innerHTML = `${u.displayName} <i class="fa-solid fa-xmark" onclick="window.removeTemp('${uid}')"></i>`;
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
            createdBy: 'ADMIN',
            // --- FIX APPLIED HERE ---
            // Added lastMessageAt to ensure the club appears in sorted queries immediately
            lastMessageAt: FieldValue.serverTimestamp() 
        });
        window.closeModals();
    } catch(e) { alert(e.message); }
};

// Manager
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
    if(!m.length) list.innerHTML = '<div style="padding:20px; text-align:center; opacity:0.5">No Members</div>';
    m.forEach(uid => {
        const u = state.users.find(user => user.id === uid);
        if(u) {
            const d = document.createElement('div');
            d.style.cssText = "display:flex; justify-content:space-between; padding:10px; background:rgba(255,255,255,0.05); border-radius:8px; margin-bottom:5px; align-items:center;";
            d.innerHTML = `<div style="display:flex;align-items:center;gap:10px"><img src="${u.photoURL}" style="width:30px;height:30px;border-radius:50%"><span>${u.displayName}</span></div> <button class="btn-mini btn-ban" onclick="window.kickMember('${uid}')"><i class="fa-solid fa-minus"></i></button>`;
            list.appendChild(d);
        }
    });
}

window.searchUsersForManager = (q) => {
    const box = document.getElementById('manage-search-results');
    if (!q) { box.classList.add('hidden'); return; }
    const club = state.clubs.find(c => c.id === state.activeClubId);
    const matches = state.users.filter(u => u.displayName.toLowerCase().includes(q.toLowerCase()) && !club.members.includes(u.id)).slice(0, 5);
    
    box.innerHTML = '';
    matches.forEach(u => {
        const d = document.createElement('div');
        d.innerHTML = `<img src="${u.photoURL}"> ${u.displayName}`;
        d.onclick = () => { window.addMemberToClub(u.id); document.getElementById('manage-search-input').value=''; box.classList.add('hidden'); };
        box.appendChild(d);
    });
    box.classList.remove('hidden');
};

window.addMemberToClub = async (uid) => { 
    await db.collection('clubs').doc(state.activeClubId).update({ members: FieldValue.arrayUnion(uid) });
    // Re-open manager to refresh list (lazy load)
    setTimeout(() => window.openManager(state.activeClubId), 200);
};
window.kickMember = async (uid) => { 
    if(confirm("Remove user?")) {
        await db.collection('clubs').doc(state.activeClubId).update({ members: FieldValue.arrayRemove(uid) });
        setTimeout(() => window.openManager(state.activeClubId), 200);
    }
};
window.deleteCurrentClub = async () => { 
    if(confirm("Delete Club Permanently?")) {
        await db.collection('clubs').doc(state.activeClubId).delete();
        window.closeModals();
    }
};

// --- 7. UTILS ---
window.closeModals = () => {
    dom.modalCreate.classList.add('hidden');
    dom.modalManage.classList.add('hidden');
    state.activeClubId = null;
};

window.switchView = (v) => {
    [dom.usersView, dom.clubsView, dom.analyticsView].forEach(el => el.classList.add('hidden'));
    if(v === 'users') dom.usersView.classList.remove('hidden');
    if(v === 'clubs') dom.clubsView.classList.remove('hidden');
    if(v === 'analytics') dom.analyticsView.classList.remove('hidden');
    
    document.querySelectorAll('.nav-tab').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('onclick').includes(v));
    });
};

function updateStats() {
    dom.statTotal.textContent = state.users.length;
    dom.statOnline.textContent = state.users.filter(u => calculateRealStatus(u.lastSeen)).length;
}

function updateChart() {
    const online = state.users.filter(u => calculateRealStatus(u.lastSeen)).length;
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