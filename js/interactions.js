// ——— SYNAPSE v2.0 — INTERACTIONS ———
import { dom } from './dom.js';
import { state } from './state.js';
import { db, FieldValue } from './config.js';
import { escapeHtml, triggerHaptic } from './utils.js';

// --- Context Menu Manager ---
export const ContextMenu = {
    hide() {
        dom.contextMenuOverlay.classList.add('hidden');
        dom.contextMenuOverlay.innerHTML = '';
        dom.contextMenuOverlay.classList.remove('mobile-active');
    },

    show(e, msgData, isClub, isSent) {
        document.querySelectorAll('.msg-row.show-actions').forEach(el => el.classList.remove('show-actions'));

        const overlay = dom.contextMenuOverlay;
        overlay.innerHTML = '';
        overlay.classList.remove('hidden');

        let itemsHtml = `
            <div class="context-item" onclick="window.startReply('${escapeHtml(JSON.stringify(msgData)).replace(/"/g, '&quot;')}', ${isClub}); window.ContextMenu.hide()">
                <i class="fa-solid fa-reply"></i> Reply
            </div>
            <div class="context-item" onclick="window.copyText('${escapeHtml(msgData.content).replace(/"/g, '&quot;')}'); window.ContextMenu.hide()">
                <i class="fa-regular fa-copy"></i> Copy Text
            </div>
            <div class="context-item" onclick="window.startForward('${escapeHtml(msgData.content).replace(/"/g, '&quot;')}'); window.ContextMenu.hide()">
                <i class="fa-solid fa-share"></i> Forward
            </div>
        `;

        if (isSent && msgData.type === 'text') {
            itemsHtml += `
            <div class="context-item" onclick="window.startEdit('${escapeHtml(JSON.stringify(msgData)).replace(/"/g, '&quot;')}', ${isClub}); window.ContextMenu.hide()">
                <i class="fa-solid fa-pen"></i> Edit
            </div>`;
        }

        itemsHtml += `
            <div class="context-item danger" onclick="window.promptDelete('${msgData.id}', ${isClub}, ${isSent}); window.ContextMenu.hide()">
                <i class="fa-solid fa-trash"></i> Delete
            </div>
        `;

        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.innerHTML = itemsHtml;
        overlay.appendChild(menu);

        if (window.innerWidth <= 768) {
            overlay.classList.add('mobile-active');
        } else {
            let x = e.clientX;
            let y = e.clientY;
            if (x + 200 > window.innerWidth) x -= 200;
            if (y + 250 > window.innerHeight) y -= 250;
            menu.style.left = `${x}px`;
            menu.style.top = `${y}px`;
        }
    }
};

window.ContextMenu = ContextMenu;

// --- Gesture Manager ---
export function attachGestures(element, msgData, isClub, isSent) {
    let touchStartX = 0;
    let touchStartY = 0;
    let longPressTimer;
    let isSwiping = false;
    let tapCount = 0;
    let tapTimer = null;

    const bubble = element.querySelector('.msg-bubble');
    if (!bubble) return;

    const startLongPress = (e) => {
        longPressTimer = setTimeout(() => {
            if (!isSwiping) {
                triggerHaptic();
                const touch = e.touches ? e.touches[0] : e;
                ContextMenu.show({ clientX: touch.clientX, clientY: touch.clientY }, msgData, isClub, isSent);
            }
        }, 500);
    };

    const cancelLongPress = () => clearTimeout(longPressTimer);

    // Touch events
    element.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        isSwiping = false;
        bubble.classList.remove('swipe-animate');
        startLongPress(e);
    }, { passive: true });

    element.addEventListener('touchmove', (e) => {
        const currentX = e.touches[0].clientX;
        const currentY = e.touches[0].clientY;
        const deltaX = currentX - touchStartX;
        const deltaY = currentY - touchStartY;

        if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) cancelLongPress();

        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
            isSwiping = true;
            const dragLimit = 70;
            let renderX = 0;
            if (isSent && deltaX < 0) renderX = Math.max(deltaX, -dragLimit);
            else if (!isSent && deltaX > 0) renderX = Math.min(deltaX, dragLimit);
            if (renderX !== 0) bubble.style.transform = `translateX(${renderX}px)`;
        }
    }, { passive: true });

    element.addEventListener('touchend', (e) => {
        cancelLongPress();
        bubble.classList.add('swipe-animate');
        bubble.style.transform = 'translateX(0)';

        const deltaX = e.changedTouches[0].clientX - touchStartX;
        if (Math.abs(deltaX) > 55 && isSwiping) {
            if ((isSent && deltaX < -45) || (!isSent && deltaX > 45)) {
                triggerHaptic();
                window.startReply(JSON.stringify(msgData), isClub);
            }
        }
        setTimeout(() => { isSwiping = false; }, 100);
    });

    // Right-click context menu
    element.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        ContextMenu.show(e, msgData, isClub, isSent);
    });

    // Click handler (single tap = toggle actions, triple tap = edit/reply)
    element.addEventListener('click', (e) => {
        if (isSwiping) return;
        if (!dom.contextMenuOverlay.classList.contains('hidden')) return;

        e.preventDefault();
        e.stopPropagation();

        tapCount++;
        clearTimeout(tapTimer);

        if (tapCount >= 3) {
            tapCount = 0;
            triggerHaptic();
            if (isSent && msgData.type === 'text') {
                window.startEdit(JSON.stringify(msgData), isClub);
            } else {
                window.startReply(JSON.stringify(msgData), isClub);
            }
            document.querySelectorAll('.msg-row.show-actions').forEach(el => el.classList.remove('show-actions'));
        } else {
            tapTimer = setTimeout(() => {
                if (tapCount === 1) {
                    window.toggleActions(bubble);
                }
                tapCount = 0;
            }, 300);
        }
    });
}

// --- Global Actions ---
window.copyText = (text) => {
    navigator.clipboard.writeText(text).then(() => {
        // Dynamic import to avoid circular dependency
        import('./ui.js').then(({ showToast }) => showToast('Copied to clipboard', 'success'));
    });
};

window.toggleActions = (bubble) => {
    const row = bubble.closest('.msg-row');
    if (row.classList.contains('show-actions')) {
        row.classList.remove('show-actions');
    } else {
        document.querySelectorAll('.msg-row.show-actions').forEach(el => el.classList.remove('show-actions'));
        row.classList.add('show-actions');
    }
};

window.promptDelete = (msgId, isClub, isSender) => {
    state.pendingDelete = { id: msgId, isClub, isSender };
    const modal = document.getElementById('delete-options-modal');
    const btnEveryone = document.getElementById('btn-del-everyone');
    if (isSender) btnEveryone.classList.remove('hidden');
    else btnEveryone.classList.add('hidden');
    modal.classList.remove('hidden');
};

window.confirmDeleteForMe = async () => {
    const { id, isClub } = state.pendingDelete;
    document.getElementById('delete-options-modal').classList.add('hidden');
    if (!id || !state.currentUser) return;
    try {
        let ref;
        if (isClub) ref = db.collection('clubs').doc(state.currentClubData.id).collection('messages').doc(id);
        else {
            const chatId = [state.currentUser.uid, state.currentChatUser.uid].sort().join('_');
            ref = db.collection('chats').doc(chatId).collection('messages').doc(id);
        }
        await ref.update({ deletedFor: FieldValue.arrayUnion(state.currentUser.uid) });
        const row = document.getElementById(`msg-${id}`);
        if (row) row.remove();
    } catch (e) {
        import('./ui.js').then(({ showToast }) => showToast('Error deleting message', 'error'));
    }
};

window.confirmDeleteForEveryone = async () => {
    const { id, isClub } = state.pendingDelete;
    document.getElementById('delete-options-modal').classList.add('hidden');
    if (!id || !state.currentUser) return;
    try {
        let ref;
        if (isClub) ref = db.collection('clubs').doc(state.currentClubData.id).collection('messages').doc(id);
        else {
            const chatId = [state.currentUser.uid, state.currentChatUser.uid].sort().join('_');
            ref = db.collection('chats').doc(chatId).collection('messages').doc(id);
        }
        await ref.update({ isDeleted: true, content: '', type: 'deleted' });
    } catch (e) {
        import('./ui.js').then(({ showToast }) => showToast('Error unsending message', 'error'));
    }
};

window.startReply = (msgDataStr, isClub) => {
    const msg = typeof msgDataStr === 'string' ? JSON.parse(msgDataStr) : msgDataStr;
    state.inputMode = 'reply';
    state.targetMsg = msg;

    dom.contextBar.classList.remove('hidden');
    dom.contextTitle.textContent = `Replying to ${msg.displayName}`;
    dom.contextText.textContent = msg.content;
    dom.contextBar.querySelector('.context-icon i').className = 'fa-solid fa-reply';

    dom.msgInput.focus();
    document.querySelectorAll('.msg-row.show-actions').forEach(el => el.classList.remove('show-actions'));
};

window.startEdit = (msgDataStr, isClub) => {
    const msg = typeof msgDataStr === 'string' ? JSON.parse(msgDataStr) : msgDataStr;
    state.inputMode = 'edit';
    state.targetMsg = msg;

    dom.contextBar.classList.remove('hidden');
    dom.contextTitle.textContent = 'Editing Message';
    dom.contextText.textContent = msg.content;
    dom.contextBar.querySelector('.context-icon i').className = 'fa-solid fa-pen';

    dom.msgInput.value = msg.content;
    dom.msgInput.focus();

    dom.sendBtn.querySelector('i').className = 'fa-solid fa-check';
    dom.sendBtn.classList.remove('hidden');
    document.querySelectorAll('.msg-row.show-actions').forEach(el => el.classList.remove('show-actions'));
};

window.cancelInputMode = () => {
    state.inputMode = 'normal';
    state.targetMsg = null;
    dom.contextBar.classList.add('hidden');
    dom.msgInput.value = '';
    dom.sendBtn.querySelector('i').className = 'fa-solid fa-paper-plane';
    dom.sendBtn.classList.add('hidden');
};

window.startForward = (content) => {
    state.forwardContent = content;
    dom.forwardModal.classList.remove('hidden');
    if (window.loadForwardList) window.loadForwardList('chats');
    document.querySelectorAll('.msg-row.show-actions').forEach(el => el.classList.remove('show-actions'));
};