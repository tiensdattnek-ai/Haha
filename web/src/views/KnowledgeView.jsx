import React, { useEffect, useMemo, useState } from 'react';
import { Search, BookOpen, Sparkles } from 'lucide-react';
import { useStore } from '../store';
import { api } from '../api';

export default function KnowledgeView() {
  const { knowledge } = useStore();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState(null);
  const [active, setActive] = useState(null);
  const [corpus, setCorpus] = useState(null);

  useEffect(() => { api.corpus().then(setCorpus).catch(() => {}); }, []);

  const entries = useMemo(() => {
    const t = q.toLowerCase().trim();
    if (!knowledge) return [];
    if (!t) return knowledge.entries;
    return knowledge.entries.filter((e) => `${e.title} ${e.field} ${e.tags.join(' ')} ${e.text}`.toLowerCase().includes(t));
  }, [knowledge, q]);

  const semantic = async () => {
    if (!q.trim()) return;
    try { setHits((await api.retrieve(q, 5)).hits); } catch { setHits(null); }
  };

  return (
    <div className="view">
      <div className="view-inner">
        <div className="view-head">
          <h2>Knowledge Base</h2>
          <p>
            {knowledge?.entries?.length || 0} curated methodology entries, chunked into {knowledge?.passages || 0} passages and
            indexed with the model's own embeddings plus BM25. This is what "grounded" means in ATLAS — every citation
            resolves to text you can read here.
          </p>
        </div>

        <div className="search-box">
          <Search size={16} style={{ color: 'var(--text-3)' }} />
          <input
            placeholder="Filter entries, or press Enter for neural retrieval…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && semantic()}
          />
          <button className="btn sm" onClick={semantic}><Sparkles size={12} /> Semantic search</button>
        </div>

        {hits && (
          <div style={{ marginBottom: 24 }}>
            <div className="cat-head"><h3>Hybrid retrieval results</h3><div className="line" /><span className="count">{hits.length}</span></div>
            <div className="col" style={{ gap: 10 }}>
              {hits.map((h, i) => (
                <div className="source-card" key={h.id}>
                  <div className="spread">
                    <span className="t">[{i + 1}] {h.title}</span>
                    <span className="mono small" style={{ color: 'var(--accent)' }}>{h.score.toFixed(4)}</span>
                  </div>
                  <div className="f">{h.id} · {h.field} · dense {h.dense.toFixed(3)} · lexical {h.lexical.toFixed(3)}</div>
                  <div className="x" style={{ maxHeight: 'none' }}>{h.text}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="cards">
          {entries.map((e) => (
            <div className="card click" key={e.id} onClick={() => setActive(active?.id === e.id ? null : e)} style={{ '--cat': 'var(--accent-3)' }}>
              <div className="id">{e.id} · {e.words} words</div>
              <h4><BookOpen size={13} style={{ verticalAlign: -2, marginRight: 6, color: 'var(--accent-3)' }} />{e.title}</h4>
              <p>{active?.id === e.id ? e.text : `${e.text.slice(0, 150)}…`}</p>
              <div className="tag-row">
                <span className="tag" style={{ color: 'var(--accent-3)' }}>{e.field}</span>
                {e.tags.slice(0, 3).map((t) => <span className="tag" key={t}>{t}</span>)}
              </div>
            </div>
          ))}
        </div>

        {corpus?.available && (
          <>
            <div className="cat-head"><h3>Pretraining corpus</h3><div className="line" /><span className="count">{(corpus.bytes / 1e6).toFixed(2)} MB</span></div>
            <div className="panel">
              <div className="panel-body">
                <div className="row wrap" style={{ marginBottom: 12 }}>
                  <span className="pill">{corpus.stats?.chars?.toLocaleString()} chars</span>
                  <span className="pill">{corpus.stats?.words?.toLocaleString()} words</span>
                  <span className="pill">{corpus.stats?.uniqueWords?.toLocaleString()} unique</span>
                  <span className="pill">{corpus.stats?.segments?.toLocaleString()} segments</span>
                  <span className="pill">{corpus.stats?.chatExchanges?.toLocaleString()} dialogues</span>
                  <button className="btn ghost sm" onClick={() => api.corpus().then(setCorpus)}>resample</button>
                </div>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.65, color: 'var(--text-2)', maxHeight: 320, overflow: 'auto', margin: 0 }}>
                  {corpus.sample}
                </pre>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
