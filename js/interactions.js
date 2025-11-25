import { dom } from './dom.js';
import { state } from './state.js';
import { db, FieldValue } from './config.js';
import { escapeHtml, triggerHaptic } from './utils.js';
import { loadForwardList } from './messages.js';

// --- CONTEXT MENU MANAGER ---
export const ContextMenu = {
    hide() {
        dom.contextMenuOverlay.classList.add('hidden');
        dom.contextMenuOverlay.innerHTML = '';
        dom.contextMenuOverlay.classList.remove('mobile-active');
    },
    
    show(e, msgData, isClub, isSent) {
        // Close inline menu first if open
        document.querySelectorAll('.msg-row.show-actions').forEach(el => el.classList.remove('show-actions'));
        
        const overlay = dom.contextMenuOverlay;
        overlay.innerHTML = '';
        overlay.classList.remove('hidden');

        // Build Menu Items
        let itemsHtml = `
            <div class="context-item" onclick="window.startReply('${escapeHtml(JSON.stringify(msgData)).replace(/"/g, '&quot;')}', ${isClub}); ContextMenu.hide()">
                <i class="fa-solid fa-reply"></i> Reply
            </div>
            <div class="context-item" onclick="window.copyText('${escapeHtml(msgData.content).replace(/"/g, '&quot;')}'); ContextMenu.hide()">
                <i class="fa-regular fa-copy"></i> Copy Text
            </div>
            <div class="context-item" onclick="window.startForward('${escapeHtml(msgData.content).replace(/"/g, '&quot;')}'); ContextMenu.hide()">
                <i class="fa-solid fa-share"></i> Forward
            </div>
        `;

        if (isSent && msgData.type === 'text') {
            itemsHtml += `
            <div class="context-item" onclick="window.startEdit('${escapeHtml(JSON.stringify(msgData)).replace(/"/g, '&quot;')}', ${isClub}); ContextMenu.hide()">
                <i class="fa-solid fa-pen"></i> Edit
            </div>
            `;
        }

        itemsHtml += `
            <div class="context-item danger" onclick="window.promptDelete('${msgData.id}', ${isClub}, ${isSent}); ContextMenu.hide()">
                <i class="fa-solid fa-trash"></i> Delete
            </div>
        `;

        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.innerHTML = itemsHtml;
        overlay.appendChild(menu);

        // Positioning Logic
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

// Make ContextMenu global so HTML onClick handlers can find it
window.ContextMenu = ContextMenu;

// --- GESTURE MANAGER ---
export function attachGestures(element, msgData, isClub, isSent) {
    let touchStartX = 0;
    let touchStartY = 0;
    let longPressTimer;
    let isSwiping = false;
    const bubble = element.querySelector('.msg-bubble');

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

    element.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        isSwiping = false;
        bubble.classList.remove('swipe-animate');
        startLongPress(e);
    }, {passive: true});

    element.addEventListener('touchmove', (e) => {
        const currentX = e.touches[0].clientX;
        const currentY = e.touches[0].clientY;
        const deltaX = currentX - touchStartX;
        const deltaY = currentY - touchStartY;
        
        if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) cancelLongPress();

        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
            isSwiping = true;
            const dragLimit = 80;
            let renderX = 0;

            if (isSent && deltaX < 0) renderX = Math.max(deltaX, -dragLimit);
            else if (!isSent && deltaX > 0) renderX = Math.min(deltaX, dragLimit);

            if (renderX !== 0) bubble.style.transform = `translateX(${renderX}px)`;
        }
    }, {passive: true});

    element.addEventListener('touchend', (e) => {
        cancelLongPress();
        bubble.classList.add('swipe-animate');
        bubble.style.transform = 'translateX(0)';

        const deltaX = e.changedTouches[0].clientX - touchStartX;
        
        // Handle Swipe Action
        if (Math.abs(deltaX) > 60 && isSwiping) {
            if ((isSent && deltaX < -50) || (!isSent && deltaX > 50)) {
                triggerHaptic();
                window.startReply(JSON.stringify(msgData), isClub);
            }
        }
        
        setTimeout(() => { isSwiping = false; }, 100);
    });

    element.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        ContextMenu.show(e, msgData, isClub, isSent);
    });

    element.addEventListener('click', (e) => {
        if (isSwiping) return;
        // Don't toggle inline menu if context menu is open
        if (!dom.contextMenuOverlay.classList.contains('hidden')) return;
        
        // Prevent accidental double firing
        e.stopPropagation();
        window.toggleActions(bubble);
    });
}

// --- GLOBAL ACTIONS ---
window.copyText = (text) => navigator.clipboard.writeText(text);

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
    state.pendingDelete = { id: msgId, isClub: isClub, isSender: isSender };
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
        if(row) row.remove();
    } catch(e) { alert("Error deleting."); }
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
    } catch(e) { alert("Error unsending."); }
};

window.startReply = (msgDataStr, isClub) => {
    const msg = typeof msgDataStr === 'string' ? JSON.parse(msgDataStr) : msgDataStr;
    state.inputMode = 'reply';
    state.targetMsg = msg;
    
    dom.contextBar.classList.remove('hidden');
    dom.contextTitle.textContent = `Replying to ${msg.displayName}`;
    dom.contextText.textContent = msg.content;
    dom.contextBar.querySelector('i').className = 'fa-solid fa-reply';
    
    dom.msgInput.focus();
    document.querySelectorAll('.msg-row.show-actions').forEach(el => el.classList.remove('show-actions'));
};

window.startEdit = (msgDataStr, isClub) => {
    const msg = typeof msgDataStr === 'string' ? JSON.parse(msgDataStr) : msgDataStr;
    state.inputMode = 'edit';
    state.targetMsg = msg;

    dom.contextBar.classList.remove('hidden');
    dom.contextTitle.textContent = "Editing Message";
    dom.contextText.textContent = msg.content;
    dom.contextBar.querySelector('i').className = 'fa-solid fa-pen';

    dom.msgInput.value = msg.content;
    dom.msgInput.focus();
    
    document.querySelector('.send-btn i').className = 'fa-solid fa-check';
    dom.sendBtn.classList.remove('hidden');
    document.querySelectorAll('.msg-row.show-actions').forEach(el => el.classList.remove('show-actions'));
};

window.cancelInputMode = () => {
    state.inputMode = 'normal';
    state.targetMsg = null;
    dom.contextBar.classList.add('hidden');
    
    dom.msgInput.value = '';
    
    document.querySelector('.send-btn i').className = 'fa-solid fa-paper-plane';
    dom.sendBtn.classList.add('hidden');
};

window.startForward = (content) => {
    state.forwardContent = content;
    dom.forwardModal.classList.remove('hidden');
    loadForwardList('chats'); 
    document.querySelectorAll('.msg-row.show-actions').forEach(el => el.classList.remove('show-actions'));
};
```

---

### 2. Removing the "Password/Card Bar" (Accessory View)

That bar appears because mobile browsers (especially Chrome/Android) try to suggest autocomplete data (emails, passwords, credit cards) whenever an input field is focused.

To remove it, you need to modify your `index.html`. You need to be very specific with the attributes on the input field.

**Steps:**
1. Open `index.html`.
2. Find the `<input id="msg-input" ...>` line inside the `input-wrapper`.
3. Replace it with the following line.

**The Fix:**
```html
<input 
    type="text" 
    id="msg-input" 
    placeholder="Type a message..." 
    autocomplete="off" 
    autocorrect="off" 
    spellcheck="false" 
    name="chat_message_v1"
>