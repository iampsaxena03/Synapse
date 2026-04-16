// ——— SYNAPSE v2.0 — UI LOGIC ———
import { dom } from './dom.js';
import { state } from './state.js';
import { loadMyChats, loadClubs } from './chat-list.js';

// --- Screen Management ---
export function showAuth() {
    dom.app.classList.add('hidden');
    dom.auth.classList.remove('hidden');
    dom.loading.classList.add('hidden');
}

export function revealApp() {
    dom.loading.classList.add('hidden');
    dom.auth.classList.add('hidden');
    dom.app.classList.remove('hidden');
}

// --- Tab Switching ---
export function switchTab(tab) {
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

// --- Modal Management ---
export function setupModal(triggerId, modalId, closeId) {
    const trigger = document.getElementById(triggerId);
    const modal = document.getElementById(modalId);
    const close = document.getElementById(closeId);
    if (trigger && modal && close) {
        trigger.addEventListener('click', () => modal.classList.remove('hidden'));
        close.addEventListener('click', () => modal.classList.add('hidden'));
    }
}

// --- Delete Modal Injection ---
export function injectDeleteModal() {
    if (document.getElementById('delete-options-modal')) return;
    const modalHtml = `
    <div id="delete-options-modal" class="modal-overlay hidden">
        <div class="modal-card glass-card slide-up">
            <button class="close-modal" id="close-delete-modal"><i class="fa-solid fa-xmark"></i></button>
            <div class="modal-header">
                <h2>Delete Message</h2>
                <p>Choose how to delete this message</p>
            </div>
            <div class="choice-modal-body">
                <button id="btn-del-me" class="btn-choice">
                    <i class="fa-regular fa-trash-can"></i> Delete for Me
                </button>
                <button id="btn-del-everyone" class="btn-choice btn-delete-all hidden">
                    <i class="fa-solid fa-trash"></i> Delete for Everyone
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

// --- Toast Notification System (NEW) ---
export function showToast(message, type = 'info') {
    const icons = {
        success: 'fa-solid fa-check-circle',
        error: 'fa-solid fa-circle-exclamation',
        info: 'fa-solid fa-circle-info'
    };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<i class="${icons[type] || icons.info}"></i><span>${message}</span>`;
    dom.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('toast-exit');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// --- Settings Drawer (NEW) ---
export function setupSettings() {
    const open = () => {
        dom.settingsDrawer.classList.add('open');
        dom.settingsOverlay.classList.remove('hidden');
        requestAnimationFrame(() => dom.settingsOverlay.classList.add('visible'));
    };
    const close = () => {
        dom.settingsDrawer.classList.remove('open');
        dom.settingsOverlay.classList.remove('visible');
        setTimeout(() => dom.settingsOverlay.classList.add('hidden'), 250);
    };

    dom.settingsBtn.addEventListener('click', open);
    dom.closeSettings.addEventListener('click', close);
    dom.settingsOverlay.addEventListener('click', close);

    // Sound toggle
    const soundToggle = document.getElementById('setting-sound');
    soundToggle.checked = state.settings.sound;
    soundToggle.addEventListener('change', (e) => {
        state.settings.sound = e.target.checked;
        localStorage.setItem('synapse_sound', e.target.checked);
    });

    // Vibrate toggle
    const vibrateToggle = document.getElementById('setting-vibrate');
    vibrateToggle.checked = state.settings.vibrate;
    vibrateToggle.addEventListener('change', (e) => {
        state.settings.vibrate = e.target.checked;
        localStorage.setItem('synapse_vibrate', e.target.checked);
    });
}

// --- Emoji Picker (NEW) ---
const EMOJI_DATA = {
    '😀': ['😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊','😋','😎','🥳','😏','😒','😔','😢','😭','😤','🤯','🥺','😳','🤗','🤔','🤫','🤭','😐','😑','🙄','😬','🫠'],
    '❤️': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','❣️','💕','💖','💗','💘','💝','🫶','💯','💢','💥','✨','🔥','⭐','🌟'],
    '👋': ['👍','👎','👋','✌️','🤞','🤟','🤘','🤙','👏','🙌','🫡','🫰','👊','✊','🤝','🙏','💪','🫶'],
    '🐱': ['🐱','🐶','🐭','🐰','🦊','🐻','🐼','🐸','🦁','🐵','🐧','🐦','🦅','🦋','🐝','🐙','🐠'],
    '🍕': ['🍕','🍔','🍟','🌮','🍩','🍰','☕','🍺','🥤','🍿','🎂','🍫','🧁','🥂','🍷'],
    '⚽': ['⚽','🏀','🏈','🎮','🎯','🎲','🎸','🎵','🎬','📸','💻','📱','💡','🔑','🎁','🏆','🥇'],
    '🚀': ['🚀','✈️','🚗','🏠','🌍','🌈','☀️','🌙','⚡','💫','🎉','🎊','🏳️','💎','🔔','📌','❗','❓','✅','❌']
};
const EMOJI_CATS = Object.keys(EMOJI_DATA);

export function setupEmojiPicker() {
    const picker = dom.emojiPicker;

    // Build header
    let headerHtml = '<div class="emoji-picker-header">';
    EMOJI_CATS.forEach((cat, i) => {
        headerHtml += `<button class="emoji-cat-btn ${i === 0 ? 'active' : ''}" data-cat="${i}">${cat}</button>`;
    });
    headerHtml += '</div><div class="emoji-grid" id="emoji-grid"></div>';
    picker.innerHTML = headerHtml;

    const grid = document.getElementById('emoji-grid');
    const renderCategory = (idx) => {
        const cat = EMOJI_CATS[idx];
        const emojis = EMOJI_DATA[cat];
        grid.innerHTML = emojis.map(e => `<div class="emoji-item" data-emoji="${e}">${e}</div>`).join('');
        picker.querySelectorAll('.emoji-cat-btn').forEach((btn, i) => {
            btn.classList.toggle('active', i === idx);
        });
    };
    renderCategory(0);

    // Category switching
    picker.querySelectorAll('.emoji-cat-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            renderCategory(parseInt(btn.dataset.cat));
        });
    });

    // Emoji selection
    grid.addEventListener('click', (e) => {
        const item = e.target.closest('.emoji-item');
        if (item) {
            const emoji = item.dataset.emoji;
            const input = dom.msgInput;
            const pos = input.selectionStart || input.value.length;
            input.value = input.value.slice(0, pos) + emoji + input.value.slice(pos);
            input.focus();
            input.dispatchEvent(new Event('input'));
        }
    });

    // Toggle picker
    dom.emojiBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.emojiPickerOpen = !state.emojiPickerOpen;
        picker.classList.toggle('hidden', !state.emojiPickerOpen);
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
        if (state.emojiPickerOpen && !picker.contains(e.target) && e.target !== dom.emojiBtn) {
            state.emojiPickerOpen = false;
            picker.classList.add('hidden');
        }
    });
}