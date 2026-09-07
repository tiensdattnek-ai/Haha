import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, CornerDownLeft } from 'lucide-react';
import { useStore } from '../store';

export default function CommandPalette() {
  const {
    paletteOpen, setPalette, skills, setView, send, patchSettings, settings,
    setSettingsOpen, newConversation, setMode, setDrawer,
  } = useStore();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);

  const items = useMemo(() => {
    const base = [
      { id: 'new', label: 'New chat', hint: 'chat', run: () => newConversation() },
      { id: 'mode:chat', label: 'Mode → Chat (fast)', hint: 'mode', run: () => setMode('chat') },
      { id: 'mode:research', label: 'Mode → Research (deep)', hint: 'mode', run: () => setMode('research') },
      { id: 'mode:code', label: 'Mode → Code', hint: 'mode', run: () => setMode('code') },
      { id: 'web', label: `Live web search: turn ${settings.web ? 'off' : 'on'}`, hint: 'toggle', run: () => patchSettings({ web: !settings.web }) },
      { id: 'neural', label: `Neural synthesis: turn ${settings.neural ? 'off' : 'on'}`, hint: 'toggle', run: () => patchSettings({ neural: !settings.neural }) },
      { id: 'theme', label: `Theme → ${settings.theme === 'ink' ? 'Paper' : 'Ink'}`, hint: 'ui', run: () => patchSettings({ theme: settings.theme === 'ink' ? 'paper' : 'ink' }) },
      { id: 'settings', label: 'Open settings', hint: 'ui', run: () => setSettingsOpen(true) },
      { id: 'details', label: 'Open answer details', hint: 'ui', run: () => setDrawer('trace') },
      { id: 'v:skills', label: 'Go to Instruments', hint: 'view', run: () => setView('skills') },
      { id: 'v:lab', label: 'Go to Neural lab', hint: 'view', run: () => setView('lab') },
      { id: 'v:knowledge', label: 'Go to Knowledge', hint: 'view', run: () => setView('knowledge') },
      { id: 'v:model', label: 'Go to Model', hint: 'view', run: () => setView('model') },
      { id: 'help', label: 'List every instrument', hint: '/help', run: () => { setView('chat'); send('/help'); } },
      { id: 'card', label: 'Show the model card', hint: '/model.card', run: () => { setView('chat'); send('/model.card'); } },
      { id: 'search', label: 'Live web search…', hint: '/web', run: () => { setView('chat'); send('/web latest javascript testing frameworks'); } },
    ];
    const skillItems = (skills.categories || []).flatMap((c) => c.skills.map((s) => ({
      id: `s:${s.id}`,
      label: s.name,
      hint: `/${s.id}`,
      run: () => { setView('chat'); send(`/${s.id} `); },
    })));
    const all = [...base, ...skillItems];
    const t = q.toLowerCase().trim();
    if (!t) return all.slice(0, 40);
    return all.filter((i) => `${i.label} ${i.hint}`.toLowerCase().includes(t)).slice(0, 40);
  }, [q, skills, settings]);

  useEffect(() => setSel(0), [q]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(!paletteOpen); }
      if (!paletteOpen) return;
      if (e.key === 'Escape') setPalette(false);
      if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(items.length - 1, s + 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
      if (e.key === 'Enter' && items[sel]) { e.preventDefault(); items[sel].run(); setPalette(false); setQ(''); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paletteOpen, items, sel]);

  return (
    <AnimatePresence>
      {paletteOpen && (
        <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setPalette(false)}>
          <motion.div
            className="modal"
            style={{ maxHeight: '64vh' }}
            initial={{ y: -12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -8, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <Search size={16} style={{ color: 'var(--text-3)' }} />
              <input autoFocus placeholder="Search commands and instruments…" value={q} onChange={(e) => setQ(e.target.value)} />
              <span className="pill">esc</span>
            </div>
            <div className="modal-body" style={{ padding: 8 }}>
              {items.map((i, idx) => (
                <div
                  key={i.id}
                  className={`cmd ${idx === sel ? 'sel' : ''}`}
                  onMouseEnter={() => setSel(idx)}
                  onClick={() => { i.run(); setPalette(false); setQ(''); }}
                >
                  <CornerDownLeft size={13} style={{ color: 'var(--text-3)' }} />
                  <span>{i.label}</span>
                  <span className="k">{i.hint}</span>
                </div>
              ))}
              {!items.length && <div className="empty">Nothing matched “{q}”.</div>}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
