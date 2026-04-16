// ——— SYNAPSE v2.0 — STATE MANAGEMENT ———
export const state = {
    currentUser: null,
    currentChatUser: null,
    currentClubData: null,
    currentChatParams: { hiddenBefore: null },

    // Input modes
    inputMode: 'normal', // 'normal', 'reply', 'edit'
    targetMsg: null,
    forwardContent: null,

    // UI state
    activeTab: 'chats',
    isLoginMode: true,
    emojiPickerOpen: false,

    // Caches
    usersCache: new Map(),
    reactionsCache: new Map(), // msgId -> { emoji: [uid, ...] }

    // Pending actions
    pendingDelete: { id: null, isClub: false, isSender: false },

    // Firebase listeners
    listeners: {
        messages: null,
        mainChats: null,
        clubs: null,
        typing: null,
        profiles: new Map(),
        rowTyping: new Map()
    },

    // Intervals & Timeouts
    intervals: {
        heartbeat: null,
        statusWatcher: null,
        search: null,
        typing: null
    },

    // Scroll state
    scroll: {
        oldestSnapshot: null,
        isFetching: false,
        allLoaded: false
    },

    // Settings (persisted in localStorage)
    settings: {
        sound: localStorage.getItem('synapse_sound') !== 'false',
        vibrate: localStorage.getItem('synapse_vibrate') !== 'false'
    }
};

// --- Listener Manager ---
export const ListenerMgr = {
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
        if (state.listeners.clubs) {
            if (Array.isArray(state.listeners.clubs)) {
                state.listeners.clubs.forEach(u => u());
            } else if (typeof state.listeners.clubs === 'function') {
                state.listeners.clubs();
            }
        }
        if (state.listeners.typing) state.listeners.typing();
        this.clearAllRowListeners();
    }
};