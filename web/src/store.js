import { create } from 'zustand';
import { api, chatStream } from './api';
import { auth, store as db, session } from './db';

export const DEFAULT_SETTINGS = {
  // decoding
  temperature: 0.8,
  topK: 40,
  topP: 0.92,
  repetitionPenalty: 1.15,
  maxTokens: 90,
  seed: 42,
  // pipeline
  neural: true,
  retrieval: true,
  web: true,
  webResults: 6,
  webDocs: 2,
  maxSkills: 3,
  // ui
  theme: 'ink',
  density: 'comfortable',
  showTrace: true,
};

const emptyTrace = () => ({
  phases: [], plan: [], analysis: null, sources: [], skills: [], neural: null,
  done: null, warnings: [], web: { plan: null, providers: [], searches: [], results: [], documents: [] },
});

function apply(m, ev) {
  if (ev.type === 'delta') return { ...m, content: m.content + ev.text };
  const t = { ...m.trace, web: { ...m.trace.web } };
  switch (ev.type) {
    case 'phase':
      t.phases = [...t.phases.filter((p) => p.phase !== ev.phase), { phase: ev.phase, label: ev.label, t: ev.t }];
      break;
    case 'plan': t.plan = ev.steps; break;
    case 'analysis': t.analysis = ev; break;
    case 'sources': t.sources = ev.sources; break;
    case 'skill_start': t.skills = [...t.skills, { ...ev, status: 'running' }]; break;
    case 'skill_result': {
      const i = t.skills.findIndex((s) => s.id === ev.id && s.status === 'running');
      const rec = { ...(i >= 0 ? t.skills[i] : {}), ...ev, status: ev.ok ? 'done' : 'error' };
      t.skills = i >= 0 ? t.skills.map((s, j) => (j === i ? rec : s)) : [...t.skills, rec];
      break;
    }
    case 'web_plan': t.web.plan = ev; break;
    case 'web_providers': t.web.providers = ev.providers; break;
    case 'web_search': t.web.searches = [...t.web.searches, ev]; break;
    case 'web_results': t.web.results = ev.results; break;
    case 'web_document': t.web.documents = [...t.web.documents, ev]; break;
    case 'web_unavailable': t.warnings = [...t.warnings, 'No live source is reachable from this machine — answering from local knowledge only.']; break;
    case 'neural': t.neural = ev; break;
    case 'warning':
    case 'error': t.warnings = [...t.warnings, ev.message]; break;
    case 'done': t.done = ev; break;
    default: break;
  }
  return { ...m, trace: t };
}

export const useStore = create((set, get) => ({
  /* --------------------------------- auth --------------------------------- */
  user: null,
  booting: true,
  accounts: [],

  boot: async () => {
    try {
      const accounts = await auth.listUsers();
      set({ accounts });
      const s = session.read();
      if (s) {
        const found = accounts.find((a) => a.id === s.id);
        if (found) {
          set({ user: { id: found.id, username: found.username } });
          await get().afterLogin();
        }
      }
    } catch (e) {
      console.warn('boot failed', e);
    } finally {
      set({ booting: false });
      get().loadServer();
    }
  },

  register: async (username, password, remember) => {
    const user = await auth.register(username, password);
    session.save(user, remember);
    set({ user, accounts: await auth.listUsers() });
    await get().afterLogin();
    return user;
  },

  login: async (username, password, remember) => {
    const user = await auth.login(username, password);
    session.save(user, remember);
    if (user.settings) set({ settings: { ...DEFAULT_SETTINGS, ...user.settings } });
    set({ user: { id: user.id, username: user.username }, accounts: await auth.listUsers() });
    await get().afterLogin();
    return user;
  },

  logout: () => {
    session.clear();
    set({ user: null, conversations: [], messages: [], conversationId: null, liveTrace: null });
  },

  afterLogin: async () => {
    const { user } = get();
    if (!user) return;
    const conversations = await db.listConversations(user.id);
    set({ conversations });
    document.documentElement.dataset.theme = get().settings.theme;
    if (conversations.length) await get().openConversation(conversations[0].id);
    else set({ conversationId: null, messages: [] });
  },

  /* ------------------------------- settings ------------------------------- */
  settings: DEFAULT_SETTINGS,
  patchSettings: (p) => {
    const settings = { ...get().settings, ...p };
    set({ settings });
    if (p.theme) document.documentElement.dataset.theme = p.theme;
    const u = get().user;
    if (u) auth.saveSettings(u.id, settings).catch(() => {});
  },
  resetSettings: () => get().patchSettings(DEFAULT_SETTINGS),

  /* -------------------------------- server -------------------------------- */
  health: null,
  model: null,
  skills: { total: 0, categories: [] },
  webStatus: null,
  knowledge: null,

  loadServer: async () => {
    try {
      const [health, model, skills] = await Promise.all([api.health(), api.model(), api.skills()]);
      set({ health, model, skills });
    } catch (e) {
      set({ health: { ok: false, error: e.message } });
    }
    api.webStatus().then((webStatus) => set({ webStatus })).catch(() => {});
    api.knowledge().then((knowledge) => set({ knowledge })).catch(() => {});
  },
  refreshModel: async () => { try { set({ model: await api.model() }); } catch { /* noop */ } },

  /* ------------------------------- ui state ------------------------------- */
  view: 'chat',
  railOpen: false,
  drawer: null,          // null | 'sources' | 'trace' | 'skills' | 'web'
  paletteOpen: false,
  settingsOpen: false,
  mode: 'research',      // chat | research | code

  setView: (view) => set({ view, drawer: null }),
  setRail: (railOpen) => set({ railOpen }),
  setDrawer: (drawer) => set({ drawer }),
  setPalette: (paletteOpen) => set({ paletteOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setMode: (mode) => set({ mode }),

  /* ----------------------------- conversations ---------------------------- */
  conversations: [],
  conversationId: null,
  messages: [],
  streaming: false,
  abortCtl: null,
  liveTrace: null,

  newConversation: async () => {
    set({ conversationId: null, messages: [], liveTrace: null, view: 'chat', drawer: null });
  },

  openConversation: async (id) => {
    const rows = await db.listMessages(id);
    set({
      conversationId: id,
      view: 'chat',
      messages: rows.map((m) => ({
        id: m.id, role: m.role, content: m.content, trace: m.trace || emptyTrace(), streaming: false,
      })),
      liveTrace: rows.length ? rows[rows.length - 1].trace : null,
      railOpen: false,
    });
  },

  removeConversation: async (id) => {
    await db.deleteConversation(id);
    const { user, conversationId } = get();
    const conversations = await db.listConversations(user.id);
    set({ conversations });
    if (conversationId === id) set({ conversationId: null, messages: [], liveTrace: null });
  },

  renameConversation: async (id, title) => {
    await db.renameConversation(id, title);
    set({ conversations: await db.listConversations(get().user.id) });
  },

  stop: () => {
    get().abortCtl?.abort();
    set({ streaming: false, abortCtl: null });
  },

  send: async (text, overrides = {}) => {
    const content = String(text || '').trim();
    const { user, streaming } = get();
    if (!content || streaming || !user) return;

    // ensure a conversation exists
    let { conversationId } = get();
    if (!conversationId) {
      const c = await db.createConversation(user.id, content.replace(/\s+/g, ' ').slice(0, 64));
      conversationId = c.id;
      set({ conversationId, conversations: [c, ...get().conversations] });
    }

    const seqBase = get().messages.length;
    const userMsg = { id: crypto.randomUUID(), role: 'user', content, streaming: false, trace: null };
    const aiId = crypto.randomUUID();
    const trace = emptyTrace();
    set({
      messages: [...get().messages, userMsg, { id: aiId, role: 'assistant', content: '', trace, streaming: true }],
      streaming: true,
      liveTrace: trace,
    });
    db.saveMessage({ id: userMsg.id, conversationId, role: 'user', content, seq: seqBase, at: new Date().toISOString() });

    const ctl = new AbortController();
    set({ abortCtl: ctl });

    const push = (ev) => set((s) => {
      let updated = null;
      const messages = s.messages.map((m) => {
        if (m.id !== aiId) return m;
        updated = apply(m, ev);
        return updated;
      });
      return { messages, liveTrace: updated ? updated.trace : s.liveTrace };
    });

    const mode = overrides.mode || get().mode;
    const settings = { ...get().settings, ...overrides.settings };
    const agentMode = mode === 'chat' ? 'fast' : 'deep';
    const payload = {
      message: content,
      mode: agentMode,
      settings: {
        ...settings,
        web: mode === 'chat' ? false : settings.web,
        maxSkills: mode === 'code' ? 2 : settings.maxSkills,
      },
    };

    try {
      await chatStream(payload, push, ctl.signal);
    } catch (e) {
      if (e.name !== 'AbortError') push({ type: 'delta', text: `\n\n> ⚠️ ${e.message}` });
    } finally {
      const final = get().messages.find((m) => m.id === aiId);
      set((s) => ({
        messages: s.messages.map((m) => (m.id === aiId ? { ...m, streaming: false } : m)),
        streaming: false,
        abortCtl: null,
      }));
      if (final) {
        await db.saveMessage({
          id: aiId, conversationId, role: 'assistant', content: final.content,
          trace: final.trace, seq: seqBase + 1, at: new Date().toISOString(), mode,
        });
        await db.touchConversation(conversationId, { count: seqBase + 2 });
        set({ conversations: await db.listConversations(user.id) });
      }
      get().refreshModel();
    }
  },

  regenerate: async () => {
    const { messages } = get();
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;
    set({ messages: messages.slice(0, messages.findIndex((m) => m.id === lastUser.id)) });
    await get().send(lastUser.content);
  },
}));
