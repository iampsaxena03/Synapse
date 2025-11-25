import { db, FieldValue } from './config.js';
import { state, ListenerMgr } from './state.js';
import { dom } from './dom.js';
import { setupAuthListener } from './auth.js';
import { injectDeleteModal, switchTab } from './ui.js';
import { loadMoreMessages, markMessagesAsRead, resetUnreadCount, updateClubReadStatus } from './messages.js';
import { checkAllUserStatuses, closeChatUI } from './chat-list.js';
import { ContextMenu } from './interactions.js';

// --- MAIN APP INIT ---
function initApp() {
    // 1. Setup Browser History
    window.history.replaceState({ view: 'list' }, '');
    window.onpopstate = (event) => {
        if (!event.state || event.state.view === 'list') closeChatUI();
    };

    // 2. Start Status Watchers
    updateOnlineStatus();
    state.intervals.heartbeat = setInterval(updateOnlineStatus, 15000); 
    state.intervals.statusWatcher = setInterval(checkAllUserStatuses, 10000);
    
    // 3. Inject Modals
    injectDeleteModal(); 

    // 4. Default View
    switchTab('chats');
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

async function updateOnlineStatus() {
    if (!state.currentUser) return;
    try {
        await db.collection('users').doc(state.currentUser.uid).update({
            isOnline: true,
            lastSeen: FieldValue.serverTimestamp()
        });
    } catch (e) {}
}

// --- GLOBAL LISTENERS ---
// Visibility API
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        updateOnlineStatus();
        // Refresh read status
        if (state.currentChatUser) {
            markMessagesAsRead(state.currentChatUser.uid);
            resetUnreadCount(state.currentChatUser.uid);
        }
        if (state.currentClubData) {
            updateClubReadStatus(state.currentClubData.id);
        }
    }
});

// 1. ADD THIS NEW LISTENER HERE:
dom.closeContextBtn.addEventListener('click', () => {
    window.cancelInputMode();
});

// Visibility API
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        updateOnlineStatus();
        // Refresh read status
        if (state.currentChatUser) {
            markMessagesAsRead(state.currentChatUser.uid);
            resetUnreadCount(state.currentChatUser.uid);
        }
        if (state.currentClubData) {
            updateClubReadStatus(state.currentClubData.id);
        }
    }
});

// Scroll Logic
dom.feed.addEventListener('scroll', () => {
    if (dom.feed.scrollTop === 0 && !state.scroll.isFetching && !state.scroll.allLoaded && (state.currentChatUser || state.currentClubData)) {
        loadMoreMessages();
    }
});

// Tab Navigation
dom.tabChats.addEventListener('click', () => switchTab('chats'));
dom.tabClubs.addEventListener('click', () => switchTab('clubs'));

// Close Context Menu on outside click
dom.contextMenuOverlay.addEventListener('click', (e) => {
    if (e.target === dom.contextMenuOverlay) ContextMenu.hide();
});

// Scroll Logic
dom.feed.addEventListener('scroll', () => {
    if (dom.feed.scrollTop === 0 && !state.scroll.isFetching && !state.scroll.allLoaded && (state.currentChatUser || state.currentClubData)) {
        loadMoreMessages();
    }
});

// Tab Navigation
dom.tabChats.addEventListener('click', () => switchTab('chats'));
dom.tabClubs.addEventListener('click', () => switchTab('clubs'));

// Close Context Menu on outside click
dom.contextMenuOverlay.addEventListener('click', (e) => {
    if (e.target === dom.contextMenuOverlay) ContextMenu.hide();
});

// Back Button support (if present)
if(dom.backBtn) { 
    dom.backBtn.addEventListener('click', (e) => { e.stopPropagation(); history.back(); });
}

// --- STARTUP ---
// Connect Auth to App Logic
setupAuthListener(initApp, cleanupApp);

