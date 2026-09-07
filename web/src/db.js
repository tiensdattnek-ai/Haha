/**
 * db.js — everything the app remembers lives in the browser.
 *
 * IndexedDB stores users, conversations, messages and per-user settings.
 * Passwords never leave the device and are never stored: only a PBKDF2-SHA256
 * verifier (210k iterations, per-user random salt) is kept, which is the
 * current OWASP floor for that KDF.
 */

const DB_NAME = 'atlas';
const DB_VERSION = 1;
const ITERATIONS = 210_000;

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('users')) {
        const s = db.createObjectStore('users', { keyPath: 'id' });
        s.createIndex('byName', 'usernameLower', { unique: true });
      }
      if (!db.objectStoreNames.contains('conversations')) {
        const s = db.createObjectStore('conversations', { keyPath: 'id' });
        s.createIndex('byUser', 'userId');
        s.createIndex('byUpdated', 'updatedAt');
      }
      if (!db.objectStoreNames.contains('messages')) {
        const s = db.createObjectStore('messages', { keyPath: 'id' });
        s.createIndex('byConversation', 'conversationId');
      }
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const put = (store, value) => tx(store, 'readwrite', (s) => s.put(value));
const del = (store, key) => tx(store, 'readwrite', (s) => s.delete(key));
const get = (store, key) => tx(store, 'readonly', (s) => s.get(key));
const allByIndex = (store, index, key) => tx(store, 'readonly', (s) => s.index(index).getAll(key));
const all = (store) => tx(store, 'readonly', (s) => s.getAll());

/* --------------------------------- crypto --------------------------------- */

const enc = new TextEncoder();
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex) => new Uint8Array(hex.match(/.{2}/g).map((h) => parseInt(h, 16)));

async function derive(password, salt, iterations = ITERATIONS) {
  const base = await crypto.subtle.importKey('raw', enc.encode(String(password).normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, base, 256);
  return toHex(bits);
}

/** constant-time-ish string compare */
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ---------------------------------- auth ---------------------------------- */

export const auth = {
  async listUsers() {
    const users = await all('users');
    return users
      .sort((a, b) => (b.lastSeen || '').localeCompare(a.lastSeen || ''))
      .map((u) => ({ id: u.id, username: u.username, createdAt: u.createdAt, lastSeen: u.lastSeen }));
  },

  async register(username, password) {
    const name = String(username).trim();
    if (name.length < 2) throw new Error('Username needs at least 2 characters.');
    if (String(password).length < 6) throw new Error('Password needs at least 6 characters.');
    const users = await all('users');
    if (users.some((u) => u.usernameLower === name.toLowerCase())) {
      throw new Error('That username already exists on this device.');
    }
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const verifier = await derive(password, salt);
    const user = {
      id: crypto.randomUUID(),
      username: name,
      usernameLower: name.toLowerCase(),
      salt: toHex(salt),
      verifier,
      iterations: ITERATIONS,
      createdAt: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      settings: null,
    };
    await put('users', user);
    return { id: user.id, username: user.username, createdAt: user.createdAt };
  },

  async login(username, password) {
    const users = await all('users');
    const user = users.find((u) => u.usernameLower === String(username).trim().toLowerCase());
    if (!user) throw new Error('No account with that name on this device.');
    const verifier = await derive(password, fromHex(user.salt), user.iterations || ITERATIONS);
    if (!safeEqual(verifier, user.verifier)) throw new Error('Wrong password.');
    user.lastSeen = new Date().toISOString();
    await put('users', user);
    return { id: user.id, username: user.username, createdAt: user.createdAt, settings: user.settings };
  },

  async changePassword(userId, oldPassword, newPassword) {
    const user = await get('users', userId);
    if (!user) throw new Error('Account not found.');
    const check = await derive(oldPassword, fromHex(user.salt), user.iterations || ITERATIONS);
    if (!safeEqual(check, user.verifier)) throw new Error('Current password is wrong.');
    if (String(newPassword).length < 6) throw new Error('New password needs at least 6 characters.');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    user.salt = toHex(salt);
    user.verifier = await derive(newPassword, salt);
    user.iterations = ITERATIONS;
    await put('users', user);
    return true;
  },

  async saveSettings(userId, settings) {
    const user = await get('users', userId);
    if (!user) return;
    user.settings = settings;
    await put('users', user);
  },

  async deleteAccount(userId) {
    const convos = await allByIndex('conversations', 'byUser', userId);
    for (const c of convos) {
      const msgs = await allByIndex('messages', 'byConversation', c.id);
      for (const m of msgs) await del('messages', m.id);
      await del('conversations', c.id);
    }
    await del('users', userId);
  },
};

/* ------------------------------ conversations ------------------------------ */

export const store = {
  async listConversations(userId) {
    const rows = await allByIndex('conversations', 'byUser', userId);
    return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  async createConversation(userId, title = 'New chat') {
    const c = {
      id: crypto.randomUUID(),
      userId,
      title,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      count: 0,
    };
    await put('conversations', c);
    return c;
  },

  async renameConversation(id, title) {
    const c = await get('conversations', id);
    if (!c) return null;
    c.title = title;
    c.updatedAt = new Date().toISOString();
    await put('conversations', c);
    return c;
  },

  async touchConversation(id, patch = {}) {
    const c = await get('conversations', id);
    if (!c) return null;
    Object.assign(c, patch, { updatedAt: new Date().toISOString() });
    await put('conversations', c);
    return c;
  },

  async deleteConversation(id) {
    const msgs = await allByIndex('messages', 'byConversation', id);
    for (const m of msgs) await del('messages', m.id);
    await del('conversations', id);
  },

  async listMessages(conversationId) {
    const rows = await allByIndex('messages', 'byConversation', conversationId);
    return rows.sort((a, b) => a.seq - b.seq);
  },

  async saveMessage(msg) {
    await put('messages', msg);
    return msg;
  },

  async exportUser(userId) {
    const user = await get('users', userId);
    const convos = await allByIndex('conversations', 'byUser', userId);
    const out = { exportedAt: new Date().toISOString(), user: { username: user?.username, createdAt: user?.createdAt }, conversations: [] };
    for (const c of convos) {
      out.conversations.push({ ...c, messages: await store.listMessages(c.id) });
    }
    return out;
  },

  async wipeUser(userId) {
    const convos = await allByIndex('conversations', 'byUser', userId);
    for (const c of convos) await store.deleteConversation(c.id);
  },

  async usage() {
    if (!navigator.storage?.estimate) return null;
    const { usage, quota } = await navigator.storage.estimate();
    return { usage, quota, pct: quota ? usage / quota : 0 };
  },
};

/* -------------------------------- session --------------------------------- */

const SESSION_KEY = 'atlas.session';

export const session = {
  save(user, remember = true) {
    const payload = JSON.stringify({ id: user.id, username: user.username, at: Date.now() });
    (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, payload);
  },
  read() {
    for (const s of [localStorage, sessionStorage]) {
      const raw = s.getItem(SESSION_KEY);
      if (!raw) continue;
      try {
        const v = JSON.parse(raw);
        if (Date.now() - v.at < 1000 * 60 * 60 * 24 * 30) return v;
        s.removeItem(SESSION_KEY);
      } catch { s.removeItem(SESSION_KEY); }
    }
    return null;
  },
  clear() {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
  },
};

export { ITERATIONS };
