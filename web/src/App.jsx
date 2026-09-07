import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  MessagesSquare, Boxes, FlaskConical, Library, Cpu, Sun, Moon,
  PanelRightClose, PanelRightOpen, Command, Plus, Trash2, Sparkles, FileDown,
} from 'lucide-react';
import { useStore } from './store';
import ConsoleView from './views/ConsoleView';
import SkillsView from './views/SkillsView';
import LabView from './views/LabView';
import KnowledgeView from './views/KnowledgeView';
import ModelView from './views/ModelView';
import Inspector from './components/Inspector';
import CommandPalette from './components/CommandPalette';

const TABS = [
  ['console', 'Console', MessagesSquare],
  ['skills', 'Skill Atlas', Boxes],
  ['lab', 'Neural Lab', FlaskConical],
  ['knowledge', 'Knowledge', Library],
  ['model', 'Model', Cpu],
];

export default function App() {
  const {
    view, setView, theme, setTheme, inspectorOpen, toggleInspector,
    bootstrap, health, model, setPalette, messages, clearChat, send, skills,
    sessions, sessionId, openSession, deleteSession,
  } = useStore();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    bootstrap();
    const t = setInterval(() => useStore.getState().bootstrap(), 60000);
    return () => clearInterval(t);
  }, []);

  const statusClass = !health?.ok ? 'err' : model?.status === 'ready' ? '' : 'warn';

  const exportSession = () => {
    if (!messages.length) return;
    const head = `# ATLAS investigation\n\n_Exported ${new Date().toISOString()} · ATLAS-R1 ${model?.params ? `${model.params.toLocaleString()} params` : ''} · ${skills.total} instruments_\n\n---\n\n`;
    const body = messages.map((m) => (m.role === 'user'
      ? `## ❯ ${m.content}\n`
      : `${m.content}\n\n${m.trace?.done ? `<sub>${m.trace.done.ms} ms · confidence ${(m.trace.done.confidence * 100).toFixed(0)}% · instruments: ${(m.trace.done.skills || []).join(', ') || 'none'}</sub>\n` : ''}`)).join('\n---\n\n');
    const blob = new Blob([head + body], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `atlas-investigation-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.md`;
    a.click();
  };

  return (
    <>
      <div className="aurora" />
      <div className="grid-overlay" />
      <div className={`shell ${inspectorOpen && view === 'console' ? '' : 'no-inspector'}`}>
        <header className="topbar">
          <div className="brand">
            <div className="mark"><Sparkles size={14} /></div>
            ATLAS <small>research console</small>
          </div>
          <nav className="tabs">
            {TABS.map(([id, label, Icon]) => (
              <button key={id} className={`tab ${view === id ? 'active' : ''}`} onClick={() => setView(id)}>
                <Icon size={14} /> <span>{label}</span>
              </button>
            ))}
          </nav>
          <div className="topbar-right">
            <span className={`pill ${statusClass === '' ? 'live' : ''}`} title={`runtime: ${model?.status || 'unknown'}`}>
              <i className={`dot ${statusClass}`} />
              {model?.params ? `${(model.params / 1e6).toFixed(2)}M params` : health?.ok ? 'no checkpoint' : 'offline'}
            </span>
            <span className="pill" title="deterministic research instruments">{skills.total || 0} skills</span>
            <button className="icon-btn" title="Export this investigation as Markdown" onClick={exportSession} disabled={!messages.length}><FileDown size={15} /></button>
            <button className="icon-btn" title="Command palette (⌘K)" onClick={() => setPalette(true)}><Command size={15} /></button>
            <button className="icon-btn" title="Toggle theme" onClick={() => setTheme(theme === 'obsidian' ? 'daylight' : 'obsidian')}>
              {theme === 'obsidian' ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            {view === 'console' && (
              <button className="icon-btn" title="Toggle inspector" onClick={toggleInspector}>
                {inspectorOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
              </button>
            )}
          </div>
        </header>

        <aside className="rail">
          <div className="rail-section">
            <button className="btn primary full" onClick={() => { clearChat(); setView('console'); }}>
              <Plus size={14} /> New investigation
            </button>
          </div>
          <div className="rail-scroll">
            <div className="rail-section">
              <div className="rail-title">Investigations <span>{sessions.length}</span></div>
              {sessions.slice(0, 24).map((s) => (
                <div
                  className={`session-item ${s.id === sessionId ? 'active' : ''}`}
                  key={s.id}
                  onClick={() => openSession(s.id)}
                  title={`${s.messages} messages · ${new Date(s.updatedAt).toLocaleString()}`}
                >
                  <MessagesSquare size={13} style={{ flex: 'none', color: s.id === sessionId ? 'var(--accent)' : 'var(--text-3)' }} />
                  <span className="t">{s.title}</span>
                  <button
                    className="meta"
                    style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer' }}
                    onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
                    title="Delete"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
              {!sessions.length && <div className="empty" style={{ padding: '14px 6px', fontSize: 12 }}>No saved investigations yet.</div>}
            </div>

            <div className="rail-section">
              <div className="rail-title">Quick instruments</div>
              {['research.plan', 'stats.power', 'stats.ttest', 'text.summarize', 'lit.cite', 'model.card'].map((id) => (
                <div className="session-item" key={id} onClick={() => { setView('console'); send(`/${id} `); }}>
                  <Boxes size={13} style={{ flex: 'none', color: 'var(--accent)' }} />
                  <span className="t mono" style={{ fontSize: 12 }}>{id}</span>
                </div>
              ))}
            </div>

            <div className="rail-section">
              <div className="rail-title">System</div>
              <div className="panel">
                <div className="panel-body" style={{ padding: '10px 12px' }}>
                  <div className="kv"><span className="k">runtime</span><span className="v">{model?.status || '—'}</span></div>
                  <div className="kv"><span className="k">params</span><span className="v">{model?.params ? model.params.toLocaleString() : '—'}</span></div>
                  <div className="kv"><span className="k">ppl</span><span className="v">{model?.meta?.perplexity ? model.meta.perplexity.toFixed(1) : '—'}</span></div>
                  <div className="kv"><span className="k">passages</span><span className="v">{model?.passages ?? '—'}</span></div>
                  <div className="kv"><span className="k">memory</span><span className="v">{health?.memoryMB ? `${health.memoryMB}MB` : '—'}</span></div>
                </div>
              </div>
            </div>

            {messages.length > 0 && (
              <div className="rail-section">
                <button className="btn ghost full sm" onClick={clearChat}><Trash2 size={12} /> Clear conversation</button>
              </div>
            )}
          </div>
        </aside>

        <AnimatePresence mode="wait">
          <motion.main
            key={view}
            className="main"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            style={{ display: 'flex' }}
          >
            {view === 'console' && <ConsoleView />}
            {view === 'skills' && <SkillsView />}
            {view === 'lab' && <LabView />}
            {view === 'knowledge' && <KnowledgeView />}
            {view === 'model' && <ModelView />}
          </motion.main>
        </AnimatePresence>

        {view === 'console' && inspectorOpen && <Inspector />}
      </div>
      <CommandPalette />
    </>
  );
}
