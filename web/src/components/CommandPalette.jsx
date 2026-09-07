import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, CornerDownLeft } from 'lucide-react';
import { useStore } from '../store';

export default function CommandPalette() {
  const { paletteOpen, setPalette, skills, setView, send, setTheme, theme } = useStore();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);

  const items = useMemo(() => {
    const base = [
      { id: 'view:console', label: 'Go to Console', hint: 'view', run: () => setView('console') },
      { id: 'view:skills', label: 'Go to Skill Atlas', hint: 'view', run: () => setView('skills') },
      { id: 'view:lab', label: 'Go to Neural Lab', hint: 'view', run: () => setView('lab') },
      { id: 'view:knowledge', label: 'Go to Knowledge Base', hint: 'view', run: () => setView('knowledge') },
      { id: 'view:model', label: 'Go to Model & Training', hint: 'view', run: () => setView('model') },
      { id: 'theme', label: `Switch to ${theme === 'obsidian' ? 'Daylight' : 'Obsidian'} theme`, hint: 'ui', run: () => setTheme(theme === 'obsidian' ? 'daylight' : 'obsidian') },
      { id: 'help', label: 'Show skill catalogue', hint: 'chat', run: () => { setView('console'); send('/help'); } },
      { id: 'card', label: 'Show model card', hint: 'chat', run: () => { setView('console'); send('/model.card'); } },
    ];
    const skillItems = (skills.categories || []).flatMap((c) => c.skills.map((s) => ({
      id: `skill:${s.id}`,
      label: `${s.name}`,
      hint: s.id,
      run: () => { setView('console'); send(`/${s.id} `); },
    })));
    const all = [...base, ...skillItems];
    if (!q.trim()) return all.slice(0, 40);
    const t = q.toLowerCase();
    return all.filter((i) => `${i.label} ${i.hint}`.toLowerCase().includes(t)).slice(0, 40);
  }, [q, skills, theme]);

  useEffect(() => { setSel(0); }, [q]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette(!paletteOpen);
      }
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
            initial={{ y: -18, scale: 0.98, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: -12, opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <Search size={17} style={{ color: 'var(--text-3)' }} />
              <input autoFocus placeholder="Search instruments, views and actions…" value={q} onChange={(e) => setQ(e.target.value)} />
              <span className="pill">⌘K</span>
            </div>
            <div className="modal-body">
              {items.map((i, idx) => (
                <div
                  key={i.id}
                  className={`cmd-item ${idx === sel ? 'sel' : ''}`}
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
