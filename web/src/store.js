import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api, chatStream } from './api';

const DEFAULT_SETTINGS = {
  temperature: 0.85,
  topK: 40,
  topP: 0.92,
  repetitionPenalty: 1.15,
  maxTokens: 90,
  seed: 42,
  neural: true,
  retrieval: true,
  maxSkills: 3,
};

const emptyTrace = () => ({
  phases: [], plan: [], analysis: null, sources: [], skills: [], neural: null, done: null, warnings: [],
});

/** Immutably fold one SSE event into an assistant message. */
function apply(m, ev) {
  if (ev.type === 'delta') return { ...m, content: m.content + ev.text };
  const t = { ...m.trace };
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
    case 'neural': t.neural = ev; break;
    case 'warning':
    case 'error': t.warnings = [...t.warnings, ev.message]; break;
    case 'done': t.done = ev; break;
    default: break;
  }
  return { ...m, trace: t };
}

/** Rebuild a render-ready trace from persisted events. */
function traceFromEvents(events) {
  const t = emptyTrace();
  for (const ev of events) {
    if (ev.type === 'analysis') t.analysis = ev;
    else if (ev.type === 'plan') t.plan = ev.steps || [];
    else if (ev.type === 'sources') t.sources = ev.sources || [];
    else if (ev.type === 'skill_result') t.skills.push({ ...ev, status: ev.ok ? 'done' : 'error' });
    else if (ev.type === 'neural') t.neural = ev;
    else if (ev.type === 'done') {
      t.done = ev;
      t.phases = ['understand', 'plan', 'retrieve', 'execute', 'synthesize', 'critique'].map((p) => ({ phase: p, label: p }));
    }
  }
  return t;
}

export const useStore = create(persist((set, get) => ({
  /* ---------------------------------- ui ---------------------------------- */
  view: 'console',
  theme: 'obsidian',
  inspectorOpen: true,
  inspectorTab: 'trace',
  paletteOpen: false,
  mode: 'deep',
  settings: DEFAULT_SETTINGS,

  setView: (view) => set({ view }),
  setTheme: (theme) => {
    document.documentElement.dataset.theme = theme;
    set({ theme });
  },
  toggleInspector: () => set((s) => ({ inspectorOpen: !s.inspectorOpen })),
  setInspectorTab: (inspectorTab) => set({ inspectorTab, inspectorOpen: true }),
  setPalette: (paletteOpen) => set({ paletteOpen }),
  setMode: (mode) => set({ mode }),
  patchSettings: (p) => set((s) => ({ settings: { ...s.settings, ...p } })),
  resetSettings: () => set({ settings: DEFAULT_SETTINGS }),

  /* -------------------------------- server -------------------------------- */
  health: null,
  model: null,
  skills: { total: 0, categories: [] },
  knowledge: null,

  bootstrap: async () => {
    try {
      const [health, model, skills] = await Promise.all([api.health(), api.model(), api.skills()]);
      set({ health, model, skills });
    } catch (e) {
      set({ health: { ok: false, error: e.message } });
    }
    api.knowledge().then((knowledge) => set({ knowledge })).catch(() => {});
    get().loadSessions();
  },
  refreshModel: async () => {
    try { set({ model: await api.model() }); } catch { /* noop */ }
  },

  /* ------------------------------ conversation ---------------------------- */
  sessions: [],
  sessionId: null,
  messages: [],
  streaming: false,
  abortCtl: null,
  liveTrace: null,

  clearChat: () => set({ messages: [], liveTrace: null, sessionId: null }),

  loadSessions: async () => {
    try { set({ sessions: (await api.sessions()).sessions }); } catch { /* offline */ }
  },

  openSession: async (id) => {
    try {
      const s = await api.getSession(id);
      const messages = [];
      for (const m of s.messages) {
        if (m.role === 'user') messages.push({ id: crypto.randomUUID(), role: 'user', content: m.content });
        else messages.push({ id: crypto.randomUUID(), role: 'assistant', content: m.content, trace: traceFromEvents(m.events || []) });
      }
      set({ messages, sessionId: id, view: 'console', liveTrace: messages[messages.length - 1]?.trace || null });
    } catch (e) {
      console.warn('session load failed', e);
    }
  },

  deleteSession: async (id) => {
    try { await api.deleteSession(id); } catch { /* noop */ }
    set((st) => ({
      sessions: st.sessions.filter((x) => x.id !== id),
      ...(st.sessionId === id ? { messages: [], sessionId: null, liveTrace: null } : {}),
    }));
  },

  stop: () => {
    const c = get().abortCtl;
    if (c) c.abort();
    set({ streaming: false, abortCtl: null });
  },

  send: async (text) => {
    const content = String(text || '').trim();
    if (!content || get().streaming) return;
    let sessionId = get().sessionId;
    if (!sessionId) {
      try {
        const s = await api.createSession(content.slice(0, 60));
        sessionId = s.id;
        set({ sessionId });
      } catch { /* server offline — continue without persistence */ }
    }
    const id = crypto.randomUUID();
    const trace = emptyTrace();
    set((s) => ({
      messages: [
        ...s.messages,
        { id: `${id}-u`, role: 'user', content },
        { id, role: 'assistant', content: '', trace, streaming: true },
      ],
      streaming: true,
      liveTrace: trace,
      inspectorTab: 'trace',
    }));

    const ctl = new AbortController();
    set({ abortCtl: ctl });

    const push = (ev) => set((s) => {
      let updated = null;
      const messages = s.messages.map((m) => {
        if (m.id !== id) return m;
        updated = apply(m, ev);
        return updated;
      });
      return { messages, liveTrace: updated ? updated.trace : s.liveTrace };
    });

    try {
      await chatStream({ message: content, mode: get().mode, settings: get().settings, sessionId }, push, ctl.signal);
    } catch (e) {
      if (e.name !== 'AbortError') push({ type: 'delta', text: `\n\n> ⚠️ ${e.message}` });
    } finally {
      set((s) => ({
        messages: s.messages.map((m) => (m.id === id ? { ...m, streaming: false } : m)),
        streaming: false,
        abortCtl: null,
      }));
      get().refreshModel();
      get().loadSessions();
    }
  },
}), {
  name: 'atlas-console',
  partialize: (s) => ({ theme: s.theme, settings: s.settings, mode: s.mode, inspectorOpen: s.inspectorOpen, sessionId: s.sessionId }),
}));
