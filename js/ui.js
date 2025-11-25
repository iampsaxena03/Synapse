import { dom } from './dom.js';
import { state } from './state.js';
import { loadMyChats } from './chat-list.js';
import { loadClubs } from './chat-list.js';

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

export function setupModal(triggerId, modalId, closeId) {
    const trigger = document.getElementById(triggerId);
    const modal = document.getElementById(modalId);
    const close = document.getElementById(closeId);
    if(trigger && modal && close) {
        trigger.addEventListener('click', () => modal.classList.remove('hidden'));
        close.addEventListener('click', () => modal.classList.add('hidden'));
    }
}

export function injectDeleteModal() {
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
    
    // NOTE: confirmDelete functions are attached to window in interactions.js
    document.getElementById('btn-del-me').onclick = () => window.confirmDeleteForMe();
    document.getElementById('btn-del-everyone').onclick = () => window.confirmDeleteForEveryone();
}