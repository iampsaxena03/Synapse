import { db, FieldValue } from './config.js';
import { state } from './state.js';
import { dom } from './dom.js';
import { escapeHtml, getSafeDate, getFriendlyDate } from './utils.js';
import { attachGestures } from './interactions.js';
import { calculateStatus } from './chat-list.js';

// --- READ RECEIPTS ---
export async function markMessagesAsRead(partnerId) {
    if (!state.currentUser) return;
    const chatId = [state.currentUser.uid, partnerId].sort().join('_');
    const batch = db.batch();
    try {
        const snap = await db.collection('chats').doc(chatId).collection('messages')
            .where('senderId', '==', partnerId)
            .where('read', '==', false)
            .limit(20)
            .get();

        if (snap.empty) return;
        snap.forEach(doc => batch.update(doc.ref, { read: true }));
        await batch.commit();
    } catch (e) { console.warn("Read receipt error:", e); }
}

export async function resetUnreadCount(partnerId) {
    if (!state.currentUser) return;
    try {
        const row = document.getElementById(`user-row-${partnerId}`);
        if(row) {
             let badge = row.querySelector('.unread-badge');
             if(badge) badge.style.display = 'none';
        }

        await db.collection('users').doc(state.currentUser.uid)
            .collection('activeChats').doc(partnerId)
            .update({ unreadCount: 0 }); 
    } catch (e) { 
        if(e.code === 'not-found') {
             await db.collection('users').doc(state.currentUser.uid)
            .collection('activeChats').doc(partnerId)
            .set({ unreadCount: 0 }, { merge: true });
        }
    }
}

export async function updateClubReadStatus(clubId) {
    if (!state.currentUser) return;
    try {
        await db.collection('users').doc(state.currentUser.uid)
            .collection('clubStates').doc(clubId).set({
                lastRead: FieldValue.serverTimestamp()
            }, { merge: true });
    } catch(e) { console.warn("Club read status error:", e); }
}

// --- MESSAGES LOADING ---
export async function loadMessages(id, isClub) {
    if (state.listeners.messages) state.listeners.messages();
    dom.feed.innerHTML = '';
    state.scroll.oldestSnapshot = null;
    state.scroll.allLoaded = false;
    state.currentChatParams.hiddenBefore = null;
    
    const targetId = id;

    if (!isClub) {
        try {
            const metaDoc = await db.collection('users').doc(state.currentUser.uid)
                                   .collection('activeChats').doc(id).get();
            
            if (state.currentChatUser?.uid !== targetId && state.currentClubData?.id !== targetId) return;

            if (metaDoc.exists && metaDoc.data().hiddenBefore) {
                state.currentChatParams.hiddenBefore = getSafeDate(metaDoc.data().hiddenBefore);
            }
        } catch (e) { console.error("Error fetching chat meta", e); }
    }

    let ref = isClub ? 
        db.collection('clubs').doc(id).collection('messages') : 
        db.collection('chats').doc([state.currentUser.uid, id].sort().join('_')).collection('messages');

    state.listeners.messages = ref.orderBy('timestamp', 'asc').limitToLast(40).onSnapshot(snap => {
        if (!snap.empty) {
            if (!state.scroll.oldestSnapshot) state.scroll.oldestSnapshot = snap.docs[0];
            
            if (document.visibilityState === 'visible') {
                setTimeout(() => {
                    if (!isClub) {
                        const hasUnread = snap.docs.some(doc => doc.data().senderId === id && !doc.data().read);
                        if (hasUnread) { 
                            markMessagesAsRead(id); 
                            resetUnreadCount(id); 
                        }
                    } else {
                        updateClubReadStatus(id);
                    }
                }, 50); 
            }
        }

        let lastRenderedDate = null;
        const separators = dom.feed.getElementsByClassName('date-separator');
        if (separators.length > 0) {
            const lastBadge = separators[separators.length - 1].querySelector('.date-badge');
            if (lastBadge) lastRenderedDate = lastBadge.textContent;
        }

        snap.docChanges().forEach(change => {
            const doc = change.doc;
            const data = doc.data();

            if (data.deletedFor && data.deletedFor.includes(state.currentUser.uid)) return;

            const safeDate = getSafeDate(data.timestamp);

            if (change.type === 'added') {
                if (state.currentChatParams.hiddenBefore && safeDate < state.currentChatParams.hiddenBefore) return;

                if (!document.getElementById(`msg-${doc.id}`)) {
                    const msgDate = getFriendlyDate(safeDate);
                    if (msgDate !== lastRenderedDate) {
                        const dateDiv = createDateSeparator(msgDate);
                        dom.feed.appendChild(dateDiv);
                        lastRenderedDate = msgDate;
                    }

                    const div = createMessageBubble(data, doc.id, isClub);
                    dom.feed.appendChild(div);
                    dom.feed.scrollTop = dom.feed.scrollHeight; 
                }
            } 
            else if (change.type === 'modified') {
                const existing = document.getElementById(`msg-${change.doc.id}`);
                if (existing) {
                    if (data.deletedFor && data.deletedFor.includes(state.currentUser.uid)) {
                        existing.remove();
                        return;
                    }
                    const newBubble = createMessageBubble(data, change.doc.id, isClub);
                    existing.replaceWith(newBubble);
                }
            }
        });
    });
}

function createDateSeparator(dateStr) {
    const div = document.createElement('div');
    div.className = 'date-separator';
    div.innerHTML = `<span class="date-badge">${dateStr}</span>`;
    return div;
}

// --- RENDER BUBBLE ---
function createMessageBubble(msg, id, isClub) {
    const isSent = msg.senderId === state.currentUser.uid;
    const div = document.createElement('div');
    div.id = `msg-${id}`;
    
    const safeDate = getSafeDate(msg.timestamp);
    div.dataset.date = getFriendlyDate(safeDate);
    
    if (msg.isDeleted) {
        div.className = `msg-row ${isSent ? 'sent' : 'received'} deleted`;
        div.innerHTML = `
            <div class="msg-bubble">
                <span><i class="fa-solid fa-ban"></i> <i>This message was deleted</i></span>
            </div>`;
        return div;
    }

    div.className = `msg-row ${isSent ? 'sent' : 'received'}`;
    const time = safeDate.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
    let meta = `<span class="msg-time">${time}</span>`;
    
    if (msg.isEdited) {
        meta = `<span class="edited-label">(edited)</span> ` + meta;
    }

    if (!isClub && isSent) {
        meta += `<span class="tick-container"><i class="fa-solid fa-check-double tick-icon ${msg.read ? 'tick-blue' : 'tick-grey'}"></i></span>`;
    }

    let sender = '';
    if (isClub && !isSent) {
        sender = state.currentClubData?.isAnonymous ? 
            `<div class="sender-name" style="color:#fab1a0"><i class="fa-solid fa-mask"></i> Anonymous Fox</div>` :
            `<div class="sender-name">${escapeHtml(msg.displayName || 'User')}</div>`;
    }

    let replyBlock = '';
    if (msg.replyTo) {
        replyBlock = `
        <div class="reply-quote" onclick="event.stopPropagation(); window.scrollToMsg('${msg.replyTo.id}')">
            <span class="reply-sender">${escapeHtml(msg.replyTo.displayName)}</span>
            <span class="reply-text">${escapeHtml(msg.replyTo.content)}</span>
        </div>`;
    }

    let forwardLabel = '';
    if (msg.isForwarded) {
        forwardLabel = `<div class="forward-label"><i class="fa-solid fa-share"></i> Forwarded</div>`;
    }

    const msgData = {id: id, content: msg.content, displayName: msg.displayName || 'User', senderId: msg.senderId, type: msg.type};
    const msgDataJSON = JSON.stringify(msgData);

    const canEdit = isSent && msg.type === 'text';
    const actionMenu = `
        <div class="msg-action-menu">
            <button class="action-btn" onclick="event.stopPropagation(); window.startReply('${escapeHtml(msgDataJSON).replace(/"/g, '&quot;')}', ${isClub})" title="Reply">
                <i class="fa-solid fa-reply"></i>
            </button>
            <button class="action-btn" onclick="event.stopPropagation(); window.startForward('${escapeHtml(msg.content).replace(/"/g, '&quot;')}')" title="Forward">
                <i class="fa-solid fa-share"></i>
            </button>
            ${canEdit ? `<button class="action-btn" onclick="event.stopPropagation(); window.startEdit('${escapeHtml(msgDataJSON).replace(/"/g, '&quot;')}', ${isClub})" title="Edit"><i class="fa-solid fa-pen"></i></button>` : ''}
            <button class="action-btn delete-btn" onclick="event.stopPropagation(); window.promptDelete('${id}', ${isClub}, ${isSent})" title="Delete">
                <i class="fa-solid fa-trash"></i>
            </button>
        </div>
    `;

    div.innerHTML = `
        ${actionMenu}
        <div class="msg-bubble">
            ${forwardLabel}
            ${replyBlock}
            ${sender}
            <span>${escapeHtml(msg.content)}</span>
            <div class="msg-meta">${meta}</div>
        </div>
    `;

    attachGestures(div, msgData, isClub, isSent);

    return div;
}

// --- SCROLL LOGIC ---
export async function loadMoreMessages() {
    if (!state.scroll.oldestSnapshot) return;
    state.scroll.isFetching = true;

    let oldFirstMsgDate = null;
    let runner = dom.feed.firstElementChild;
    while(runner && !runner.classList.contains('msg-row')) {
        runner = runner.nextElementSibling;
    }
    if (runner && runner.dataset.date) {
        oldFirstMsgDate = runner.dataset.date;
    }
    
    let ref = state.currentClubData ? 
        db.collection('clubs').doc(state.currentClubData.id).collection('messages') : 
        db.collection('chats').doc([state.currentUser.uid, state.currentChatUser.uid].sort().join('_')).collection('messages');

    try {
        const snap = await ref.orderBy('timestamp', 'desc').startAfter(state.scroll.oldestSnapshot).limit(20).get();
        if (snap.empty) { state.scroll.allLoaded = true; state.scroll.isFetching = false; return; }

        state.scroll.oldestSnapshot = snap.docs[snap.docs.length - 1];
        
        const fragment = document.createDocumentFragment();
        const docs = snap.docs.reverse(); 
        let batchLastDate = null;

        docs.forEach(doc => {
            const data = doc.data();
            if (data.deletedFor && data.deletedFor.includes(state.currentUser.uid)) return;

            const safeDate = getSafeDate(data.timestamp);
            const msgDate = getFriendlyDate(safeDate);
            
            if (msgDate !== batchLastDate) {
                fragment.appendChild(createDateSeparator(msgDate));
                batchLastDate = msgDate;
            }
            
            const msgDiv = createMessageBubble(data, doc.id, !!state.currentClubData);
            fragment.appendChild(msgDiv);
        });

        if (batchLastDate && batchLastDate === oldFirstMsgDate) {
            const previousSep = runner ? runner.previousElementSibling : null;
            if (previousSep && previousSep.classList.contains('date-separator')) {
                previousSep.remove();
            }
        }

        const prevHeight = dom.feed.scrollHeight;
        dom.feed.insertBefore(fragment, dom.feed.firstElementChild);
        dom.feed.scrollTop = dom.feed.scrollHeight - prevHeight;

    } catch(e) { console.error(e); } 
    finally { state.scroll.isFetching = false; }
}

// --- SEND LOGIC ---
const sendMsg = async () => {
    const input = dom.msgInput;
    const txt = input.value.trim();
    if (!txt) return;

    const mode = state.inputMode;
    const target = state.targetMsg;
    const isClub = !!state.currentClubData;
    
    if (mode === 'edit') {
        if (!target) return;
        try {
            let ref = isClub ? 
                db.collection('clubs').doc(state.currentClubData.id).collection('messages').doc(target.id) : 
                db.collection('chats').doc([state.currentUser.uid, state.currentChatUser.uid].sort().join('_')).collection('messages').doc(target.id);
            
            await ref.update({
                content: txt,
                isEdited: true,
                editedAt: FieldValue.serverTimestamp()
            });
            window.cancelInputMode();
        } catch(e) { console.error(e); }
        return;
    }

    input.value = '';
    input.focus();
    dom.sendBtn.classList.add('hidden');
    stopTyping();
    window.cancelInputMode();

    const safeTxt = txt.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const ts = FieldValue.serverTimestamp();

    let ref;
    let msgId;

    if (isClub) {
        ref = db.collection('clubs').doc(state.currentClubData.id).collection('messages').doc();
    } else {
        const chatId = [state.currentUser.uid, state.currentChatUser.uid].sort().join('_');
        ref = db.collection('chats').doc(chatId).collection('messages').doc();
    }
    
    msgId = ref.id;

    const localData = {
        content: safeTxt,
        senderId: state.currentUser.uid,
        displayName: state.currentUser.displayName || 'Me',
        type: 'text',
        timestamp: new Date(),
        read: false,
        isDeleted: false,
        replyTo: mode === 'reply' ? {
            id: target.id,
            displayName: target.displayName,
            content: target.content,
            senderId: target.senderId
        } : null
    };

    if (!document.getElementById(`msg-${msgId}`)) {
        const bubble = createMessageBubble(localData, msgId, isClub);
        dom.feed.appendChild(bubble);
        dom.feed.scrollTop = dom.feed.scrollHeight;
    }

    try {
        const payload = {
            content: safeTxt, 
            senderId: state.currentUser.uid, 
            type: 'text', 
            timestamp: ts
        };
        
        if (isClub) {
            payload.displayName = state.currentUser.displayName;
        } else {
            payload.read = false;
        }

        if (mode === 'reply') {
            payload.replyTo = {
                id: target.id,
                displayName: target.displayName,
                content: target.content,
                senderId: target.senderId
            };
        }

        await ref.set(payload);

        if (isClub) {
            await db.collection('clubs').doc(state.currentClubData.id).update({ lastMessageAt: ts });
            updateClubReadStatus(state.currentClubData.id);
        } else {
            const batch = db.batch();
            const myRef = db.collection('users').doc(state.currentUser.uid).collection('activeChats').doc(state.currentChatUser.uid);
            batch.set(myRef, { timestamp: ts }, { merge: true });

            const partnerRef = db.collection('users').doc(state.currentChatUser.uid).collection('activeChats').doc(state.currentUser.uid);
            batch.set(partnerRef, { timestamp: ts, unreadCount: FieldValue.increment(1) }, { merge: true });
            
            await batch.commit();
        }
    } catch (e) { 
        console.error("Send error", e); 
        const bubble = document.getElementById(`msg-${msgId}`);
        if (bubble) bubble.style.opacity = '0.5'; 
    }
};

dom.sendBtn.addEventListener('click', sendMsg);
dom.sendBtn.addEventListener('mousedown', (e) => e.preventDefault());
dom.sendBtn.addEventListener('touchstart', (e) => { e.preventDefault(); sendMsg(); });
dom.msgInput.addEventListener('keydown', e => { if(e.key === 'Enter') sendMsg(); });

// Typing Indicators
dom.msgInput.addEventListener('input', e => {
    const hasText = e.target.value.trim() !== '';
    dom.sendBtn.classList.toggle('hidden', !hasText);
    if (hasText) {
        if (!state.intervals.typing) sendTypingSignal();
        clearTimeout(state.intervals.typing);
        state.intervals.typing = setTimeout(stopTyping, 2000);
    } else {
        stopTyping();
    }
});

async function sendTypingSignal() {
    if (!state.currentUser) return;
    const ts = FieldValue.serverTimestamp();
    const data = { isTyping: true, timestamp: ts, displayName: state.currentUser.displayName };
    try {
        if (state.currentChatUser) {
            const chatId = [state.currentUser.uid, state.currentChatUser.uid].sort().join('_');
            await db.collection('chats').doc(chatId).collection('typing').doc(state.currentUser.uid).set(data, {merge:true});
        } else if (state.currentClubData) {
            if (state.currentClubData.isAnonymous) data.displayName = 'Someone';
            await db.collection('clubs').doc(state.currentClubData.id).collection('typing').doc(state.currentUser.uid).set(data, {merge:true});
        }
    } catch(e){}
}

async function stopTyping() {
    state.intervals.typing = null;
    if (!state.currentUser) return;
    try {
        if (state.currentChatUser) {
            const chatId = [state.currentUser.uid, state.currentChatUser.uid].sort().join('_');
            await db.collection('chats').doc(chatId).collection('typing').doc(state.currentUser.uid).delete();
        } else if (state.currentClubData) {
            await db.collection('clubs').doc(state.currentClubData.id).collection('typing').doc(state.currentUser.uid).delete();
        }
    } catch(e){}
}

export function listenForTyping(id, isClub) {
    if (state.listeners.typing) state.listeners.typing();
    let ref = isClub ? db.collection('clubs').doc(id).collection('typing') 
                     : db.collection('chats').doc([state.currentUser.uid, id].sort().join('_')).collection('typing');

    state.listeners.typing = ref.onSnapshot(snap => {
        const typers = [];
        const now = new Date();
        snap.forEach(doc => {
            if (doc.id !== state.currentUser.uid) {
                const d = doc.data();
                if (d.timestamp && (now - getSafeDate(d.timestamp)) < 10000) typers.push(d.displayName || 'Partner');
            }
        });
        const el = document.getElementById('partner-status');
        if (typers.length > 0) {
            el.classList.add('typing-active');
            el.style.color = '#6c5ce7';
            el.textContent = isClub ? (typers.length > 2 ? 'Several people are typing...' : `${typers.join(", ")} is typing...`) : 'typing...';
        } else {
            el.classList.remove('typing-active');
            if (isClub) {
                el.textContent = state.currentClubData.isAnonymous ? 'Anonymous Den' : 'Public Room';
                el.style.color = state.currentClubData.isAnonymous ? '#fdcb6e' : '#b2bec3';
            } else {
                const user = state.usersCache.get(state.currentChatUser.uid);
                const status = calculateStatus(user);
                el.textContent = status;
                el.style.color = status === 'Online' ? '#00b894' : '#b2bec3';
            }
        }
    });
}

// Forward List Logic (exported so interactions.js can call it via window or imports)
export function loadForwardList(type) {
    if (type === 'chats') {
        document.getElementById('fwd-tab-chats').classList.add('active');
        document.getElementById('fwd-tab-clubs').classList.remove('active');
    } else {
        document.getElementById('fwd-tab-chats').classList.remove('active');
        document.getElementById('fwd-tab-clubs').classList.add('active');
    }

    const container = dom.forwardList;
    container.innerHTML = '';

    if (type === 'chats') {
        if (state.usersCache.size === 0) {
            container.innerHTML = '<div style="padding:15px;text-align:center;opacity:0.5">No recent chats loaded.</div>';
            return;
        }
        state.usersCache.forEach(user => {
            if (user.uid === state.currentUser.uid) return;
            const div = document.createElement('div');
            div.className = 'user-item';
            div.innerHTML = `
                <img src="${user.photoURL}" onerror="this.src='https://via.placeholder.com/50'">
                <div class="user-info"><h4>${escapeHtml(user.displayName)}</h4></div>
                <button class="forward-btn-action" onclick="window.confirmForward('${user.uid}', false)">Send</button>
            `;
            container.appendChild(div);
        });
    } else {
        db.collection('clubs').limit(10).get().then(snap => {
            snap.forEach(doc => {
                const club = doc.data();
                const div = document.createElement('div');
                div.className = 'club-item';
                div.innerHTML = `
                     <i class="${club.icon || 'fa-solid fa-users'} club-icon"></i>
                     <div class="user-info"><h4>${escapeHtml(club.name)}</h4></div>
                     <button class="forward-btn-action" onclick="window.confirmForward('${doc.id}', true)">Send</button>
                `;
                container.appendChild(div);
            });
        });
    }
}

// Attach globals
window.scrollToMsg = (id) => {
    const el = document.getElementById(`msg-${id}`);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.querySelector('.msg-bubble').style.background = 'var(--glass-highlight)';
        setTimeout(() => el.querySelector('.msg-bubble').style.background = '', 1000);
    } else { alert("Message is too old or not loaded."); }
};

window.clearChat = async () => {
    if (!state.currentChatUser || !confirm("Clear chat history? This only clears it for you.")) return;
    try {
        const partnerId = state.currentChatUser.uid;
        await db.collection('users').doc(state.currentUser.uid)
                .collection('activeChats').doc(partnerId)
                .set({ hiddenBefore: FieldValue.serverTimestamp() }, { merge: true });
        loadMessages(partnerId, false); 
    } catch(e) { console.error("Clear chat error", e); }
};

window.confirmForward = async (targetId, isClub) => {
    if (!state.forwardContent) return;
    const btn = event.target;
    const oldText = btn.textContent;
    btn.textContent = 'Sent!';
    btn.disabled = true;

    try {
        let ref;
        const ts = FieldValue.serverTimestamp();
        
        if (isClub) {
             ref = db.collection('clubs').doc(targetId).collection('messages').doc();
             await ref.set({
                content: state.forwardContent,
                senderId: state.currentUser.uid,
                displayName: state.currentUser.displayName,
                type: 'text',
                isForwarded: true,
                timestamp: ts
             });
             await db.collection('clubs').doc(targetId).update({ lastMessageAt: ts });
        } else {
            const chatId = [state.currentUser.uid, targetId].sort().join('_');
            ref = db.collection('chats').doc(chatId).collection('messages').doc();
            await ref.set({
                content: state.forwardContent,
                senderId: state.currentUser.uid,
                type: 'text',
                read: false,
                isForwarded: true,
                timestamp: ts
            });
            const batch = db.batch();
            batch.set(db.collection('users').doc(state.currentUser.uid).collection('activeChats').doc(targetId), { timestamp: ts }, { merge: true });
            batch.set(db.collection('users').doc(targetId).collection('activeChats').doc(state.currentUser.uid), { timestamp: ts, unreadCount: FieldValue.increment(1) }, { merge: true });
            await batch.commit();
        }
        
        setTimeout(() => {
            dom.forwardModal.classList.add('hidden');
            btn.textContent = oldText;
            btn.disabled = false;
        }, 800);
    } catch(e) { console.error(e); btn.textContent = 'Error'; }
};

// Event Listeners for Forward Modal
document.getElementById('close-forward-modal').addEventListener('click', () => {
    dom.forwardModal.classList.add('hidden');
    state.forwardContent = null;
});
document.getElementById('fwd-tab-chats').onclick = () => loadForwardList('chats');
document.getElementById('fwd-tab-clubs').onclick = () => loadForwardList('clubs');