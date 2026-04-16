// ——— SYNAPSE v2.0 — DOM CACHE ———
export const dom = {
    // Screens
    loading: document.getElementById('loading-screen'),
    auth: document.getElementById('auth-screen'),
    app: document.getElementById('app-screen'),

    // Sidebar
    sidebar: document.querySelector('.sidebar'),
    tabChats: document.getElementById('tab-chats'),
    tabClubs: document.getElementById('tab-clubs'),
    listChats: document.getElementById('my-chats-list'),
    listChatsContent: document.getElementById('my-chats-content'),
    listClubs: document.getElementById('clubs-list'),
    clubsContent: document.getElementById('clubs-content'),

    // Auth
    authBtn: document.getElementById('auth-btn'),
    toggleBtn: document.getElementById('toggle-mode'),
    error: document.getElementById('auth-error'),

    // Chat
    chatArea: document.getElementById('chat-view'),
    emptyState: document.getElementById('empty-state'),
    feed: document.getElementById('messages-feed'),

    // Context bar
    contextBar: document.getElementById('input-context-bar'),
    contextTitle: document.querySelector('.context-title'),
    contextText: document.querySelector('.context-text'),
    closeContextBtn: document.getElementById('close-context-btn'),

    // Forward
    forwardModal: document.getElementById('forward-modal'),
    forwardList: document.getElementById('forward-list'),

    // Context Menu
    contextMenuOverlay: document.querySelector('.context-menu-overlay'),

    // Input
    msgInput: document.getElementById('msg-input'),
    sendBtn: document.getElementById('send-btn'),
    userSearch: document.getElementById('user-search'),
    searchResults: document.getElementById('search-results'),
    backBtn: document.getElementById('back-btn'),

    // NEW — Emoji
    emojiBtn: document.getElementById('emoji-btn'),
    emojiPicker: document.getElementById('emoji-picker'),

    // NEW — Scroll to bottom
    scrollBottomBtn: document.getElementById('scroll-bottom-btn'),

    // NEW — Settings
    settingsBtn: document.getElementById('settings-btn'),
    settingsDrawer: document.getElementById('settings-drawer'),
    settingsOverlay: document.getElementById('settings-overlay'),
    closeSettings: document.getElementById('close-settings'),

    // NEW — Toasts
    toastContainer: document.getElementById('toast-container')
};