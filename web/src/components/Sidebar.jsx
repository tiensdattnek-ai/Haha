import React, { useState } from 'react';
import {
  Plus, MessageSquare, Trash2, Boxes, FlaskConical, Library, Cpu, Settings as Cog,
  LogOut, Globe, PanelLeftClose,
} from 'lucide-react';
import { useStore } from '../store';

const NAV = [
  ['chat', 'Chat', MessageSquare],
  ['skills', 'Instruments', Boxes],
  ['lab', 'Neural lab', FlaskConical],
  ['knowledge', 'Knowledge', Library],
  ['model', 'Model', Cpu],
];

export default function Sidebar() {
  const {
    conversations, conversationId, openConversation, removeConversation, newConversation,
    view, setView, user, logout, setSettingsOpen, webStatus, model, railOpen, setRail,
  } = useStore();
  const [confirm, setConfirm] = useState(null);

  const online = (webStatus?.providers || []).filter((p) => p.online).length;

  return (
    <aside className={`rail ${railOpen ? 'open' : ''}`}>
      <div className="rail-head">
        <div className="rail-mark">A</div>
        <div className="rail-brand grow">
          ATLAS
          <small>local research</small>
        </div>
        <button className="icon-btn" onClick={() => setRail(false)} title="Hide sidebar" style={{ display: 'none' }}>
          <PanelLeftClose size={15} />
        </button>
      </div>

      <div className="rail-actions">
        <button className="btn solid full" onClick={newConversation}>
          <Plus size={15} /> New chat
        </button>
      </div>

      <div className="rail-scroll">
        <div className="rail-label">Workspace</div>
        {NAV.map(([id, label, Icon]) => (
          <div key={id} className={`nav-item ${view === id ? 'on' : ''}`} onClick={() => setView(id)}>
            <Icon size={14} /> {label}
          </div>
        ))}

        <div className="rail-label">
          Chats <span className="mono" style={{ fontSize: 10 }}>{conversations.length}</span>
        </div>
        {conversations.map((c) => (
          <div
            key={c.id}
            className={`conv ${c.id === conversationId && view === 'chat' ? 'on' : ''}`}
            onClick={() => openConversation(c.id)}
            title={new Date(c.updatedAt).toLocaleString()}
          >
            <MessageSquare size={13} style={{ flex: 'none', color: 'var(--text-3)' }} />
            <span className="t">{c.title}</span>
            <button
              className="icon-btn x"
              style={{ width: 22, height: 22 }}
              onClick={(e) => {
                e.stopPropagation();
                if (confirm === c.id) { removeConversation(c.id); setConfirm(null); } else setConfirm(c.id);
              }}
              title={confirm === c.id ? 'Click again to delete' : 'Delete'}
            >
              <Trash2 size={12} style={confirm === c.id ? { color: 'var(--text-0)' } : undefined} />
            </button>
          </div>
        ))}
        {!conversations.length && <div className="empty" style={{ padding: '14px 10px', fontSize: 12 }}>No chats yet.</div>}
      </div>

      <div className="rail-foot">
        <div className="row" style={{ padding: '4px 10px 8px', gap: 8 }}>
          <span className="pill" title={`${online} live source(s) reachable`}>
            <i className={`dot ${online ? '' : 'off'}`} /> <Globe size={10} /> {online}
          </span>
          <span className="pill" title="model parameters">
            {model?.params ? `${(model.params / 1e6).toFixed(2)}M` : '—'}
          </span>
        </div>
        <div className="user-chip" onClick={() => setSettingsOpen(true)}>
          <div className="avatar-sq">{(user?.username || '?').slice(0, 1).toUpperCase()}</div>
          <div className="grow" style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.username}</div>
            <div className="dim" style={{ fontSize: 10.5 }}>local account</div>
          </div>
          <button className="icon-btn" style={{ width: 26, height: 26 }} onClick={(e) => { e.stopPropagation(); setSettingsOpen(true); }} title="Settings">
            <Cog size={14} />
          </button>
          <button className="icon-btn" style={{ width: 26, height: 26 }} onClick={(e) => { e.stopPropagation(); logout(); }} title="Sign out">
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}
