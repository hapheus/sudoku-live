import { getDefaultStorage, getStorageItem, setStorageItem } from '../utils/storage.js';

const VALID_GAME_ID_RE = /^[A-Za-z0-9_-]{6,64}$/;
const VALID_CLIENT_ID_RE = /^[A-Za-z0-9_-]{4,64}$/;
const CLIENT_ID_STORAGE_KEY = 'ttt_client_id';

export function isValidGameId(gameId) {
    return typeof gameId === 'string' && VALID_GAME_ID_RE.test(gameId);
}

function randomHex(byteCount) {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        const bytes = new Uint8Array(byteCount);
        crypto.getRandomValues(bytes);
        return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    }
    return Math.random().toString(36).substring(2, 2 + byteCount * 2);
}

export function generateGameId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `game_${randomHex(12)}`;
}

export function generateEventId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `evt_${Date.now().toString(36)}_${randomHex(6)}`;
}

export function getOrCreateClientId(storage = getDefaultStorage('session')) {
    const stored = getStorageItem(CLIENT_ID_STORAGE_KEY, null, storage);
    if (stored && VALID_CLIENT_ID_RE.test(stored)) {
        return stored;
    }
    const clientId = `client_${randomHex(8)}`;
    setStorageItem(CLIENT_ID_STORAGE_KEY, clientId, storage);
    return clientId;
}

export function resolveRuntimeWsConfig(explicitConfig = {}) {
    const runtime = typeof window !== 'undefined' && window.__APP_CONFIG__ ? window.__APP_CONFIG__ : {};
    const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};

    return {
        wsUrl: explicitConfig.wsUrl || runtime.wsUrl || env.VITE_WS_URL || '',
        host: explicitConfig.host || runtime.wsHost || env.VITE_WS_HOST || '',
        port: explicitConfig.port || runtime.wsPort || env.VITE_WS_PORT || '',
        scheme: explicitConfig.scheme || runtime.wsScheme || env.VITE_WS_SCHEME || '',
        token: explicitConfig.token || '',
        getToken: explicitConfig.getToken || null,
    };
}

export function isLocalDevHostname(hostname) {
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

export function enforceSecureWsUrl(rawUrl) {
    if (typeof rawUrl !== 'string' || rawUrl.trim() === '') return '';
    const trimmed = rawUrl.trim();
    try {
        const parsed = new URL(trimmed);
        if (parsed.protocol === 'ws:' && !isLocalDevHostname(parsed.hostname)) {
            parsed.protocol = 'wss:';
            return parsed.toString();
        }
        return trimmed;
    } catch {
        return trimmed;
    }
}

export function buildWsUrl(wsConfig = {}) {
    if (typeof wsConfig.wsUrl === 'string' && wsConfig.wsUrl.trim() !== '') {
        return enforceSecureWsUrl(wsConfig.wsUrl);
    }

    const browser = typeof window === 'undefined' ? null : window;
    const browserProtocol = browser?.location?.protocol || 'http:';
    const browserHostname = browser?.location?.hostname || 'localhost';
    const isNativeCapacitor = Boolean(browser?.Capacitor?.isNativePlatform?.());

    if (isNativeCapacitor && !wsConfig.host && !wsConfig.scheme && !wsConfig.port) {
        return 'wss://sudoku-ws.fraha.dev/connection/websocket';
    }

    let host = wsConfig.host;
    if (!host || isLocalDevHostname(host)) {
        if (!isLocalDevHostname(browserHostname) && browserHostname.startsWith('sudoku.')) {
            host = `sudoku-ws.${browserHostname.slice('sudoku.'.length)}`;
        } else {
            host = browserHostname || 'localhost';
        }
    }

    const isLocalTarget = isLocalDevHostname(host);
    const wantsHttps = wsConfig.scheme
        ? wsConfig.scheme === 'https'
        : browserProtocol === 'https:';
    const isHttps = !isLocalTarget || wantsHttps || isNativeCapacitor;
    const wsScheme = isHttps ? 'wss' : 'ws';

    let defaultPort = isHttps ? 443 : 80;
    if (isLocalTarget) defaultPort = 8081;
    const port = parseInt(wsConfig.port || defaultPort, 10);
    const omitPort = Number.isNaN(port) || (isHttps && port === 443) || (!isHttps && port === 80);
    const portSuffix = omitPort ? '' : `:${port}`;

    return `${wsScheme}://${host}${portSuffix}/connection/websocket`;
}
