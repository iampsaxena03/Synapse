// --- STATE MANAGEMENT ---
export const state = {
    currentUser: null,
    currentChatUser: null,
    currentClubData: null,
    currentChatParams: { hiddenBefore: null },
    
    // NEW STATES FOR FEATURES
    inputMode: 'normal', // 'normal', 'reply', 'edit'
    targetMsg: null,     // The message being Replied to or Edited
    forwardContent: null, // Content waiting to be forwarded
    
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

// --- LISTENER MANAGER ---
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
        if (state.listeners.clubs) state.listeners.clubs();
        if (state.listeners.typing) state.listeners.typing();
        this.clearAllRowListeners();
    }
};