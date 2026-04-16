// ——— SYNAPSE v2.0 — MAIN ENTRY POINT ———
// All duplicate event listeners from v1 have been removed.
// Single, clean initialization flow.

import { db, FieldValue } from './config.js';
import { state, ListenerMgr } from './state.js';
import { dom } from './dom.js';
import { setupAuthListener } from './auth.js';
import { injectDeleteModal, switchTab, setupSettings, setupEmojiPicker } from './ui.js';
import { loadMoreMessages, markMessagesAsRead, resetUnreadCount, updateClubReadStatus } from './messages.js';
import { checkAllUserStatuses, closeChatUI } from './chat-list.js';
import { ContextMenu } from './interactions.js';

// ——— APP INIT ———
function initApp() {
    // 1. Browser History
    window.history.replaceState({ view: 'list' }, '');
    window.onpopstate = (event) => {
        if (!event.state || event.state.view === 'list') closeChatUI();
    };

    // 2. Status Heartbeat
    updateOnlineStatus();
    state.intervals.heartbeat = setInterval(updateOnlineStatus, 15000);
    state.intervals.statusWatcher = setInterval(checkAllUserStatuses, 10000);

    // 3. Inject Dynamic UI
    injectDeleteModal();
    setupSettings();
    setupEmojiPicker();

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
    } catch (e) { }
}

// ——— EVENT LISTENERS (SINGLE REGISTRATION) ———

// Visibility change — refresh status & read receipts
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        updateOnlineStatus();
        if (state.currentChatUser) {
            markMessagesAsRead(state.currentChatUser.uid);
            resetUnreadCount(state.currentChatUser.uid);
        }
        if (state.currentClubData) {
            updateClubReadStatus(state.currentClubData.id);
        }
    }
});

// Close context bar
dom.closeContextBtn.addEventListener('click', () => {
    window.cancelInputMode();
});

// Infinite scroll (load older messages)
dom.feed.addEventListener('scroll', () => {
    // Load more at top
    if (dom.feed.scrollTop === 0 && !state.scroll.isFetching && !state.scroll.allLoaded && (state.currentChatUser || state.currentClubData)) {
        loadMoreMessages();
    }

    // Scroll-to-bottom button visibility
    const distFromBottom = dom.feed.scrollHeight - dom.feed.scrollTop - dom.feed.clientHeight;
    if (distFromBottom > 200) {
        dom.scrollBottomBtn.classList.remove('hidden');
    } else {
        dom.scrollBottomBtn.classList.add('hidden');
    }
});

// Scroll to bottom button
dom.scrollBottomBtn.addEventListener('click', () => {
    dom.feed.scrollTo({ top: dom.feed.scrollHeight, behavior: 'smooth' });
});

// Tab navigation
dom.tabChats.addEventListener('click', () => switchTab('chats'));
dom.tabClubs.addEventListener('click', () => switchTab('clubs'));

// Close context menu overlay
dom.contextMenuOverlay.addEventListener('click', (e) => {
    if (e.target === dom.contextMenuOverlay) ContextMenu.hide();
});

// Back button (mobile)
if (dom.backBtn) {
    dom.backBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        history.back();
    });
}

// Close actions on feed click
dom.feed.addEventListener('click', (e) => {
    if (e.target === dom.feed) {
        document.querySelectorAll('.msg-row.show-actions').forEach(el => el.classList.remove('show-actions'));
    }
});

// ——— STARTUP ———
setupAuthListener(initApp, cleanupApp);
