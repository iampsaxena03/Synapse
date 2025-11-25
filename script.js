// --- CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyDGEL8DUQxHXxSoM5RLv4MKi6KfmEqU1R0",
    authDomain: "private-chat-app-320d3.firebaseapp.com",
    projectId: "private-chat-app-320d3",
    storageBucket: "private-chat-app-320d3.firebasestorage.app",
    messagingSenderId: "462500419302",
    appId: "1:462500419302:web:639976e4d0eceac4a88d27"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();
const FieldValue = firebase.firestore.FieldValue;

db.enablePersistence({ synchronizeTabs: true }).catch(err => console.log("Persistence:", err.code));

// --- STATE MANAGEMENT ---
const state = {
    currentUser: null,
    currentChatUser: null,
    currentClubData: null,
    currentChatParams: { hiddenBefore: null },
    activeTab: 'chats',
    isLoginMode: true,
    usersCache: new Map(),
    pendingDelete: { id: null, isClub: false, isSender: false },
    listeners: {
        messages: null,
        mainChats: null,
        clubs: null,
        typing: null,
        profiles: new Map(),
        rowTyping: new Map()
    },
    intervals: {
        heartbeat: null,
        statusWatcher: null,
        search: null,
        typing: null
    },
    scroll: {
        oldestSnapshot: null,
        isFetching: false,
        allLoaded: false
    }
};

// --- DOM CACHE ---
const dom = {
    loading: document.getElementById('loading-screen'),
    auth: document.getElementById('auth-screen'),
    app: document.getElementById('app-screen'),
    sidebar: document.querySelector('.sidebar'),
    chatArea: document.getElementById('chat-view'),
    emptyState: document.getElementById('empty-state'),
    tabChats: document.getElementById('tab-chats'),
    tabClubs: document.getElementById('tab-clubs'),
    listChats: document.getElementById('my-chats-list'),
    listChatsContent: document.getElementById('my-chats-content'),
    listClubs: document.getElementById('clubs-list'),
    clubsContent: document.getElementById('clubs-content'),
    authBtn: document.getElementById('auth-btn'),
    toggleBtn: document.getElementById('toggle-mode'),
    error: document.getElementById('auth-error'),
    feed: document.getElementById('messages-feed')
};

// --- UTILS ---
const escapeHtml = (text) => {
    if (!text) return '';
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
};

const getSafeDate = (timestamp) => {
    if (!timestamp) return new Date(); 
    if (timestamp.toDate) return timestamp.toDate();
    if (timestamp instanceof Date) return timestamp;
    if (typeof timestamp === 'number') return new Date(timestamp);
    if (typeof timestamp === 'string') return new Date(timestamp);
    return new Date();
};

// --- READ STATUS HELPERS ---
async function markMessagesAsRead(partnerId) {
    if (!state.currentUser) return;
    const chatId = [state.currentUser.uid, partnerId].sort().join('_');
    const batch = db.batch();
    try {
        const snap = await db.collection('chats').doc(chatId).collection('messages')
            .where('senderId', '==', partnerId)
            .where('read', '==', false)
            .limit(20)
            .get();

        if (snap.empty) return;
        snap.forEach(doc => batch.update(doc.ref, { read: true }));
        await batch.commit();
    } catch (e) { console.warn("Read receipt error:", e); }
}

async function resetUnreadCount(partnerId) {
    if (!state.currentUser) return;
    try {
        const row = document.getElementById(`user-row-${partnerId}`);
        if(row) updateBadgeOnly(row, 0, partnerId);

        await db.collection('users').doc(state.currentUser.uid)
            .collection('activeChats').doc(partnerId)
            .update({ unreadCount: 0 }); 
    } catch (e) { 
        if(e.code === 'not-found') {
             await db.collection('users').doc(state.currentUser.uid)
            .collection('activeChats').doc(partnerId)
            .set({ unreadCount: 0 }, { merge: true });
        }
    }
}

async function updateClubReadStatus(clubId) {
    if (!state.currentUser) return;
    try {
        await db.collection('users').doc(state.currentUser.uid)
            .collection('clubStates').doc(clubId).set({
                lastRead: FieldValue.serverTimestamp()
            }, { merge: true });
    } catch(e) { console.warn("Club read status error:", e); }
}

// --- LISTENER MANAGER ---
const ListenerMgr = {
    addProfile(uid, unsub) {
        if (state.listeners.profiles.has(uid)) state.listeners.profiles.get(uid)();
        state.listeners.profiles.set(uid, unsub);
    },
    removeProfile(uid) {
        if (state.listeners.profiles.has(uid)) {
            state.listeners.profiles.get(uid)();
            state.listeners.profiles.delete(uid);
        }
    },
    addRowTyping(uid, unsub) {
        if (state.listeners.rowTyping.has(uid)) state.listeners.rowTyping.get(uid)();
        state.listeners.rowTyping.set(uid, unsub);
    },
    removeRowTyping(uid) {
        if (state.listeners.rowTyping.has(uid)) {
            state.listeners.rowTyping.get(uid)();
            state.listeners.rowTyping.delete(uid);
        }
    },
    clearAllRowListeners() {
        state.listeners.profiles.forEach(u => u());
        state.listeners.profiles.clear();
        state.listeners.rowTyping.forEach(u => u());
        state.listeners.rowTyping.clear();
    },
    clearMain() {
        if (state.listeners.messages) state.listeners.messages();
        if (state.listeners.mainChats) state.listeners.mainChats();
        if (state.listeners.clubs) state.listeners.clubs();
        if (state.listeners.typing) state.listeners.typing();
        this.clearAllRowListeners();
    }
};

// --- AUTH HANDLER ---
auth.onAuthStateChanged(async user => {
    if (user) {
        const userRef = db.collection('users').doc(user.uid);
        try {
            const doc = await userRef.get();
            if (doc.exists) {
                loginSuccess(user, doc.data());
            } else {
                const unsub = userRef.onSnapshot(snap => {
                    if (snap.exists) {
                        unsub();
                        loginSuccess(user, snap.data());
                    }
                });
            }
        } catch (e) {
            console.error(e);
            showAuth();
        }
    } else {
        cleanupApp();
        showAuth();
    }
});

function loginSuccess(user, data) {
    state.currentUser = user;
    updateMyProfileUI(data);
    initApp();
    revealApp();
}

function updateMyProfileUI(data) {
    if (!data) return;
    document.getElementById('my-name').textContent = data.displayName || 'Me';
    document.getElementById('my-custom-id').textContent = '@' + (data.customId || 'user');
    document.getElementById('my-avatar').src = data.photoURL || 'https://via.placeholder.com/50';
}

function showAuth() {
    dom.app.classList.add('hidden');
    dom.auth.classList.remove('hidden');
    dom.loading.classList.add('hidden');
}

function revealApp() {
    dom.loading.classList.add('hidden');
    dom.auth.classList.add('hidden');
    dom.app.classList.remove('hidden');
}

function cleanupApp() {
    state.currentUser = null;
    state.currentChatUser = null;
    state.currentClubData = null;
    state.currentChatParams.hiddenBefore = null;
    
    clearInterval(state.intervals.heartbeat);
    clearInterval(state.intervals.statusWatcher);
    ListenerMgr.clearMain();
    
    state.usersCache.clear();
    localStorage.removeItem('lastChatId');
}

// --- APP INIT ---
function initApp() {
    window.history.replaceState({ view: 'list' }, '');
    window.onpopstate = (event) => {
        if (!event.state || event.state.view === 'list') closeChatUI();
    };

    updateOnlineStatus();
    state.intervals.heartbeat = setInterval(updateOnlineStatus, 15000); 
    state.intervals.statusWatcher = setInterval(checkAllUserStatuses, 10000);
    injectDeleteModal(); 

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            updateOnlineStatus();
            refreshReadStatus();
        }
    });

    switchTab('chats');
}

function injectDeleteModal() {
    if (document.getElementById('delete-options-modal')) return;
    const modalHtml = `
    <div id="delete-options-modal" class="modal-overlay hidden">
        <div class="modal-card glass-card slide-up">
            <button class="close-modal" id="close-delete-modal"><i class="fa-solid fa-xmark"></i></button>
            <div class="modal-header">
                <h2>Delete Message</h2>
                <p>Choose an action</p>
            </div>
            <div class="choice-modal-body">
                <button id="btn-del-me" class="btn-choice">
                    <i class="fa-regular fa-trash-can"></i> Delete for Me
                </button>
                <button id="btn-del-everyone" class="btn-choice btn-delete-all hidden">
                    <i class="fa-solid fa-dumpster-fire"></i> Delete for Everyone
                </button>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    document.getElementById('close-delete-modal').onclick = () => {
        document.getElementById('delete-options-modal').classList.add('hidden');
    };
    
    document.getElementById('btn-del-me').onclick = () => window.confirmDeleteForMe();
    document.getElementById('btn-del-everyone').onclick = () => window.confirmDeleteForEveryone();
}

async function updateOnlineStatus() {
    if (!state.currentUser) return;
    try {
        await db.collection('users').doc(state.currentUser.uid).update({
            isOnline: true,
            lastSeen: FieldValue.serverTimestamp()
        });
    } catch (e) {}
}

function calculateStatus(user) {
    if (!user || !user.isOnline || !user.lastSeen) return 'Offline';
    const lastSeen = getSafeDate(user.lastSeen);
    const diffSeconds = (new Date() - lastSeen) / 1000;
    return diffSeconds < 30 ? 'Online' : 'Offline';
}

function checkAllUserStatuses() {
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

function refreshReadStatus() {
    if (state.currentChatUser) {
        markMessagesAsRead(state.currentChatUser.uid);
        resetUnreadCount(state.currentChatUser.uid);
    }
    if (state.currentClubData) {
        updateClubReadStatus(state.currentClubData.id);
    }
}

// --- TAB NAVIGATION ---
dom.tabChats.addEventListener('click', () => switchTab('chats'));
dom.tabClubs.addEventListener('click', () => switchTab('clubs'));

function switchTab(tab) {
    state.activeTab = tab;
    if (tab === 'chats') {
        dom.tabChats.classList.add('active');
        dom.tabClubs.classList.remove('active');
        dom.listChats.classList.remove('hidden');
        dom.listClubs.classList.add('hidden');
        loadMyChats();
    } else {
        dom.tabClubs.classList.add('active');
        dom.tabChats.classList.remove('active');
        dom.listClubs.classList.remove('hidden');
        dom.listChats.classList.add('hidden');
        loadClubs();
    }
}

// --- CHAT LIST LOGIC ---
function loadMyChats() {
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

// --- CLUBS LOADING ---
function loadClubs() {
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

// --- OPEN CHAT / CLUB ---
async function openChat(partner) {
    state.currentClubData = null;
    state.currentChatUser = partner;
    state.currentChatParams.hiddenBefore = null; 
    
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
    document.getElementById('msg-input').placeholder = "Type a message...";

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

async function openClub(club, id) {
    state.currentChatUser = null;
    state.currentClubData = { ...club, id };
    state.currentChatParams.hiddenBefore = null;
    
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
    document.getElementById('msg-input').placeholder = club.isAnonymous ? "Message anonymously..." : "Type a message...";

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
    document.getElementById('user-search').value = '';
    document.getElementById('search-results').classList.add('hidden');
}

function closeChatUI() {
    dom.sidebar.classList.remove('hidden-mobile');
    dom.chatArea.classList.add('hidden');
    dom.emptyState.classList.remove('hidden');
    
    if (state.listeners.messages) state.listeners.messages();
    if (state.listeners.typing) state.listeners.typing();
    
    state.currentChatUser = null;
    state.currentClubData = null;
    localStorage.removeItem('lastChatId');
    
    document.querySelectorAll('.user-item, .club-item').forEach(el => el.classList.remove('active'));
}

// --- CORE: LOAD MESSAGES & DATE LOGIC (OPTIMIZED RECEIVER SPEED) ---
async function loadMessages(id, isClub) {
    if (state.listeners.messages) state.listeners.messages();
    dom.feed.innerHTML = '';
    state.scroll.oldestSnapshot = null;
    state.scroll.allLoaded = false;
    state.currentChatParams.hiddenBefore = null;
    
    const targetId = id;

    if (!isClub) {
        try {
            const metaDoc = await db.collection('users').doc(state.currentUser.uid)
                                   .collection('activeChats').doc(id).get();
            
            if (state.currentChatUser?.uid !== targetId && state.currentClubData?.id !== targetId) return;

            if (metaDoc.exists && metaDoc.data().hiddenBefore) {
                state.currentChatParams.hiddenBefore = getSafeDate(metaDoc.data().hiddenBefore);
            }
        } catch (e) { console.error("Error fetching chat meta", e); }
    }

    let ref = isClub ? 
        db.collection('clubs').doc(id).collection('messages') : 
        db.collection('chats').doc([state.currentUser.uid, id].sort().join('_')).collection('messages');

    state.listeners.messages = ref.orderBy('timestamp', 'asc').limitToLast(40).onSnapshot(snap => {
        if (!snap.empty) {
            if (!state.scroll.oldestSnapshot) state.scroll.oldestSnapshot = snap.docs[0];
            
            // CRITICAL OPTIMIZATION: Reduced latency for Read Status
            // Changed from 500ms to 50ms. 
            // 50ms is enough to let the DOM paint, but fast enough to feel instant.
            if (document.visibilityState === 'visible') {
                setTimeout(() => {
                    if (!isClub) {
                        // Check local cache first to avoid unnecessary DB calls if already read
                        const hasUnread = snap.docs.some(doc => doc.data().senderId === id && !doc.data().read);
                        if (hasUnread) { 
                            markMessagesAsRead(id); 
                            resetUnreadCount(id); 
                        }
                    } else {
                        updateClubReadStatus(id);
                    }
                }, 50); 
            }
        }

        let lastRenderedDate = null;
        // BUG FIX: Using getElementsByClassName because :last-of-type selector fails when the last element is a message bubble (which is a DIV)
        const separators = dom.feed.getElementsByClassName('date-separator');
        if (separators.length > 0) {
            const lastBadge = separators[separators.length - 1].querySelector('.date-badge');
            if (lastBadge) lastRenderedDate = lastBadge.textContent;
        }

        snap.docChanges().forEach(change => {
            const doc = change.doc;
            const data = doc.data();

            if (data.deletedFor && data.deletedFor.includes(state.currentUser.uid)) return;

            const safeDate = getSafeDate(data.timestamp);

            if (change.type === 'added') {
                if (state.currentChatParams.hiddenBefore && safeDate < state.currentChatParams.hiddenBefore) return;

                if (!document.getElementById(`msg-${doc.id}`)) {
                    const msgDate = getFriendlyDate(safeDate);
                    if (msgDate !== lastRenderedDate) {
                        const dateDiv = createDateSeparator(msgDate);
                        dom.feed.appendChild(dateDiv);
                        lastRenderedDate = msgDate;
                    }

                    const div = createMessageBubble(data, doc.id, isClub);
                    dom.feed.appendChild(div);
                    dom.feed.scrollTop = dom.feed.scrollHeight; 
                }
            } 
            else if (change.type === 'modified') {
                const existing = document.getElementById(`msg-${change.doc.id}`);
                if (existing) {
                    if (data.deletedFor && data.deletedFor.includes(state.currentUser.uid)) {
                        existing.remove();
                        return;
                    }

                    if (data.isDeleted && !existing.classList.contains('deleted')) {
                        const newBubble = createMessageBubble(data, change.doc.id, isClub);
                        existing.replaceWith(newBubble);
                    } else if (!isClub && data.read) {
                        const tick = existing.querySelector('.tick-icon');
                        if (tick) { tick.classList.remove('tick-grey'); tick.classList.add('tick-blue'); }
                    } else if (data.content !== existing.querySelector('.msg-bubble span').textContent) {
                         const newBubble = createMessageBubble(data, change.doc.id, isClub);
                         existing.replaceWith(newBubble);
                    }
                }
            }
        });
    });
}

// --- CORE: INFINITE SCROLL (UPDATED) ---
dom.feed.addEventListener('scroll', () => {
    if (dom.feed.scrollTop === 0 && !state.scroll.isFetching && !state.scroll.allLoaded && (state.currentChatUser || state.currentClubData)) {
        loadMoreMessages();
    }
});

async function loadMoreMessages() {
    if (!state.scroll.oldestSnapshot) return;
    state.scroll.isFetching = true;

    let oldFirstMsgDate = null;
    let runner = dom.feed.firstElementChild;
    while(runner && !runner.classList.contains('msg-row')) {
        runner = runner.nextElementSibling;
    }
    if (runner && runner.dataset.date) {
        oldFirstMsgDate = runner.dataset.date;
    }
    
    let ref = state.currentClubData ? 
        db.collection('clubs').doc(state.currentClubData.id).collection('messages') : 
        db.collection('chats').doc([state.currentUser.uid, state.currentChatUser.uid].sort().join('_')).collection('messages');

    try {
        const snap = await ref.orderBy('timestamp', 'desc').startAfter(state.scroll.oldestSnapshot).limit(20).get();
        if (snap.empty) { state.scroll.allLoaded = true; state.scroll.isFetching = false; return; }

        state.scroll.oldestSnapshot = snap.docs[snap.docs.length - 1];
        
        const fragment = document.createDocumentFragment();
        const docs = snap.docs.reverse(); 
        let batchLastDate = null;

        docs.forEach(doc => {
            const data = doc.data();
            if (data.deletedFor && data.deletedFor.includes(state.currentUser.uid)) return;

            const safeDate = getSafeDate(data.timestamp);
            const msgDate = getFriendlyDate(safeDate);
            
            if (msgDate !== batchLastDate) {
                fragment.appendChild(createDateSeparator(msgDate));
                batchLastDate = msgDate;
            }
            
            const msgDiv = createMessageBubble(data, doc.id, !!state.currentClubData);
            fragment.appendChild(msgDiv);
        });

        if (batchLastDate && batchLastDate === oldFirstMsgDate) {
            const previousSep = runner ? runner.previousElementSibling : null;
            if (previousSep && previousSep.classList.contains('date-separator')) {
                previousSep.remove();
            }
        }

        const prevHeight = dom.feed.scrollHeight;
        dom.feed.insertBefore(fragment, dom.feed.firstElementChild);
        dom.feed.scrollTop = dom.feed.scrollHeight - prevHeight;

    } catch(e) { console.error(e); } 
    finally { state.scroll.isFetching = false; }
}

function getFriendlyDate(date) {
    if (!date) return '';
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function createDateSeparator(dateStr) {
    const div = document.createElement('div');
    div.className = 'date-separator';
    div.innerHTML = `<span class="date-badge">${dateStr}</span>`;
    return div;
}

function createMessageBubble(msg, id, isClub) {
    const isSent = msg.senderId === state.currentUser.uid;
    const div = document.createElement('div');
    div.id = `msg-${id}`;
    
    const safeDate = getSafeDate(msg.timestamp);
    div.dataset.date = getFriendlyDate(safeDate);
    
    if (msg.isDeleted) {
        div.className = `msg-row ${isSent ? 'sent' : 'received'} deleted`;
        div.innerHTML = `
            <div class="msg-bubble">
                <span><i class="fa-solid fa-ban"></i> <i>This message was deleted</i></span>
            </div>`;
        return div;
    }

    div.className = `msg-row ${isSent ? 'sent' : 'received'}`;
    const time = safeDate.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
    let meta = `<span class="msg-time">${time}</span>`;
    if (!isClub && isSent) {
        meta += `<span class="tick-container"><i class="fa-solid fa-check-double tick-icon ${msg.read ? 'tick-blue' : 'tick-grey'}"></i></span>`;
    }

    let sender = '';
    if (isClub && !isSent) {
        sender = state.currentClubData?.isAnonymous ? 
            `<div class="sender-name" style="color:#fab1a0"><i class="fa-solid fa-mask"></i> Anonymous Fox</div>` :
            `<div class="sender-name">${escapeHtml(msg.displayName || 'User')}</div>`;
    }

    const actionMenu = `
        <div class="msg-action-menu">
            <button class="action-btn" onclick="event.stopPropagation(); window.promptDelete('${id}', ${isClub}, ${isSent})" title="Delete Options">
                <i class="fa-solid fa-trash"></i>
            </button>
        </div>
    `;

    div.innerHTML = `
        ${actionMenu}
        <div class="msg-bubble" onclick="window.toggleActions(this)" oncontextmenu="window.handleContextMenu(event, this)">
            ${sender}
            <span>${escapeHtml(msg.content)}</span>
            <div class="msg-meta">${meta}</div>
        </div>
    `;
    return div;
}

// --- GLOBAL ACTIONS ---
window.toggleActions = (bubble) => {
    const row = bubble.parentElement;
    if (row.classList.contains('show-actions')) {
        row.classList.remove('show-actions');
    } else {
        document.querySelectorAll('.msg-row.show-actions').forEach(el => el.classList.remove('show-actions'));
        row.classList.add('show-actions');
    }
};

window.handleContextMenu = (event, bubble) => {
    event.preventDefault(); // Stop default right-click menu
    window.toggleActions(bubble);
};

window.promptDelete = (msgId, isClub, isSender) => {
    state.pendingDelete = { id: msgId, isClub: isClub, isSender: isSender };
    
    const modal = document.getElementById('delete-options-modal');
    const btnEveryone = document.getElementById('btn-del-everyone');
    
    if (isSender) {
        btnEveryone.classList.remove('hidden');
    } else {
        btnEveryone.classList.add('hidden');
    }
    
    modal.classList.remove('hidden');
};

// --- ROBUST DELETE FUNCTIONS ---
window.confirmDeleteForMe = async () => {
    const { id, isClub } = state.pendingDelete;
    document.getElementById('delete-options-modal').classList.add('hidden');

    if (!id || !state.currentUser) return;

    try {
        let ref;
        
        if (isClub) {
             if (!state.currentClubData || !state.currentClubData.id) throw new Error("Club context missing");
             ref = db.collection('clubs').doc(state.currentClubData.id).collection('messages').doc(id);
        } else {
             if (!state.currentChatUser || !state.currentChatUser.uid) throw new Error("Chat user context missing");
             const chatId = [state.currentUser.uid, state.currentChatUser.uid].sort().join('_');
             ref = db.collection('chats').doc(chatId).collection('messages').doc(id);
        }

        await ref.update({
            deletedFor: FieldValue.arrayUnion(state.currentUser.uid)
        });
        
        const row = document.getElementById(`msg-${id}`);
        if(row) row.remove();

    } catch(e) { 
        console.error("Delete Error:", e);
        if (e.code === 'not-found') {
             alert("Message not found or already deleted.");
        } else {
             alert("Delete Failed: " + e.message); 
        }
    }
};

window.confirmDeleteForEveryone = async () => {
    const { id, isClub } = state.pendingDelete;
    document.getElementById('delete-options-modal').classList.add('hidden');

    if (!id || !state.currentUser) return;

    try {
        let ref;
        if (isClub) {
             if (!state.currentClubData || !state.currentClubData.id) throw new Error("Club context missing");
             ref = db.collection('clubs').doc(state.currentClubData.id).collection('messages').doc(id);
        } else {
             if (!state.currentChatUser || !state.currentChatUser.uid) throw new Error("Chat user context missing");
             const chatId = [state.currentUser.uid, state.currentChatUser.uid].sort().join('_');
             ref = db.collection('chats').doc(chatId).collection('messages').doc(id);
        }

        await ref.update({
            isDeleted: true,
            content: '', 
            type: 'deleted'
        });
    } catch(e) { 
        console.error("Unsend Error:", e);
        alert("Unsend Failed: " + e.message + ". Only sender can unsend."); 
    }
};

window.clearChat = async () => {
    if (!state.currentChatUser || !confirm("Clear chat history? This only clears it for you.")) return;
    try {
        const partnerId = state.currentChatUser.uid;
        await db.collection('users').doc(state.currentUser.uid)
                .collection('activeChats').doc(partnerId)
                .set({ hiddenBefore: FieldValue.serverTimestamp() }, { merge: true });
        loadMessages(partnerId, false); 
    } catch(e) { console.error("Clear chat error", e); }
};

// --- OPTIMISTIC SENDING (INSTANT UI) ---
const sendMsg = async () => {
    const input = document.getElementById('msg-input');
    const txt = input.value.trim();
    if (!txt || (!state.currentChatUser && !state.currentClubData)) return;

    // 1. Clear Input Immediately
    input.value = '';
    input.focus(); // FIX: Keep focus to prevent keyboard retraction
    document.getElementById('send-btn').classList.add('hidden');
    stopTyping();

    const safeTxt = txt.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const ts = FieldValue.serverTimestamp();

    // 2. Prepare References
    let ref;
    let msgId;
    let isClub = !!state.currentClubData;

    if (isClub) {
        ref = db.collection('clubs').doc(state.currentClubData.id).collection('messages').doc();
    } else {
        const chatId = [state.currentUser.uid, state.currentChatUser.uid].sort().join('_');
        ref = db.collection('chats').doc(chatId).collection('messages').doc();
    }
    
    // 3. Get Generated ID
    msgId = ref.id;

    // 4. Create Optimistic Local Data
    const localData = {
        content: safeTxt,
        senderId: state.currentUser.uid,
        displayName: state.currentUser.displayName || 'Me',
        type: 'text',
        timestamp: new Date(), // Local time for instant display
        read: false,
        isDeleted: false
    };

    // 5. Render Immediately
    // Only render if we don't have it (we shouldn't)
    if (!document.getElementById(`msg-${msgId}`)) {
        // FIX: Check if we need to add a "Today" separator locally first
        const separators = dom.feed.getElementsByClassName('date-separator');
        let lastDate = null;
        if (separators.length > 0) {
            const badge = separators[separators.length - 1].querySelector('.date-badge');
            if (badge) lastDate = badge.textContent;
        }

        const currentDate = getFriendlyDate(new Date());
        if (currentDate !== lastDate) {
            dom.feed.appendChild(createDateSeparator(currentDate));
        }

        const bubble = createMessageBubble(localData, msgId, isClub);
        dom.feed.appendChild(bubble);
        dom.feed.scrollTop = dom.feed.scrollHeight;
    }

    // 6. Send to Background
    try {
        if (isClub) {
            // Use SET with specific ID so it matches the DOM element we just created
            await ref.set({
                content: safeTxt, 
                senderId: state.currentUser.uid, 
                displayName: state.currentUser.displayName,
                type: 'text', 
                timestamp: ts
            });
            await db.collection('clubs').doc(state.currentClubData.id).update({ lastMessageAt: ts });
            updateClubReadStatus(state.currentClubData.id);
        } else {
            // Use SET for direct chat as well
            await ref.set({
                content: safeTxt, 
                senderId: state.currentUser.uid, 
                type: 'text', 
                read: false, 
                timestamp: ts
            });
            
            const batch = db.batch();
            const myRef = db.collection('users').doc(state.currentUser.uid).collection('activeChats').doc(state.currentChatUser.uid);
            batch.set(myRef, { timestamp: ts }, { merge: true });

            const partnerRef = db.collection('users').doc(state.currentChatUser.uid).collection('activeChats').doc(state.currentUser.uid);
            batch.set(partnerRef, { timestamp: ts, unreadCount: FieldValue.increment(1) }, { merge: true });
            
            await batch.commit();
        }
    } catch (e) { 
        console.error("Send error", e); 
        // Optional: Add visual error state to bubble (e.g., red color)
        const bubble = document.getElementById(`msg-${msgId}`);
        if (bubble) bubble.style.opacity = '0.5'; 
    }
};

const sendBtn = document.getElementById('send-btn');
sendBtn.addEventListener('click', sendMsg);

// FIX: Prevent focus loss when tapping send button on mobile
// This prevents the "blur" event on the input, keeping keyboard open
sendBtn.addEventListener('mousedown', (e) => e.preventDefault());
sendBtn.addEventListener('touchstart', (e) => {
    // On some devices, touchstart is enough to blur. 
    // We prevent default to stop blur, but we must manually trigger send if click is suppressed.
    // However, usually preventDefault on mousedown is sufficient and safer for click firing.
    // But for robustness on all mobile browsers:
    e.preventDefault(); 
    sendMsg();
});

document.getElementById('msg-input').addEventListener('keydown', e => { if(e.key === 'Enter') sendMsg(); });

document.getElementById('msg-input').addEventListener('input', e => {
    const hasText = e.target.value.trim() !== '';
    document.getElementById('send-btn').classList.toggle('hidden', !hasText);
    if (hasText) {
        if (!state.intervals.typing) sendTypingSignal();
        clearTimeout(state.intervals.typing);
        state.intervals.typing = setTimeout(stopTyping, 2000);
    } else {
        stopTyping();
    }
});

async function sendTypingSignal() {
    if (!state.currentUser) return;
    const ts = FieldValue.serverTimestamp();
    const data = { isTyping: true, timestamp: ts, displayName: state.currentUser.displayName };
    try {
        if (state.currentChatUser) {
            const chatId = [state.currentUser.uid, state.currentChatUser.uid].sort().join('_');
            await db.collection('chats').doc(chatId).collection('typing').doc(state.currentUser.uid).set(data, {merge:true});
        } else if (state.currentClubData) {
            if (state.currentClubData.isAnonymous) data.displayName = 'Someone';
            await db.collection('clubs').doc(state.currentClubData.id).collection('typing').doc(state.currentUser.uid).set(data, {merge:true});
        }
    } catch(e){}
}

async function stopTyping() {
    state.intervals.typing = null;
    if (!state.currentUser) return;
    try {
        if (state.currentChatUser) {
            const chatId = [state.currentUser.uid, state.currentChatUser.uid].sort().join('_');
            await db.collection('chats').doc(chatId).collection('typing').doc(state.currentUser.uid).delete();
        } else if (state.currentClubData) {
            await db.collection('clubs').doc(state.currentClubData.id).collection('typing').doc(state.currentUser.uid).delete();
        }
    } catch(e){}
}

function listenForTyping(id, isClub) {
    if (state.listeners.typing) state.listeners.typing();
    let ref = isClub ? db.collection('clubs').doc(id).collection('typing') 
                     : db.collection('chats').doc([state.currentUser.uid, id].sort().join('_')).collection('typing');

    state.listeners.typing = ref.onSnapshot(snap => {
        const typers = [];
        const now = new Date();
        snap.forEach(doc => {
            if (doc.id !== state.currentUser.uid) {
                const d = doc.data();
                if (d.timestamp && (now - getSafeDate(d.timestamp)) < 10000) typers.push(d.displayName || 'Partner');
            }
        });
        const el = document.getElementById('partner-status');
        if (typers.length > 0) {
            el.classList.add('typing-active');
            el.style.color = '#6c5ce7';
            el.textContent = isClub ? (typers.length > 2 ? 'Several people are typing...' : `${typers.join(", ")} is typing...`) : 'typing...';
        } else {
            el.classList.remove('typing-active');
            if (isClub) {
                el.textContent = state.currentClubData.isAnonymous ? 'Anonymous Den' : 'Public Room';
                el.style.color = state.currentClubData.isAnonymous ? '#fdcb6e' : '#b2bec3';
            } else {
                const user = state.usersCache.get(state.currentChatUser.uid);
                const status = calculateStatus(user);
                el.textContent = status;
                el.style.color = status === 'Online' ? '#00b894' : '#b2bec3';
            }
        }
    });
}

// --- SEARCH & AUTH & MODALS ---
document.getElementById('user-search').addEventListener('input', e => {
    clearTimeout(state.intervals.search);
    const q = e.target.value.trim().toLowerCase();
    const res = document.getElementById('search-results');
    const list = document.getElementById('my-chats-list');

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

if(dom.backBtn = document.getElementById('back-btn')) { 
    dom.backBtn.addEventListener('click', (e) => { e.stopPropagation(); history.back(); });
}

dom.authBtn.addEventListener('click', async () => {
    dom.error.textContent = '';
    dom.authBtn.textContent = 'Processing...';
    dom.authBtn.disabled = true;
    try {
        if (state.isLoginMode) {
            const login = document.getElementById('login-input').value.trim();
            const pass = document.getElementById('password').value.trim();
            if(!login || !pass) throw new Error('Enter credentials');
            let email = login;
            if (!login.includes('@')) {
                const q = await db.collection('users').where('customId', '==', login.toLowerCase()).limit(1).get();
                if (q.empty) throw new Error('Username not found');
                email = q.docs[0].data().email;
            }
            await auth.signInWithEmailAndPassword(email, pass);
        } else {
            const email = document.getElementById('signup-email').value.trim();
            const pass = document.getElementById('password').value.trim();
            const name = document.getElementById('full-name').value.trim();
            const uid = document.getElementById('custom-id').value.trim().toLowerCase();
            if (!email || !pass || !name || !uid) throw new Error('All fields required');
            if (uid.length < 4) throw new Error('User ID too short (4+)');
            const check = await db.collection('users').where('customId', '==', uid).limit(1).get();
            if (!check.empty) throw new Error('User ID taken');
            const cred = await auth.createUserWithEmailAndPassword(email, pass);
            const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff`;
            await cred.user.updateProfile({ displayName: name, photoURL: avatar });
            await db.collection('users').doc(cred.user.uid).set({
                uid: cred.user.uid, displayName: name, customId: uid, email, photoURL: avatar,
                bio: 'Hey there! I am using Synapse', location: 'Unknown',
                isOnline: true, lastSeen: FieldValue.serverTimestamp()
            });
        }
    } catch(e) {
        dom.error.textContent = e.message;
        dom.authBtn.textContent = state.isLoginMode ? 'Login' : 'Create Account';
        dom.authBtn.disabled = false;
    }
});

dom.toggleBtn.addEventListener('click', () => {
    state.isLoginMode = !state.isLoginMode;
    document.getElementById('signup-extra').classList.toggle('hidden', state.isLoginMode);
    document.getElementById('login-input').placeholder = state.isLoginMode ? "Username or Email" : "Username (Login)";
    document.getElementById('login-input').parentElement.classList.toggle('hidden', !state.isLoginMode);
    dom.authBtn.textContent = state.isLoginMode ? 'Login' : 'Create Account';
    dom.toggleBtn.textContent = state.isLoginMode ? 'Create New Account' : 'Back to Login';
});

document.getElementById('logout-btn').addEventListener('click', async () => {
    if(state.currentUser) {
        await db.collection('users').doc(state.currentUser.uid).update({ 
            isOnline: false, lastSeen: FieldValue.serverTimestamp() 
        }).catch(()=>{});
    }
    await auth.signOut();
    window.location.reload();
});

const setupModal = (triggerId, modalId, closeId) => {
    const trigger = document.getElementById(triggerId);
    const modal = document.getElementById(modalId);
    const close = document.getElementById(closeId);
    if(trigger && modal && close) {
        trigger.addEventListener('click', () => modal.classList.remove('hidden'));
        close.addEventListener('click', () => modal.classList.add('hidden'));
    }
};

setupModal('my-profile-trigger', 'edit-profile-modal', 'close-edit-profile');

document.getElementById('my-profile-trigger').addEventListener('click', async () => {
    const doc = await db.collection('users').doc(state.currentUser.uid).get();
    const d = doc.data();
    document.getElementById('edit-avatar-preview').src = d.photoURL;
    document.getElementById('edit-name').value = d.displayName;
    document.getElementById('edit-bio').value = d.bio || '';
    document.getElementById('edit-location').value = d.location || '';
});

document.getElementById('save-profile-btn').addEventListener('click', async () => {
    const name = document.getElementById('edit-name').value;
    const bio = document.getElementById('edit-bio').value;
    const loc = document.getElementById('edit-location').value;
    await db.collection('users').doc(state.currentUser.uid).update({ displayName: name, bio, location: loc });
    document.getElementById('my-name').textContent = name;
    document.getElementById('edit-profile-modal').classList.add('hidden');
});

document.getElementById('partner-header-trigger').addEventListener('click', () => {
    if(!state.currentChatUser) return;
    document.getElementById('view-profile-modal').classList.remove('hidden');
    const u = state.usersCache.get(state.currentChatUser.uid) || state.currentChatUser;
    document.getElementById('view-avatar').src = u.photoURL;
    document.getElementById('view-name').textContent = u.displayName;
    document.getElementById('view-id').textContent = '@' + u.customId;
    document.getElementById('view-bio').textContent = u.bio || 'No bio.';
    document.getElementById('view-location').textContent = u.location || 'Unknown';
    const status = calculateStatus(u);
    const pill = document.getElementById('view-status-pill');
    pill.textContent = status;
    pill.style.color = status === 'Online' ? '#00b894' : '#fab1a0';
});

document.getElementById('close-view-profile').addEventListener('click', () => document.getElementById('view-profile-modal').classList.add('hidden'));