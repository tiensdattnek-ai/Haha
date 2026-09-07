import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Globe, Database, Wrench, Brain, ExternalLink } from 'lucide-react';
import { useStore } from '../store';
import { Viz } from './Charts';

const TABS = [
  ['trace', 'Trace', Brain],
  ['sources', 'Sources', Globe],
  ['skills', 'Instruments', Wrench],
  ['knowledge', 'Local KB', Database],
];

export default function Drawer() {
  const { drawer, setDrawer, liveTrace, messages } = useStore();
  const trace = liveTrace || [...messages].reverse().find((m) => m.role === 'assistant')?.trace;
  const open = !!drawer;
  const tab = drawer && TABS.some(([id]) => id === drawer) ? drawer : 'trace';

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="drawer-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDrawer(null)} />
          <motion.aside
            className="drawer"
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 40, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0.9, 0.3, 1] }}
          >
            <div className="drawer-head">
              <h3 className="grow">Answer details</h3>
              <button className="icon-btn" onClick={() => setDrawer(null)}><X size={16} /></button>
            </div>
            <div className="drawer-tabs">
              {TABS.map(([id, label, Icon]) => (
                <button key={id} className={tab === id ? 'on' : ''} onClick={() => setDrawer(id)}>
                  <Icon size={11} style={{ verticalAlign: -1, marginRight: 5 }} />{label}
                </button>
              ))}
            </div>
            <div className="drawer-body">
              {!trace && <div className="empty">Ask something first.</div>}

              {trace && tab === 'trace' && (
                <>
                  {trace.analysis && (
                    <div className="card">
                      <div className="card-head">Intent ranking</div>
                      <div className="card-body">
                        {trace.analysis.intents?.map((i) => (
                          <div key={i.id} style={{ marginBottom: 10 }}>
                            <div className="spread small"><span>{i.name}</span><b className="mono">{i.score.toFixed(2)}</b></div>
                            <div className="meter" style={{ marginTop: 4 }}><i style={{ width: `${Math.min(100, i.score * 30)}%` }} /></div>
                            <div className="dim mono" style={{ fontSize: 10 }}>neural {i.neural?.toFixed(3)} · rules {(i.heuristic || 0).toFixed(2)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {trace.plan?.length > 0 && (
                    <div className="card">
                      <div className="card-head">Plan</div>
                      <div className="card-body">
                        {trace.plan.map((s) => (
                          <div className="step done" key={s.step}>
                            <span className="mark">{s.step}</span>
                            <span className="grow"><b style={{ fontWeight: 500 }}>{s.label}</b><br /><span className="sub">{s.detail}</span></span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {trace.web?.searches?.length > 0 && (
                    <div className="card">
                      <div className="card-head">Live search log</div>
                      <div className="card-body">
                        {trace.web.searches.map((s, i) => (
                          <div className="kv" key={i}>
                            <span className="k">{s.provider}<br /><span className="dim" style={{ fontSize: 10.5 }}>{s.query}</span></span>
                            <span className="v">{s.error ? '✖' : `${s.hits}`}{s.cached ? ' ⋅c' : ''}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {trace.neural && (
                    <div className="card">
                      <div className="card-head">Neural synthesis</div>
                      <div className="card-body">
                        <div className="kv"><span className="k">tokens</span><span className="v">{trace.neural.tokens}</span></div>
                        <div className="kv"><span className="k">throughput</span><span className="v">{trace.neural.tokensPerSecond}/s</span></div>
                        <div className="kv"><span className="k">entropy</span><span className="v">{trace.neural.entropy}</span></div>
                        <div className="kv"><span className="k">mean log-prob</span><span className="v">{trace.neural.meanLogProb}</span></div>
                      </div>
                    </div>
                  )}
                  {trace.done && (
                    <div className="card">
                      <div className="card-head">Result</div>
                      <div className="card-body">
                        <div className="kv"><span className="k">latency</span><span className="v">{trace.done.ms} ms</span></div>
                        <div className="kv"><span className="k">confidence</span><span className="v">{(trace.done.confidence * 100).toFixed(0)}%</span></div>
                        <div className="kv"><span className="k">instruments</span><span className="v">{trace.done.skills?.length || 0}</span></div>
                        <div className="kv"><span className="k">local passages</span><span className="v">{trace.done.sources?.length || 0}</span></div>
                        {trace.done.web && <div className="kv"><span className="k">web results</span><span className="v">{trace.done.web.results} / {trace.done.web.documents} read</span></div>}
                      </div>
                    </div>
                  )}
                  {trace.warnings?.length > 0 && (
                    <div className="card">
                      <div className="card-head">Warnings</div>
                      <div className="card-body small muted">{trace.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}</div>
                    </div>
                  )}
                </>
              )}

              {trace && tab === 'sources' && (
                <>
                  {(trace.web?.results || []).map((r, i) => (
                    <div className="src-card" key={r.url}>
                      <div className="spread">
                        <a href={r.url} target="_blank" rel="noreferrer">[{i + 1}] {r.title} <ExternalLink size={11} /></a>
                        <span className="mono dim" style={{ fontSize: 10.5 }}>{r.score}</span>
                      </div>
                      <div className="meta">
                        {r.source}
                        {r.meta?.stars ? ` · ★ ${r.meta.stars.toLocaleString()}` : ''}
                        {r.meta?.language ? ` · ${r.meta.language}` : ''}
                        {r.published ? ` · ${String(r.published).slice(0, 10)}` : ''}
                      </div>
                      <div className="txt">{r.snippet}</div>
                    </div>
                  ))}
                  {(trace.web?.documents || []).length > 0 && (
                    <div className="card">
                      <div className="card-head">Documents read in full</div>
                      <div className="card-body">
                        {trace.web.documents.map((d, i) => (
                          <div className="kv" key={i}>
                            <span className="k">{d.title?.slice(0, 40)}</span>
                            <span className="v">{(d.chars / 1000).toFixed(1)}k · {d.passages}p{d.hasCode ? ' · code' : ''}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {(trace.sources || []).map((s, i) => (
                    <div className="src-card" key={s.id}>
                      <div className="spread">
                        <span style={{ fontWeight: 600 }}>{s.title}</span>
                        <span className="mono dim" style={{ fontSize: 10.5 }}>{s.score?.toFixed?.(3)}</span>
                      </div>
                      <div className="meta">local · {s.id} · {s.field}</div>
                      <div className="txt">{s.text}</div>
                    </div>
                  ))}
                  {!trace.web?.results?.length && !trace.sources?.length && <div className="empty">No sources were used for this answer.</div>}
                </>
              )}

              {trace && tab === 'skills' && (
                (trace.skills || []).length
                  ? trace.skills.map((s, i) => (
                    <div className="card" key={i}>
                      <div className="card-head">{s.name || s.id} {s.status === 'error' ? '· failed' : `· ${s.ms} ms`}</div>
                      <div className="card-body">
                        {s.error && <div className="small">⚠ {s.error}</div>}
                        {s.args && (
                          <div className="mono dim" style={{ fontSize: 11, marginBottom: 8, wordBreak: 'break-all' }}>
                            {JSON.stringify(s.args).slice(0, 220)}
                          </div>
                        )}
                        {s.viz && <Viz viz={s.viz} />}
                        {s.data && !s.viz && (
                          <pre style={{ margin: 0, fontSize: 11, maxHeight: 200, overflow: 'auto' }}>
                            {JSON.stringify(s.data, null, 1).slice(0, 1200)}
                          </pre>
                        )}
                      </div>
                    </div>
                  ))
                  : <div className="empty">No instruments ran for this answer.</div>
              )}

              {tab === 'knowledge' && <KnowledgePeek />}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function KnowledgePeek() {
  const { knowledge } = useStore();
  if (!knowledge) return <div className="empty">Loading knowledge base…</div>;
  return (
    <>
      <div className="card">
        <div className="card-head">Local knowledge base</div>
        <div className="card-body">
          <div className="kv"><span className="k">entries</span><span className="v">{knowledge.entries.length}</span></div>
          <div className="kv"><span className="k">passages</span><span className="v">{knowledge.passages}</span></div>
          <div className="kv"><span className="k">fields</span><span className="v">{knowledge.fields.length}</span></div>
        </div>
      </div>
      {knowledge.entries.slice(0, 12).map((e) => (
        <div className="src-card" key={e.id}>
          <div style={{ fontWeight: 600 }}>{e.title}</div>
          <div className="meta">{e.id} · {e.field} · {e.words} words</div>
          <div className="txt">{e.text.slice(0, 200)}…</div>
        </div>
      ))}
    </>
  );
}
