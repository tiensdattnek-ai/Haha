/**
 * sessions.js — lightweight persistent session store (JSON on disk, debounced).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = path.join(ROOT, 'data/runtime');
const FILE = path.join(DIR, 'sessions.json');

export class SessionStore {
  constructor() {
    this.sessions = new Map();
    this.timer = null;
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(FILE)) {
        const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
        for (const s of raw.sessions || []) this.sessions.set(s.id, s);
      }
    } catch (e) {
      console.warn('[sessions] load failed:', e.message);
    }
  }

  persist() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      try {
        fs.mkdirSync(DIR, { recursive: true });
        fs.writeFileSync(FILE, JSON.stringify({ sessions: [...this.sessions.values()].slice(-100) }));
      } catch (e) {
        console.warn('[sessions] persist failed:', e.message);
      }
    }, 400);
  }

  list() {
    return [...this.sessions.values()]
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .map((s) => ({ id: s.id, title: s.title, createdAt: s.createdAt, updatedAt: s.updatedAt, messages: s.messages.length }));
  }

  create(title = 'New investigation') {
    const s = {
      id: crypto.randomUUID(),
      title,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
    };
    this.sessions.set(s.id, s);
    this.persist();
    return s;
  }

  get(id) {
    return this.sessions.get(id);
  }

  append(id, message) {
    const s = this.sessions.get(id) || this.create();
    s.messages.push({ ...message, at: new Date().toISOString() });
    if (s.messages.length === 1 && message.role === 'user') {
      s.title = String(message.content).replace(/\s+/g, ' ').slice(0, 60) || s.title;
    }
    s.updatedAt = new Date().toISOString();
    this.persist();
    return s;
  }

  rename(id, title) {
    const s = this.sessions.get(id);
    if (s) {
      s.title = title;
      s.updatedAt = new Date().toISOString();
      this.persist();
    }
    return s;
  }

  remove(id) {
    const ok = this.sessions.delete(id);
    this.persist();
    return ok;
  }
}

export const sessions = new SessionStore();
