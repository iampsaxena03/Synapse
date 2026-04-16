// ——— SYNAPSE v2.0 — UTILITIES ———

// --- HTML Escaping ---
export const escapeHtml = (text) => {
    if (!text) return '';
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
};

// --- Timestamp Helpers ---
export const getSafeDate = (timestamp) => {
    if (!timestamp) return new Date();
    if (timestamp.toDate) return timestamp.toDate();
    if (timestamp instanceof Date) return timestamp;
    if (typeof timestamp === 'number') return new Date(timestamp);
    if (typeof timestamp === 'string') return new Date(timestamp);
    return new Date();
};

export const getFriendlyDate = (date) => {
    if (!date) return '';
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

// --- Relative Time (NEW) ---
export const getRelativeTime = (date) => {
    if (!date) return '';
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    if (diff < 10) return 'now';
    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    if (diff < 172800) return 'Yesterday';
    if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

// --- Haptic Feedback ---
export const triggerHaptic = () => {
    const enabled = localStorage.getItem('synapse_vibrate') !== 'false';
    if (enabled && navigator.vibrate) navigator.vibrate(30);
};

// --- Inline SVG Avatar Generator (NEW) ---
export const generateAvatar = (name) => {
    if (!name) name = '?';
    const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    // Generate deterministic color from name
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    const color = `hsl(${hue}, 65%, 55%)`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
        <rect width="100" height="100" rx="50" fill="${color}"/>
        <text x="50" y="53" font-size="38" text-anchor="middle" dominant-baseline="central" fill="white" font-family="Inter,sans-serif" font-weight="600">${initials}</text>
    </svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

// --- Sound Effects (Web Audio API) (NEW) ---
let audioCtx = null;
const getAudioCtx = () => {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
};

export const playSound = (type) => {
    const enabled = localStorage.getItem('synapse_sound') !== 'false';
    if (!enabled) return;
    try {
        const ctx = getAudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);

        if (type === 'send') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(600, ctx.currentTime);
            osc.frequency.linearRampToValueAtTime(900, ctx.currentTime + 0.08);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.15);
        } else if (type === 'receive') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(500, ctx.currentTime);
            osc.frequency.linearRampToValueAtTime(400, ctx.currentTime + 0.1);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.18);
        }
    } catch (e) { /* Audio not supported */ }
};

// --- Link Detection (NEW) ---
const URL_REGEX = /https?:\/\/[^\s<>"']+/gi;

export const linkifyText = (text) => {
    if (!text) return '';
    return escapeHtml(text).replace(URL_REGEX, (url) => {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="msg-link" onclick="event.stopPropagation()">${url}</a>`;
    });
};