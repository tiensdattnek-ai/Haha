import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Play, X, MessageSquarePlus, Loader2 } from 'lucide-react';
import { useStore } from '../store';
import { api } from '../api';
import { renderMarkdown } from '../lib/markdown';
import { Viz } from '../components/Charts';

const COLORS = {
  reasoning: '#7c9cff', design: '#57d6a8', statistics: '#ffb86b', mathematics: '#f38ba8',
  text: '#c39bff', literature: '#6fd3ff', data: '#9ee37d', neural: '#ff9ecd', utility: '#a6adc8',
};

function SkillRunner({ skill, onClose }) {
  const [args, setArgs] = useState(() => Object.fromEntries((skill.params || []).map((p) => [p.name, p.default ?? ''])));
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const { setView, send } = useStore();

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.runSkill(skill.id, args);
      setResult(r.result);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} style={{ paddingTop: '6vh' }}>
      <motion.div
        className="modal"
        style={{ width: 'min(920px, 94vw)', maxHeight: '84vh' }}
        initial={{ y: -14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -10, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head" style={{ gap: 14 }}>
          <div style={{ width: 8, height: 34, borderRadius: 4, background: COLORS[skill.category] }} />
          <div className="grow">
            <div style={{ fontWeight: 600, fontSize: 15 }}>{skill.name}</div>
            <div className="small muted mono">/{skill.id}</div>
          </div>
          <button className="btn ghost sm" onClick={() => { setView('console'); send(`/${skill.id} `); onClose(); }}>
            <MessageSquarePlus size={13} /> Use in chat
          </button>
          <button className="icon-btn" onClick={onClose}><X size={15} /></button>
        </div>
        <div className="modal-body" style={{ padding: 20 }}>
          <p className="muted small" style={{ marginTop: 0 }}>{skill.description}</p>
          {(skill.params || []).length === 0 && <div className="small muted">This instrument takes no parameters.</div>}
          {(skill.params || []).map((p) => (
            <div className="field" key={p.name}>
              <label>
                <span>{p.name} {p.required && <span style={{ color: 'var(--danger)' }}>*</span>}</span>
                <code>{p.type}</code>
              </label>
              {['string', 'numbers', 'matrix'].includes(p.type) && ['text', 'csv', 'json', 'code', 'edges', 'a', 'b', 'reference'].includes(p.name) ? (
                <textarea value={args[p.name] ?? ''} onChange={(e) => setArgs({ ...args, [p.name]: e.target.value })} placeholder={p.description} />
              ) : (
                <input
                  type={p.type === 'number' ? 'number' : 'text'}
                  value={args[p.name] ?? ''}
                  onChange={(e) => setArgs({ ...args, [p.name]: p.type === 'number' ? Number(e.target.value) : e.target.value })}
                  placeholder={p.description}
                />
              )}
              <div className="small" style={{ color: 'var(--text-3)', fontSize: 11 }}>{p.description}</div>
            </div>
          ))}
          {(skill.examples || []).length > 0 && (
            <div className="row wrap" style={{ marginBottom: 12 }}>
              {skill.examples.map((ex, i) => (
                <button key={i} className="chip" style={{ fontSize: 11 }} onClick={() => setArgs({ ...args, ...ex.args })}>example: {ex.label}</button>
              ))}
            </div>
          )}
          <button className="btn primary" onClick={run} disabled={busy}>
            {busy ? <Loader2 size={14} className="spin" /> : <Play size={14} />} Run instrument
          </button>
          {error && <div className="md" style={{ marginTop: 14, color: 'var(--danger)' }}><b>Error:</b> {error}</div>}
          {result && (
            <div style={{ marginTop: 18 }}>
              {result.viz && <div className="panel" style={{ marginBottom: 14 }}><div className="panel-body"><Viz viz={result.viz} /></div></div>}
              <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(result.markdown) }} />
              <div className="small muted mono" style={{ marginTop: 10 }}>executed in {result.ms} ms</div>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function SkillsView() {
  const { skills } = useStore();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(null);
  const [cat, setCat] = useState('all');

  const categories = useMemo(() => {
    const t = q.toLowerCase().trim();
    return (skills.categories || [])
      .filter((c) => cat === 'all' || c.id === cat)
      .map((c) => ({
        ...c,
        skills: c.skills.filter((s) => !t || `${s.id} ${s.name} ${s.summary} ${s.tags.join(' ')}`.toLowerCase().includes(t)),
      }))
      .filter((c) => c.skills.length);
  }, [skills, q, cat]);

  const total = categories.reduce((a, c) => a + c.skills.length, 0);

  return (
    <div className="view">
      <div className="view-inner">
        <div className="view-head">
          <h2>Skill Atlas</h2>
          <p>
            {skills.total} deterministic research instruments across {skills.categories?.length || 0} categories. Every one runs
            locally in pure JavaScript — no external service, no hidden API. Click any card to execute it with your own inputs.
          </p>
        </div>
        <div className="search-box">
          <Search size={16} style={{ color: 'var(--text-3)' }} />
          <input placeholder="Search instruments by name, tag or capability…" value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="pill">{total} shown</span>
        </div>
        <div className="row wrap" style={{ marginBottom: 18 }}>
          <button className={`chip ${cat === 'all' ? 'active' : ''}`} onClick={() => setCat('all')} style={cat === 'all' ? { borderColor: 'var(--accent)', color: 'var(--text-0)' } : {}}>All</button>
          {(skills.categories || []).map((c) => (
            <button
              key={c.id}
              className="chip"
              onClick={() => setCat(c.id)}
              style={cat === c.id ? { borderColor: COLORS[c.id], color: 'var(--text-0)' } : {}}
            >
              <i style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 2, background: COLORS[c.id], marginRight: 7 }} />
              {c.label} <span className="mono muted" style={{ fontSize: 10 }}>{c.skills.length}</span>
            </button>
          ))}
        </div>

        {categories.map((c) => (
          <section key={c.id}>
            <div className="cat-head">
              <i style={{ width: 9, height: 9, borderRadius: 3, background: COLORS[c.id] }} />
              <h3>{c.label}</h3>
              <div className="line" />
              <span className="count">{c.skills.length}</span>
            </div>
            <div className="cards">
              {c.skills.map((s) => (
                <motion.div
                  key={s.id}
                  className="card"
                  style={{ '--cat': COLORS[c.id] }}
                  onClick={() => setActive(s)}
                  whileHover={{ y: -3 }}
                >
                  <div className="id">/{s.id}</div>
                  <h4>{s.name}</h4>
                  <p>{s.summary}</p>
                  <div className="tag-row">
                    {s.tags.slice(0, 4).map((t) => <span className="tag" key={t}>{t}</span>)}
                  </div>
                </motion.div>
              ))}
            </div>
          </section>
        ))}
        {!categories.length && <div className="empty">No instrument matches “{q}”.</div>}
      </div>
      <AnimatePresence>
        {active && <SkillRunner skill={active} onClose={() => setActive(null)} />}
      </AnimatePresence>
    </div>
  );
}
