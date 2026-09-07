import React from 'react';
import { Sliders, Database, Activity, Cpu, RotateCcw } from 'lucide-react';
import { useStore } from '../store';
import { LossChart, Sparkline, Viz } from './Charts';

function Slider({ label, value, min, max, step, onChange, hint }) {
  return (
    <div className="slider-row">
      <div className="lab"><span>{label}</span><b>{value}</b></div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <div className="small" style={{ color: 'var(--text-3)', fontSize: 10.5 }}>{hint}</div>}
    </div>
  );
}

function Toggle({ label, on, onChange }) {
  return (
    <div className="toggle-row">
      <span>{label}</span>
      <div className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)} />
    </div>
  );
}

export default function Inspector() {
  const { inspectorTab, setInspectorTab, liveTrace, settings, patchSettings, resetSettings, model, messages } = useStore();
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const trace = liveTrace || lastAssistant?.trace;

  const tabs = [
    ['trace', 'Trace', Activity],
    ['sources', 'Sources', Database],
    ['controls', 'Decoding', Sliders],
    ['model', 'Model', Cpu],
  ];

  return (
    <aside className="inspector">
      <div className="insp-tabs">
        {tabs.map(([id, label, Icon]) => (
          <button key={id} className={inspectorTab === id ? 'on' : ''} onClick={() => setInspectorTab(id)}>
            <Icon size={11} style={{ marginRight: 5, verticalAlign: -1 }} />{label}
          </button>
        ))}
      </div>
      <div className="insp-body">
        {inspectorTab === 'trace' && (
          trace ? (
            <>
              {trace.analysis && (
                <div className="panel">
                  <div className="panel-head">Intent ranking</div>
                  <div className="panel-body">
                    {trace.analysis.intents?.map((i) => (
                      <div key={i.id} style={{ marginBottom: 9 }}>
                        <div className="spread small"><span>{i.name}</span><b className="mono">{i.score.toFixed(2)}</b></div>
                        <div className="bar-track" style={{ marginTop: 4 }}>
                          <div className="bar-fill" style={{ width: `${Math.min(100, i.score * 32)}%` }} />
                        </div>
                        <div className="small mono" style={{ color: 'var(--text-3)', fontSize: 10 }}>
                          neural {i.neural?.toFixed(3)} · heuristic {(i.heuristic || 0).toFixed(2)}
                        </div>
                      </div>
                    ))}
                    {trace.analysis.keywords?.length > 0 && (
                      <div className="tag-row" style={{ marginTop: 8 }}>
                        {trace.analysis.keywords.map((k) => <span className="tag" key={k}>{k}</span>)}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {trace.skills?.filter((s) => s.viz).map((s, i) => (
                <div className="panel" key={i}>
                  <div className="panel-head">{s.name}</div>
                  <div className="panel-body"><Viz viz={s.viz} /></div>
                </div>
              ))}
              {trace.done && (
                <div className="panel">
                  <div className="panel-head">Run summary</div>
                  <div className="panel-body">
                    <div className="kv"><span className="k">Latency</span><span className="v">{trace.done.ms} ms</span></div>
                    <div className="kv"><span className="k">Confidence</span><span className="v">{(trace.done.confidence * 100).toFixed(0)}%</span></div>
                    <div className="kv"><span className="k">Instruments</span><span className="v">{trace.done.skills?.length || 0}</span></div>
                    <div className="kv"><span className="k">Sources</span><span className="v">{trace.done.sources?.length || 0}</span></div>
                  </div>
                </div>
              )}
            </>
          ) : <div className="empty">Ask something — the reasoning trace appears here in real time.</div>
        )}

        {inspectorTab === 'sources' && (
          trace?.sources?.length ? trace.sources.map((s, i) => (
            <div className="source-card" key={s.id}>
              <div className="spread">
                <span className="t">[{i + 1}] {s.title}</span>
                <span className="mono small" style={{ color: 'var(--accent)' }}>{s.score.toFixed(3)}</span>
              </div>
              <div className="f">{s.id} · {s.field} · dense {s.dense?.toFixed(3)} / lexical {s.lexical?.toFixed(3)}</div>
              <div className="x">{s.text}</div>
            </div>
          )) : <div className="empty">No retrieved passages yet.</div>
        )}

        {inspectorTab === 'controls' && (
          <>
            <div className="panel">
              <div className="panel-head">Decoding</div>
              <div className="panel-body">
                <Slider label="Temperature" value={settings.temperature} min={0.05} max={1.6} step={0.05} onChange={(v) => patchSettings({ temperature: v })} hint="higher = more surprising continuations" />
                <Slider label="Top-k" value={settings.topK} min={0} max={200} step={1} onChange={(v) => patchSettings({ topK: v })} hint="0 disables the k filter" />
                <Slider label="Top-p (nucleus)" value={settings.topP} min={0.1} max={1} step={0.01} onChange={(v) => patchSettings({ topP: v })} />
                <Slider label="Repetition penalty" value={settings.repetitionPenalty} min={1} max={2} step={0.01} onChange={(v) => patchSettings({ repetitionPenalty: v })} />
                <Slider label="Max tokens" value={settings.maxTokens} min={16} max={200} step={2} onChange={(v) => patchSettings({ maxTokens: v })} />
                <Slider label="Seed" value={settings.seed} min={1} max={9999} step={1} onChange={(v) => patchSettings({ seed: v })} hint="same seed + same settings = identical output" />
              </div>
            </div>
            <div className="panel">
              <div className="panel-head">Pipeline</div>
              <div className="panel-body">
                <Toggle label="Neural synthesis paragraph" on={settings.neural} onChange={(v) => patchSettings({ neural: v })} />
                <Toggle label="Knowledge retrieval (RAG)" on={settings.retrieval} onChange={(v) => patchSettings({ retrieval: v })} />
                <Slider label="Max instruments per answer" value={settings.maxSkills} min={1} max={5} step={1} onChange={(v) => patchSettings({ maxSkills: v })} />
                <button className="btn ghost full sm" style={{ marginTop: 10 }} onClick={resetSettings}><RotateCcw size={12} /> Reset defaults</button>
              </div>
            </div>
          </>
        )}

        {inspectorTab === 'model' && (
          model?.config ? (
            <>
              <div className="panel">
                <div className="panel-head">ATLAS-R1</div>
                <div className="panel-body">
                  <div className="kv"><span className="k">Parameters</span><span className="v">{model.params.toLocaleString()}</span></div>
                  <div className="kv"><span className="k">Layers · heads</span><span className="v">{model.config.nLayer} · {model.config.nHead}</span></div>
                  <div className="kv"><span className="k">Width</span><span className="v">{model.config.nEmbd}</span></div>
                  <div className="kv"><span className="k">Context</span><span className="v">{model.config.blockSize}</span></div>
                  <div className="kv"><span className="k">Vocabulary</span><span className="v">{model.vocab}</span></div>
                  <div className="kv"><span className="k">Val perplexity</span><span className="v">{model.meta?.perplexity ? model.meta.perplexity.toFixed(2) : '—'}</span></div>
                  <div className="kv"><span className="k">Passages</span><span className="v">{model.passages}</span></div>
                  <div className="kv"><span className="k">Status</span><span className="v">{model.status}</span></div>
                </div>
              </div>
              <div className="panel">
                <div className="panel-head">Training curve</div>
                <div className="panel-body"><LossChart history={model.history} height={150} /></div>
              </div>
              <div className="panel">
                <div className="panel-head">Session counters</div>
                <div className="panel-body">
                  <div className="kv"><span className="k">Generations</span><span className="v">{model.stats?.generations ?? 0}</span></div>
                  <div className="kv"><span className="k">Tokens generated</span><span className="v">{model.stats?.tokensGenerated ?? 0}</span></div>
                  <div className="kv"><span className="k">Retrievals</span><span className="v">{model.stats?.retrievals ?? 0}</span></div>
                  <div className="kv"><span className="k">Skill runs</span><span className="v">{model.stats?.skillRuns ?? 0}</span></div>
                </div>
              </div>
            </>
          ) : <div className="empty">Model not loaded.</div>
        )}
      </div>
    </aside>
  );
}
