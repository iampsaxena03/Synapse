import { db, FieldValue } from './config.js';
import { state, ListenerMgr } from './state.js';
import { dom } from './dom.js';
import { escapeHtml, getSafeDate } from './utils.js';
import { loadMessages, listenForTyping, markMessagesAsRead, resetUnreadCount, updateClubReadStatus } from './messages.js';

export function calculateStatus(user) {
    if (!user || !user.isOnline || !user.lastSeen) return 'Offline';
    const lastSeen = getSafeDate(user.lastSeen);
    const diffSeconds = (new Date() - lastSeen) / 1000;
    return diffSeconds < 30 ? 'Online' : 'Offline';
}

export function checkAllUserStatuses() {
    document.querySelectorAll('.user-item').forEach(row => {
        if (row.classList.contains('is-typing')) return;
        const uid = row.getAttribute('data-uid');
        const user = state.usersCache.get(uid);
        if (user) {
            const status = calculateStatus(user);
            const statusSpan = row.querySelector('.status-text');
            if (statusSpan) {
                statusSpan.textContent = status;
                statusSpan.style.color = status === 'Online' ? '#00b894' : '#b2bec3';
            }
        }
    });

    if (state.currentChatUser) {
        const el = document.getElementById('partner-status');
        if (el && !el.classList.contains('typing-active')) {
            const liveUser = state.usersCache.get(state.currentChatUser.uid) || state.currentChatUser;
            const status = calculateStatus(liveUser);
            el.textContent = status;
            el.style.color = status === 'Online' ? '#00b894' : '#b2bec3';
        }
    }
}

export function loadMyChats() {
    if (state.listeners.mainChats) state.listeners.mainChats(); 
    
    const content = dom.listChatsContent;
    
    state.listeners.mainChats = db.collection('users').doc(state.currentUser.uid).collection('activeChats')
        .orderBy('timestamp', 'desc') 
        .onSnapshot(snap => {
            if (snap.empty) {
                content.innerHTML = '<div style="padding:20px;text-align:center;font-size:12px;opacity:0.5">No active chats</div>';
                ListenerMgr.clearAllRowListeners();
                return;
            }

            if (content.textContent.includes('No active chats')) content.innerHTML = '';

            snap.docChanges().forEach(change => {
                if (change.type === 'removed') {
                    const row = document.getElementById(`user-row-${change.doc.id}`);
                    if (row) row.remove();
                    ListenerMgr.removeProfile(change.doc.id);
                    ListenerMgr.removeRowTyping(change.doc.id);
                }
            });

            snap.docs.forEach(doc => {
                const partnerId = doc.id;
                const data = doc.data();
                
                let div = document.getElementById(`user-row-${partnerId}`);
                
                if (!div) {
                    div = document.createElement('div');
                    div.id = `user-row-${partnerId}`;
                    div.className = 'user-item';
                    div.innerHTML = `<div class="user-info"><h4>Loading...</h4></div>`;
                    setupRowListeners(div, partnerId);
                }

                div.setAttribute('data-unread', data.unreadCount || 0);
                updateBadgeOnly(div, data.unreadCount || 0, partnerId);
                content.appendChild(div);
            });
        });
}

function setupRowListeners(div, partnerId) {
    const profileUnsub = db.collection('users').doc(partnerId).onSnapshot(userDoc => {
        if (userDoc.exists) {
            const userData = userDoc.data();
            state.usersCache.set(partnerId, userData);
            const currentUnread = parseInt(div.getAttribute('data-unread') || 0);
            fillUserItem(div, userData, currentUnread);
        }
    });
    ListenerMgr.addProfile(partnerId, profileUnsub);

    const chatId = [state.currentUser.uid, partnerId].sort().join('_');
    const typingUnsub = db.collection('chats').doc(chatId).collection('typing').doc(partnerId)
        .onSnapshot(snap => {
            const isTyping = snap.exists && snap.data().timestamp && (new Date() - getSafeDate(snap.data().timestamp)) < 10000;
            const statusSpan = div.querySelector('.status-text');
            
            if (isTyping) {
                div.classList.add('is-typing');
                if (statusSpan) {
                    statusSpan.textContent = 'typing...';
                    statusSpan.style.color = '#6c5ce7';
                    statusSpan.classList.add('typing-active');
                }
            } else {
                div.classList.remove('is-typing');
                if (statusSpan) {
                    statusSpan.classList.remove('typing-active');
                    const user = state.usersCache.get(partnerId);
                    if (user) {
                        const status = calculateStatus(user);
                        statusSpan.textContent = status;
                        statusSpan.style.color = status === 'Online' ? '#00b894' : '#b2bec3';
                    }
                }
            }
        });
    ListenerMgr.addRowTyping(partnerId, typingUnsub);
}

function fillUserItem(div, user, unreadCount) {
    div.setAttribute('data-uid', user.uid);
    div.onclick = () => openChat(user);
    
    if (state.currentChatUser?.uid === user.uid) {
        div.classList.add('active');
        unreadCount = 0; 
    } else {
        div.classList.remove('active');
    }

    if (div.classList.contains('is-typing')) return;

    const status = calculateStatus(user);
    const color = status === 'Online' ? '#00b894' : '#b2bec3';

    let badgeHtml = '';
    if (unreadCount > 0) {
        badgeHtml = `<div class="unread-badge" style="display:flex">${unreadCount > 9 ? '9+' : unreadCount}</div>`;
    }

    div.innerHTML = `
        <img src="${user.photoURL}" alt="User" onerror="this.src='https://via.placeholder.com/50'">
        <div class="user-info">
            <h4>${escapeHtml(user.displayName)}</h4>
            <span class="status-text" style="font-size:11px; color:${color}">
                ${status}
            </span>
        </div>
        ${badgeHtml}
    `;
}

function updateBadgeOnly(div, count, partnerId) {
    if (state.currentChatUser?.uid === partnerId) count = 0;
    let badge = div.querySelector('.unread-badge');
    if (count > 0) {
        if (!badge) {
            badge = document.createElement('div');
            badge.className = 'unread-badge';
            div.appendChild(badge);
        }
        badge.style.display = 'flex';
        badge.textContent = count > 9 ? '9+' : count;
    } else {
        if (badge) badge.style.display = 'none';
    }
}

export function loadClubs() {
    if (state.listeners.clubs) state.listeners.clubs();
    const content = dom.clubsContent;
    if (content.children.length === 0) content.innerHTML = '<div style="padding:20px;text-align:center;opacity:0.5">Loading clubs...</div>';

    state.listeners.clubs = db.collection('clubs').orderBy('lastMessageAt', 'desc').onSnapshot(snap => {
        if (content.innerHTML.includes('Loading clubs')) content.innerHTML = '';
        if (snap.empty) {
            content.innerHTML = '<div style="padding:20px;text-align:center;opacity:0.5">No clubs found</div>';
            return;
        }

        snap.forEach(doc => {
            const club = doc.data();
            const id = doc.id;
            let el = document.getElementById(`club-${id}`);

            if (el) {
                content.appendChild(el); 
                updateClubContent(el, club);
            } else {
                el = createClubElement(club, id);
                content.appendChild(el);
            }
            attachClubReadListener(el, id, club.lastMessageAt);
        });
    });
}

function updateClubContent(div, club) {
    const nameEl = div.querySelector('h4');
    const descEl = div.querySelector('.user-info span');
    if (nameEl) nameEl.innerHTML = `${escapeHtml(club.name)} ${club.isAnonymous ? '<i class="fa-solid fa-mask" style="color:var(--gold);font-size:12px;margin-left:5px;"></i>' : ''}`;
    if (descEl) descEl.textContent = escapeHtml(club.description || 'Welcome');
}

function createClubElement(club, id) {
    const div = document.createElement('div');
    div.id = `club-${id}`;
    div.className = `club-item ${state.currentClubData?.id === id ? 'active' : ''}`;
    div.onclick = () => openClub(club, id);
    
    const icon = club.icon || 'fa-solid fa-users';
    div.innerHTML = `
        <i class="${icon} club-icon"></i>
        <div class="user-info">
            <h4>${escapeHtml(club.name)} ${club.isAnonymous ? '<i class="fa-solid fa-mask" style="color:var(--gold);font-size:12px;margin-left:5px;"></i>' : ''}</h4>
            <span style="font-size:11px; color:#b2bec3">${escapeHtml(club.description || 'Welcome')}</span>
        </div>
        <div class="unread-badge" style="display:none;">!</div>
    `;
    return div;
}

function attachClubReadListener(div, clubId, clubLastActivity) {
    const lastTs = clubLastActivity ? clubLastActivity.toMillis() : 0;
    if (div._listeningForTs === lastTs) return; 

    if (div._unreadUnsub) div._unreadUnsub(); 

    div._listeningForTs = lastTs;
    div._unreadUnsub = db.collection('users').doc(state.currentUser.uid)
        .collection('clubStates').doc(clubId)
        .onSnapshot(doc => {
            if (!document.getElementById(`club-${clubId}`)) return;
            const myLastRead = doc.exists ? doc.data().lastRead : null;
            let showDot = true;
            if (myLastRead && lastTs <= myLastRead.toMillis()) showDot = false;
            if (state.currentClubData?.id === clubId) showDot = false;
            
            const badge = div.querySelector('.unread-badge');
            if(badge) badge.style.display = showDot ? 'flex' : 'none';
        });
}

// --- OPENING FUNCTIONS ---
export async function openChat(partner) {
    state.currentClubData = null;
    state.currentChatUser = partner;
    state.currentChatParams.hiddenBefore = null;
    window.cancelInputMode(); 
    
    prepareChatUI();
    dom.listChats.classList.remove('hidden');
    dom.listClubs.classList.add('hidden');
    
    localStorage.setItem('lastChatId', partner.uid);
    history.pushState({view: 'chat'}, '', `#chat`);

    document.getElementById('partner-name').textContent = partner.displayName;
    document.getElementById('partner-avatar').src = partner.photoURL;
    const status = calculateStatus(state.usersCache.get(partner.uid) || partner);
    const statusEl = document.getElementById('partner-status');
    statusEl.textContent = status;
    statusEl.style.color = status === 'Online' ? '#00b894' : '#b2bec3';
    statusEl.classList.remove('typing-active');
    dom.msgInput.placeholder = "Type a message...";

    document.querySelectorAll('.user-item').forEach(el => el.classList.remove('active'));
    const row = document.getElementById(`user-row-${partner.uid}`);
    if (row) {
        row.classList.add('active');
        updateBadgeOnly(row, 0, partner.uid);
    }

    resetUnreadCount(partner.uid);
    markMessagesAsRead(partner.uid);
    loadMessages(partner.uid, false);
    listenForTyping(partner.uid, false);
}

export async function openClub(club, id) {
    state.currentChatUser = null;
    state.currentClubData = { ...club, id };
    state.currentChatParams.hiddenBefore = null;
    window.cancelInputMode();
    
    prepareChatUI();
    dom.listClubs.classList.remove('hidden');
    dom.listChats.classList.add('hidden');

    history.pushState({view: 'club'}, '', `#club`);

    document.getElementById('partner-name').textContent = club.name;
    document.getElementById('partner-avatar').src = "https://cdn-icons-png.flaticon.com/512/1256/1256650.png";
    const statusEl = document.getElementById('partner-status');
    statusEl.textContent = club.isAnonymous ? 'Anonymous Den' : 'Public Room';
    statusEl.style.color = club.isAnonymous ? '#fdcb6e' : '#b2bec3';
    statusEl.classList.remove('typing-active');
    dom.msgInput.placeholder = club.isAnonymous ? "Message anonymously..." : "Type a message...";

    document.querySelectorAll('.club-item').forEach(el => el.classList.remove('active'));
    const row = document.getElementById(`club-${id}`);
    if (row) {
        row.classList.add('active');
        const badge = row.querySelector('.unread-badge');
        if(badge) badge.style.display = 'none';
    }

    updateClubReadStatus(id);
    loadMessages(id, true);
    listenForTyping(id, true);
}

function prepareChatUI() {
    dom.emptyState.classList.add('hidden');
    dom.chatArea.classList.remove('hidden');
    if (window.innerWidth <= 768) dom.sidebar.classList.add('hidden-mobile');
    dom.userSearch.value = '';
    dom.searchResults.classList.add('hidden');
}

export function closeChatUI() {
    dom.sidebar.classList.remove('hidden-mobile');
    dom.chatArea.classList.add('hidden');
    dom.emptyState.classList.remove('hidden');
    
    if (state.listeners.messages) state.listeners.messages();
    if (state.listeners.typing) state.listeners.typing();
    
    state.currentChatUser = null;
    state.currentClubData = null;
    localStorage.removeItem('lastChatId');
    window.cancelInputMode();
    
    document.querySelectorAll('.user-item, .club-item').forEach(el => el.classList.remove('active'));
}

// Search Logic
dom.userSearch.addEventListener('input', e => {
    clearTimeout(state.intervals.search);
    const q = e.target.value.trim().toLowerCase();
    const res = dom.searchResults;
    const list = dom.listChats;

    if (!q) { res.classList.add('hidden'); list.classList.remove('hidden'); return; }

    state.intervals.search = setTimeout(async () => {
        res.classList.remove('hidden');
        list.classList.add('hidden');
        const content = document.getElementById('search-list-content');
        content.innerHTML = '<div style="padding:10px;text-align:center">Searching...</div>';
        try {
            const snap = await db.collection('users').where('customId', '>=', q).where('customId', '<=', q+'\uf8ff').limit(5).get();
            content.innerHTML = '';
            snap.forEach(doc => {
                if (doc.id !== state.currentUser.uid) {
                    state.usersCache.set(doc.id, doc.data());
                    renderSearchItem(doc.data(), content);
                }
            });
            if (snap.empty) content.innerHTML = '<div style="padding:10px;text-align:center">No users found</div>';
        } catch(e){ console.error(e); }
    }, 500);
});

function renderSearchItem(user, container) {
    const div = document.createElement('div');
    div.className = 'user-item';
    div.onclick = () => openChat(user);
    div.innerHTML = `
        <img src="${user.photoURL}" onerror="this.src='https://via.placeholder.com/50'">
        <div class="user-info"><h4>${escapeHtml(user.displayName)}</h4><span style="font-size:11px;color:#b2bec3">@${user.customId}</span></div>`;
    container.appendChild(div);
}