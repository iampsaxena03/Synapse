// ——— SYNAPSE v2.0 — AUTHENTICATION ———
import { auth, db, FieldValue } from './config.js';
import { state } from './state.js';
import { dom } from './dom.js';
import { showAuth, revealApp, setupModal, showToast } from './ui.js';
import { generateAvatar } from './utils.js';

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
    if (data.isBanned) {
        showToast('Account suspended by administrator', 'error');
        auth.signOut();
        setTimeout(() => window.location.reload(), 1500);
        return;
    }
    state.currentUser = user;
    updateMyProfileUI(data);
    revealApp();
    callback();
}

function updateMyProfileUI(data) {
    if (!data) return;
    document.getElementById('my-name').textContent = data.displayName || 'Me';
    document.getElementById('my-custom-id').textContent = '@' + (data.customId || 'user');
    document.getElementById('my-avatar').src = data.photoURL || generateAvatar(data.displayName || 'User');
}

// --- Auth Button ---
dom.authBtn.addEventListener('click', async () => {
    dom.error.textContent = '';
    dom.authBtn.disabled = true;
    dom.authBtn.innerHTML = '<div class="spinner"></div>';

    try {
        if (state.isLoginMode) {
            const login = document.getElementById('login-input').value.trim();
            const pass = document.getElementById('password').value.trim();
            if (!login || !pass) throw new Error('Enter your credentials');

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

            if (!email || !pass || !name || !uid) throw new Error('All fields are required');
            if (uid.length < 4) throw new Error('User ID must be 4+ characters');
            if (pass.length < 6) throw new Error('Password must be 6+ characters');

            const check = await db.collection('users').where('customId', '==', uid).limit(1).get();
            if (!check.empty) throw new Error('User ID already taken');

            const cred = await auth.createUserWithEmailAndPassword(email, pass);
            const avatar = generateAvatar(name);
            await cred.user.updateProfile({ displayName: name, photoURL: avatar });
            await db.collection('users').doc(cred.user.uid).set({
                uid: cred.user.uid, displayName: name, customId: uid, email, photoURL: avatar,
                bio: 'Hey there! I\'m on Synapse', location: 'Earth',
                isOnline: true, lastSeen: FieldValue.serverTimestamp()
            });
        }
    } catch (e) {
        let msg = e.message;
        // Friendlier error messages
        if (msg.includes('auth/wrong-password') || msg.includes('auth/invalid-credential')) msg = 'Invalid credentials';
        if (msg.includes('auth/user-not-found')) msg = 'Account not found';
        if (msg.includes('auth/email-already-in-use')) msg = 'Email already registered';
        if (msg.includes('auth/weak-password')) msg = 'Password too weak (6+ characters)';
        if (msg.includes('auth/invalid-email')) msg = 'Invalid email address';

        dom.error.textContent = msg;
        dom.authBtn.textContent = state.isLoginMode ? 'Sign In' : 'Create Account';
        dom.authBtn.disabled = false;
    }
});

// --- Toggle Login/Signup ---
dom.toggleBtn.addEventListener('click', () => {
    state.isLoginMode = !state.isLoginMode;
    dom.error.textContent = '';

    document.getElementById('signup-extra').classList.toggle('hidden', state.isLoginMode);
    document.getElementById('login-input-group').classList.toggle('hidden', !state.isLoginMode);
    document.getElementById('login-input').placeholder = state.isLoginMode ? 'Username or Email' : 'Username (Login)';

    dom.authBtn.textContent = state.isLoginMode ? 'Sign In' : 'Create Account';
    dom.toggleBtn.textContent = state.isLoginMode ? 'Create New Account' : 'Back to Sign In';
});

// --- Logout ---
document.getElementById('logout-btn').addEventListener('click', async () => {
    if (state.currentUser) {
        await db.collection('users').doc(state.currentUser.uid).update({
            isOnline: false, lastSeen: FieldValue.serverTimestamp()
        }).catch(() => {});
    }
    await auth.signOut();
    window.location.reload();
});

// --- Profile Modals ---
setupModal('my-profile-trigger', 'edit-profile-modal', 'close-edit-profile');

document.getElementById('my-profile-trigger').addEventListener('click', async () => {
    const doc = await db.collection('users').doc(state.currentUser.uid).get();
    const d = doc.data();
    document.getElementById('edit-avatar-preview').src = d.photoURL || generateAvatar(d.displayName);
    document.getElementById('edit-name').value = d.displayName;
    document.getElementById('edit-bio').value = d.bio || '';
    document.getElementById('edit-location').value = d.location || '';
});

document.getElementById('save-profile-btn').addEventListener('click', async () => {
    const name = document.getElementById('edit-name').value.trim();
    const bio = document.getElementById('edit-bio').value.trim();
    const loc = document.getElementById('edit-location').value.trim();

    if (!name) { showToast('Name cannot be empty', 'error'); return; }

    try {
        await db.collection('users').doc(state.currentUser.uid).update({ displayName: name, bio, location: loc });
        document.getElementById('my-name').textContent = name;
        document.getElementById('edit-profile-modal').classList.add('hidden');
        showToast('Profile updated', 'success');
    } catch (e) {
        showToast('Error saving profile', 'error');
    }
});