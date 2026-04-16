// ——— SYNAPSE v2.0 — CHAT LIST & CLUBS ———
import { db, FieldValue } from './config.js';
import { state, ListenerMgr } from './state.js';
import { dom } from './dom.js';
import { escapeHtml, getSafeDate, getRelativeTime, generateAvatar } from './utils.js';
import { loadMessages, listenForTyping, markMessagesAsRead, resetUnreadCount, updateClubReadStatus } from './messages.js';

// --- Status Calculation ---
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
                statusSpan.style.color = status === 'Online' ? 'var(--success)' : 'var(--text-muted)';
            }
        }
    });

    if (state.currentChatUser) {
        const el = document.getElementById('partner-status');
        if (el && !el.classList.contains('typing-active')) {
            const liveUser = state.usersCache.get(state.currentChatUser.uid) || state.currentChatUser;
            const status = calculateStatus(liveUser);
            el.textContent = status;
            el.style.color = status === 'Online' ? 'var(--success)' : 'var(--text-muted)';
        }
    }
}

// --- Load My Chats ---
export function loadMyChats() {
    if (state.listeners.mainChats) state.listeners.mainChats();

    const content = dom.listChatsContent;

    state.listeners.mainChats = db.collection('users').doc(state.currentUser.uid).collection('activeChats')
        .orderBy('timestamp', 'desc')
        .onSnapshot(snap => {
            if (snap.empty) {
                content.innerHTML = '<div style="padding:24px;text-align:center;font-size:13px;color:var(--text-muted)">No conversations yet</div>';
                ListenerMgr.clearAllRowListeners();
                return;
            }

            if (content.textContent.includes('No conversations')) content.innerHTML = '';

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
                div.setAttribute('data-ts', data.timestamp ? getSafeDate(data.timestamp).getTime() : 0);
                div.setAttribute('data-last-msg', data.lastMessage || '');
                updateBadgeOnly(div, data.unreadCount || 0, partnerId);

                // Insert in sorted position
                const existingItems = Array.from(content.querySelectorAll('.user-item'));
                const myTs = parseInt(div.getAttribute('data-ts') || 0);
                let inserted = false;
                for (const item of existingItems) {
                    if (item === div) continue;
                    const itemTs = parseInt(item.getAttribute('data-ts') || 0);
                    if (myTs > itemTs) {
                        content.insertBefore(div, item);
                        inserted = true;
                        break;
                    }
                }
                if (!inserted) content.appendChild(div);
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
                    statusSpan.style.color = 'var(--accent)';
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
                        statusSpan.style.color = status === 'Online' ? 'var(--success)' : 'var(--text-muted)';
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
    const statusColor = status === 'Online' ? 'var(--success)' : 'var(--text-muted)';
    const lastMsg = div.getAttribute('data-last-msg') || '';
    const ts = div.getAttribute('data-ts');
    const timeStr = ts && parseInt(ts) > 0 ? getRelativeTime(new Date(parseInt(ts))) : '';
    const avatarSrc = user.photoURL || generateAvatar(user.displayName || 'User');

    let badgeHtml = '';
    if (unreadCount > 0) {
        badgeHtml = `<div class="unread-badge">${unreadCount > 9 ? '9+' : unreadCount}</div>`;
    }

    div.innerHTML = `
        <img src="${avatarSrc}" alt="" onerror="this.src='${generateAvatar(user.displayName || 'User')}'">
        <div class="user-info">
            <h4>${escapeHtml(user.displayName)}</h4>
            <span class="last-msg-preview">${lastMsg ? escapeHtml(lastMsg) : `<span class="status-text" style="color:${statusColor}">${status}</span>`}</span>
        </div>
        <div class="chat-meta-right">
            ${timeStr ? `<span class="chat-time">${timeStr}</span>` : ''}
            ${badgeHtml}
        </div>
    `;
}

function updateBadgeOnly(div, count, partnerId) {
    if (state.currentChatUser?.uid === partnerId) count = 0;
    let badge = div.querySelector('.unread-badge');
    if (count > 0) {
        if (!badge) {
            const meta = div.querySelector('.chat-meta-right');
            if (meta) {
                badge = document.createElement('div');
                badge.className = 'unread-badge';
                meta.appendChild(badge);
            }
        }
        if (badge) {
            badge.style.display = 'flex';
            badge.textContent = count > 9 ? '9+' : count;
        }
    } else {
        if (badge) badge.style.display = 'none';
    }
}

// --- Load Clubs (Two-Stream) ---
export function loadClubs() {
    if (state.listeners.clubs) {
        if (Array.isArray(state.listeners.clubs)) state.listeners.clubs.forEach(u => u());
        else if (typeof state.listeners.clubs === 'function') state.listeners.clubs();
    }

    const content = dom.clubsContent;
    if (content.children.length === 0) content.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px">Loading clubs...</div>';

    const publicClubs = new Map();
    const myClubs = new Map();

    const render = () => {
        const merged = new Map([...publicClubs, ...myClubs]);
        const sortedDocs = Array.from(merged.values()).sort((a, b) => {
            const timeA = a.lastMessageAt ? a.lastMessageAt.toMillis() : (a.createdAt ? a.createdAt.toMillis() : 0);
            const timeB = b.lastMessageAt ? b.lastMessageAt.toMillis() : (b.createdAt ? b.createdAt.toMillis() : 0);
            return timeB - timeA;
        });

        if (content.innerHTML.includes('Loading')) content.innerHTML = '';
        if (sortedDocs.length === 0) {
            content.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px">No clubs available</div>';
            return;
        }

        const visibleIds = new Set();
        sortedDocs.forEach(club => {
            visibleIds.add(club.id);
            let el = document.getElementById(`club-${club.id}`);
            if (el) {
                content.appendChild(el);
                updateClubContent(el, club);
            } else {
                el = createClubElement(club, club.id);
                content.appendChild(el);
            }
            attachClubReadListener(el, club.id, club.lastMessageAt);
        });

        Array.from(content.children).forEach(el => {
            const id = el.id?.replace('club-', '');
            if (id && !visibleIds.has(id)) el.remove();
        });
    };

    const unsubPublic = db.collection('clubs')
        .where('isPrivate', '==', false)
        .onSnapshot(snap => {
            snap.docChanges().forEach(change => {
                if (change.type === 'removed') publicClubs.delete(change.doc.id);
                else publicClubs.set(change.doc.id, { id: change.doc.id, ...change.doc.data() });
            });
            render();
        });

    const unsubPrivate = db.collection('clubs')
        .where('members', 'array-contains', state.currentUser.uid)
        .onSnapshot(snap => {
            snap.docChanges().forEach(change => {
                if (change.type === 'removed') myClubs.delete(change.doc.id);
                else myClubs.set(change.doc.id, { id: change.doc.id, ...change.doc.data() });
            });
            render();
        });

    state.listeners.clubs = [unsubPublic, unsubPrivate];
}

function updateClubContent(div, club) {
    const nameEl = div.querySelector('h4');
    const descEl = div.querySelector('.user-info span');
    if (nameEl) nameEl.innerHTML = `${escapeHtml(club.name)} ${club.isAnonymous ? '<i class="fa-solid fa-mask" style="color:var(--gold);font-size:11px;margin-left:4px;"></i>' : ''}`;
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
            <h4>${escapeHtml(club.name)} ${club.isAnonymous ? '<i class="fa-solid fa-mask" style="color:var(--gold);font-size:11px;margin-left:4px;"></i>' : ''}</h4>
            <span style="font-size:12px;color:var(--text-muted)">${escapeHtml(club.description || 'Welcome')}</span>
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
            if (badge) badge.style.display = showDot ? 'flex' : 'none';
        });
}

// --- Open Chat ---
export async function openChat(partner) {
    state.currentClubData = null;
    state.currentChatUser = partner;
    state.currentChatParams.hiddenBefore = null;
    window.cancelInputMode();

    prepareChatUI();
    dom.listChats.classList.remove('hidden');
    dom.listClubs.classList.add('hidden');

    localStorage.setItem('lastChatId', partner.uid);
    history.pushState({ view: 'chat' }, '', `#chat`);

    // Info button -> View profile
    const infoBtn = document.querySelector('.info-btn');
    infoBtn.onclick = () => viewUserProfile(partner.uid);

    const avatarSrc = partner.photoURL || generateAvatar(partner.displayName || 'User');
    document.getElementById('partner-name').textContent = partner.displayName;
    document.getElementById('partner-avatar').src = avatarSrc;

    const status = calculateStatus(state.usersCache.get(partner.uid) || partner);
    const statusEl = document.getElementById('partner-status');
    statusEl.textContent = status;
    statusEl.style.color = status === 'Online' ? 'var(--success)' : 'var(--text-muted)';
    statusEl.classList.remove('typing-active');
    dom.msgInput.placeholder = 'Type a message...';

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

// --- View User Profile ---
async function viewUserProfile(uid) {
    const modal = document.getElementById('view-profile-modal');
    try {
        let userData = state.usersCache.get(uid);
        if (!userData) {
            const doc = await db.collection('users').doc(uid).get();
            if (doc.exists) {
                userData = doc.data();
                state.usersCache.set(uid, userData);
            }
        }
        if (!userData) return;

        document.getElementById('view-avatar').src = userData.photoURL || generateAvatar(userData.displayName);
        document.getElementById('view-name').textContent = userData.displayName || 'User';
        document.getElementById('view-id').textContent = '@' + (userData.customId || 'unknown');
        document.getElementById('view-bio').textContent = userData.bio || 'No bio available.';
        document.getElementById('view-location').textContent = userData.location || 'Unknown Location';

        const status = calculateStatus(userData);
        const pill = document.getElementById('view-status-pill');
        pill.textContent = status;
        pill.style.background = status === 'Online' ? 'rgba(16,185,129,0.1)' : 'rgba(100,116,139,0.1)';
        pill.style.color = status === 'Online' ? 'var(--success)' : 'var(--text-muted)';
        pill.style.borderColor = status === 'Online' ? 'rgba(16,185,129,0.2)' : 'rgba(100,116,139,0.2)';

        document.getElementById('close-view-profile').onclick = () => modal.classList.add('hidden');
        modal.classList.remove('hidden');
    } catch (e) { console.error(e); }
}

// --- Open Club ---
export async function openClub(club, id) {
    state.currentChatUser = null;
    state.currentClubData = { ...club, id };
    state.currentChatParams.hiddenBefore = null;
    window.cancelInputMode();

    prepareChatUI();
    dom.listClubs.classList.remove('hidden');
    dom.listChats.classList.add('hidden');

    history.pushState({ view: 'club' }, '', `#club`);

    const infoBtn = document.querySelector('.info-btn');
    infoBtn.onclick = () => viewClubProfile(club);

    document.getElementById('partner-name').textContent = club.name;
    document.getElementById('partner-avatar').src = 'https://cdn-icons-png.flaticon.com/512/1256/1256650.png';

    const statusEl = document.getElementById('partner-status');
    statusEl.textContent = club.isAnonymous ? 'Anonymous Den' : 'Public Room';
    statusEl.style.color = club.isAnonymous ? 'var(--gold)' : 'var(--text-muted)';
    statusEl.classList.remove('typing-active');
    dom.msgInput.placeholder = club.isAnonymous ? 'Message anonymously...' : 'Type a message...';

    document.querySelectorAll('.club-item').forEach(el => el.classList.remove('active'));
    const row = document.getElementById(`club-${id}`);
    if (row) {
        row.classList.add('active');
        const badge = row.querySelector('.unread-badge');
        if (badge) badge.style.display = 'none';
    }

    updateClubReadStatus(id);
    loadMessages(id, true);
    listenForTyping(id, true);
}

// --- Club Profile View ---
async function viewClubProfile(club) {
    const modal = document.getElementById('modal-club-profile');

    document.getElementById('cp-name').textContent = club.name;
    document.getElementById('cp-desc').textContent = club.description || 'No description available.';
    document.getElementById('cp-icon').className = club.icon || 'fa-solid fa-users';
    document.getElementById('cp-count').textContent = (club.members?.length || 0) + ' MEMBERS';

    const badgeContainer = document.getElementById('cp-badges');
    badgeContainer.innerHTML = '';
    if (club.isOfficial) badgeContainer.innerHTML += `<span class="club-badge official"><i class="fa-solid fa-certificate"></i> Official</span>`;
    if (club.isPrivate) badgeContainer.innerHTML += `<span class="club-badge private"><i class="fa-solid fa-lock"></i> Private</span>`;
    if (club.isAnonymous) badgeContainer.innerHTML += `<span class="club-badge anon"><i class="fa-solid fa-mask"></i> Anonymous</span>`;

    const list = document.getElementById('cp-members-list');
    list.innerHTML = '<div class="loader-spinner"></div>';
    modal.classList.remove('hidden');

    if (club.isAnonymous) {
        let html = '';
        (club.members || []).forEach((m, index) => {
            const isMe = m === state.currentUser.uid;
            html += `
                <div class="member-row">
                    <div style="width:34px;height:34px;border-radius:50%;background:var(--bg-elevated);display:flex;align-items:center;justify-content:center;margin-right:12px;">
                        <i class="fa-solid fa-user-secret" style="color:var(--text-muted)"></i>
                    </div>
                    <div class="mem-info">
                        <span class="mem-name">Agent ${String(index + 1).padStart(3, '0')} ${isMe ? '(You)' : ''}</span>
                        <span class="mem-status">Redacted Identity</span>
                    </div>
                </div>`;
        });
        list.innerHTML = html;
        return;
    }

    try {
        const memberIds = club.members || [];
        if (memberIds.length === 0) {
            list.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:16px">No members</div>';
            return;
        }

        const promises = memberIds.map(uid => {
            if (state.usersCache.has(uid)) return Promise.resolve(state.usersCache.get(uid));
            return db.collection('users').doc(uid).get().then(doc => {
                if (doc.exists) {
                    const d = doc.data();
                    d.uid = doc.id;
                    state.usersCache.set(uid, d);
                    return d;
                }
                return null;
            });
        });

        const users = await Promise.all(promises);
        let html = '';
        users.forEach(u => {
            if (!u) return;
            const status = calculateStatus(u);
            const isOwner = club.createdBy === u.uid;
            const avatar = u.photoURL || generateAvatar(u.displayName || 'User');
            html += `
                <div class="member-row" onclick="window.openChatFromProfile('${u.uid}')">
                    <img src="${avatar}" onerror="this.src='${generateAvatar(u.displayName || 'User')}'">
                    <div class="mem-info">
                        <span class="mem-name">${escapeHtml(u.displayName)} ${isOwner ? '<span class="owner-tag">OWNER</span>' : ''}</span>
                        <span class="mem-status" style="color:${status === 'Online' ? 'var(--success)' : 'var(--text-muted)'}">${status}</span>
                    </div>
                </div>`;
        });
        list.innerHTML = html;
    } catch (e) {
        console.error(e);
        list.innerHTML = '<div style="color:var(--danger);text-align:center">Error loading members</div>';
    }
}

window.openChatFromProfile = (uid) => {
    if (uid === state.currentUser.uid) return;
    document.getElementById('modal-club-profile').classList.add('hidden');
    const user = state.usersCache.get(uid);
    if (user) openChat(user);
};

// --- UI Helpers ---
function prepareChatUI() {
    dom.emptyState.classList.add('hidden');
    dom.chatArea.classList.remove('hidden');
    if (window.innerWidth <= 768) dom.sidebar.classList.add('hidden-mobile');
    dom.userSearch.value = '';
    dom.searchResults.classList.add('hidden');

    // Close emoji picker
    state.emojiPickerOpen = false;
    dom.emojiPicker.classList.add('hidden');
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

// --- Search ---
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
        content.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:13px">Searching...</div>';
        try {
            const snap = await db.collection('users').where('customId', '>=', q).where('customId', '<=', q + '\uf8ff').limit(5).get();
            content.innerHTML = '';
            snap.forEach(doc => {
                if (doc.id !== state.currentUser.uid) {
                    state.usersCache.set(doc.id, doc.data());
                    renderSearchItem(doc.data(), content);
                }
            });
            if (snap.empty) content.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:13px">No users found</div>';
        } catch (e) { console.error(e); }
    }, 500);
});

function renderSearchItem(user, container) {
    const div = document.createElement('div');
    div.className = 'user-item';
    div.onclick = () => openChat(user);
    const avatar = user.photoURL || generateAvatar(user.displayName || 'User');
    div.innerHTML = `
        <img src="${avatar}" onerror="this.src='${generateAvatar(user.displayName || 'User')}'">
        <div class="user-info"><h4>${escapeHtml(user.displayName)}</h4><span style="font-size:12px;color:var(--text-muted)">@${user.customId}</span></div>`;
    container.appendChild(div);
}