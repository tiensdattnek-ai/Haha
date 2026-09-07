import React, { useEffect } from 'react';
import { useStore } from './store';
import AuthGate from './components/AuthGate';
import Sidebar from './components/Sidebar';
import Drawer from './components/Drawer';
import Settings from './components/Settings';
import CommandPalette from './components/CommandPalette';
import ChatView from './views/ChatView';
import SkillsView from './views/SkillsView';
import LabView from './views/LabView';
import KnowledgeView from './views/KnowledgeView';
import ModelView from './views/ModelView';

export default function App() {
  const { user, booting, boot, view, settings, setDrawer, setSettingsOpen, setPalette, railOpen, setRail } = useStore();

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme || 'ink';
    boot();
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { setDrawer(null); setSettingsOpen(false); setPalette(false); setRail(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (booting) {
    return (
      <div className="auth">
        <div className="auth-grid" />
        <div className="row dim" style={{ fontSize: 13 }}><span className="spinner" /> starting…</div>
      </div>
    );
  }

  if (!user) return <AuthGate />;

  return (
    <>
      <div className="shell">
        <Sidebar />
        {view === 'chat' && <ChatView />}
        {view === 'skills' && <div className="main"><SkillsView /></div>}
        {view === 'lab' && <div className="main"><LabView /></div>}
        {view === 'knowledge' && <div className="main"><KnowledgeView /></div>}
        {view === 'model' && <div className="main"><ModelView /></div>}
      </div>
      {railOpen && <div className="drawer-backdrop" style={{ zIndex: 45 }} onClick={() => setRail(false)} />}
      <Drawer />
      <Settings />
      <CommandPalette />
    </>
  );
}
