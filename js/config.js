// --- CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyDGEL8DUQxHXxSoM5RLv4MKi6KfmEqU1R0",
    authDomain: "private-chat-app-320d3.firebaseapp.com",
    projectId: "private-chat-app-320d3",
    storageBucket: "private-chat-app-320d3.firebasestorage.app",
    messagingSenderId: "462500419302",
    appId: "1:462500419302:web:639976e4d0eceac4a88d27"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

export const auth = firebase.auth();
export const db = firebase.firestore();
export const FieldValue = firebase.firestore.FieldValue;

db.enablePersistence({ synchronizeTabs: true }).catch(err => console.log("Persistence:", err.code));