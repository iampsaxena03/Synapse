import { auth, db, FieldValue } from './config.js';
import { state } from './state.js';
import { dom } from './dom.js';
import { showAuth, revealApp, setupModal } from './ui.js';

export function setupAuthListener(onLoginSuccess, onLogoutCleanup) {
    auth.onAuthStateChanged(async user => {
        if (user) {
            const userRef = db.collection('users').doc(user.uid);
            try {
                const doc = await userRef.get();
                if (doc.exists) {
                    processLogin(user, doc.data(), onLoginSuccess);
                } else {
                    const unsub = userRef.onSnapshot(snap => {
                        if (snap.exists) {
                            unsub();
                            processLogin(user, snap.data(), onLoginSuccess);
                        }
                    });
                }
            } catch (e) {
                console.error(e);
                showAuth();
            }
        } else {
            onLogoutCleanup();
            showAuth();
        }
    });
}

function processLogin(user, data, callback) {
    // --- SECURITY CHECK ---
    if (data.isBanned) {
        alert("ACCESS DENIED: Your account has been suspended by the Administrator.");
        auth.signOut();
        window.location.reload();
        return;
    }
    // ----------------------

    state.currentUser = user;
    updateMyProfileUI(data);
    revealApp();
    callback();
}

function updateMyProfileUI(data) {
    if (!data) return;
    document.getElementById('my-name').textContent = data.displayName || 'Me';
    document.getElementById('my-custom-id').textContent = '@' + (data.customId || 'user');
    document.getElementById('my-avatar').src = data.photoURL || 'https://via.placeholder.com/50';
}

// --- AUTH EVENT LISTENERS ---
dom.authBtn.addEventListener('click', async () => {
    dom.error.textContent = '';
    dom.authBtn.textContent = 'Processing...';
    dom.authBtn.disabled = true;
    try {
        if (state.isLoginMode) {
            const login = document.getElementById('login-input').value.trim();
            const pass = document.getElementById('password').value.trim();
            if(!login || !pass) throw new Error('Enter credentials');
            let email = login;
            if (!login.includes('@')) {
                const q = await db.collection('users').where('customId', '==', login.toLowerCase()).limit(1).get();
                if (q.empty) throw new Error('Username not found');
                email = q.docs[0].data().email;
            }
            await auth.signInWithEmailAndPassword(email, pass);
        } else {
            const email = document.getElementById('signup-email').value.trim();
            const pass = document.getElementById('password').value.trim();
            const name = document.getElementById('full-name').value.trim();
            const uid = document.getElementById('custom-id').value.trim().toLowerCase();
            if (!email || !pass || !name || !uid) throw new Error('All fields required');
            if (uid.length < 4) throw new Error('User ID too short (4+)');
            const check = await db.collection('users').where('customId', '==', uid).limit(1).get();
            if (!check.empty) throw new Error('User ID taken');
            const cred = await auth.createUserWithEmailAndPassword(email, pass);
            const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff`;
            await cred.user.updateProfile({ displayName: name, photoURL: avatar });
            await db.collection('users').doc(cred.user.uid).set({
                uid: cred.user.uid, displayName: name, customId: uid, email, photoURL: avatar,
                bio: 'Hey there! I am using Synapse', location: 'Unknown',
                isOnline: true, lastSeen: FieldValue.serverTimestamp()
            });
        }
    } catch(e) {
        dom.error.textContent = e.message;
        dom.authBtn.textContent = state.isLoginMode ? 'Login' : 'Create Account';
        dom.authBtn.disabled = false;
    }
});

dom.toggleBtn.addEventListener('click', () => {
    state.isLoginMode = !state.isLoginMode;
    document.getElementById('signup-extra').classList.toggle('hidden', state.isLoginMode);
    document.getElementById('login-input').placeholder = state.isLoginMode ? "Username or Email" : "Username (Login)";
    document.getElementById('login-input').parentElement.classList.toggle('hidden', !state.isLoginMode);
    dom.authBtn.textContent = state.isLoginMode ? 'Login' : 'Create Account';
    dom.toggleBtn.textContent = state.isLoginMode ? 'Create New Account' : 'Back to Login';
});

document.getElementById('logout-btn').addEventListener('click', async () => {
    if(state.currentUser) {
        await db.collection('users').doc(state.currentUser.uid).update({ 
            isOnline: false, lastSeen: FieldValue.serverTimestamp() 
        }).catch(()=>{});
    }
    await auth.signOut();
    window.location.reload();
});

// Profile Modals
setupModal('my-profile-trigger', 'edit-profile-modal', 'close-edit-profile');

document.getElementById('my-profile-trigger').addEventListener('click', async () => {
    const doc = await db.collection('users').doc(state.currentUser.uid).get();
    const d = doc.data();
    document.getElementById('edit-avatar-preview').src = d.photoURL;
    document.getElementById('edit-name').value = d.displayName;
    document.getElementById('edit-bio').value = d.bio || '';
    document.getElementById('edit-location').value = d.location || '';
});

document.getElementById('save-profile-btn').addEventListener('click', async () => {
    const name = document.getElementById('edit-name').value;
    const bio = document.getElementById('edit-bio').value;
    const loc = document.getElementById('edit-location').value;
    await db.collection('users').doc(state.currentUser.uid).update({ displayName: name, bio, location: loc });
    document.getElementById('my-name').textContent = name;
    document.getElementById('edit-profile-modal').classList.add('hidden');
});