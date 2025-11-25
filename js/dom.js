// --- DOM CACHE ---
// We use a getter or simple object assuming the script runs after DOM load (defer).
export const dom = {
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
    feed: document.getElementById('messages-feed'),
    // NEW DOM ELEMENTS
    contextBar: document.getElementById('input-context-bar'),
    contextTitle: document.querySelector('.context-title'),
    contextText: document.querySelector('.context-text'),
    closeContextBtn: document.getElementById('close-context-btn'),
    forwardModal: document.getElementById('forward-modal'),
    forwardList: document.getElementById('forward-list'),
    // Context Menu Container
    contextMenuOverlay: document.querySelector('.context-menu-overlay'),
    
    // Inputs & Buttons
    msgInput: document.getElementById('msg-input'),
    sendBtn: document.getElementById('send-btn'),
    userSearch: document.getElementById('user-search'),
    searchResults: document.getElementById('search-results'),
    backBtn: document.getElementById('back-btn')
};