import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight, Copy, Check, Cpu, Database, FlaskConical, Sparkles,
  Activity, Search, ListTree, ShieldAlert, Zap, Download,
} from 'lucide-react';
import { renderMarkdown } from '../lib/markdown';
import { Viz, TokenProbs } from './Charts';

const PHASE_ICON = {
  understand: Search, plan: ListTree, retrieve: Database,
  execute: FlaskConical, synthesize: Sparkles, critique: ShieldAlert,
};

function CopyBtn({ text, label = 'Copy' }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      className="btn ghost sm"
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setOk(true);
        setTimeout(() => setOk(false), 1400);
      }}
    >
      {ok ? <Check size={13} /> : <Copy size={13} />} {ok ? 'Copied' : label}
    </button>
  );
}

function Trace({ trace, streaming }) {
  const [open, setOpen] = useState(true);
  if (!trace) return null;
  const { phases = [], plan = [], analysis, sources = [], skills = [], neural, done, warnings = [] } = trace;
  const order = ['understand', 'plan', 'retrieve', 'execute', 'synthesize', 'critique'];
  const current = phases[phases.length - 1]?.phase;
  return (
    <div className="trace">
      <div className="trace-head" onClick={() => setOpen((o) => !o)}>
        <motion.div animate={{ rotate: open ? 90 : 0 }}><ChevronRight size={14} /></motion.div>
        <Activity size={13} style={{ color: 'var(--accent)' }} />
        <b style={{ fontWeight: 600 }}>Reasoning trace</b>
        <div className="phase-bar" style={{ marginLeft: 'auto' }}>
          {order.filter((p) => phases.some((x) => x.phase === p)).map((p) => {
            const Icon = PHASE_ICON[p] || Zap;
            const isCur = streaming && current === p;
            return (
              <span key={p} className={`phase-chip ${isCur ? 'active' : 'done'}`}>
                <Icon size={10} /> {p}
              </span>
            );
          })}
        </div>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            style={{ overflow: 'hidden' }}
          >
            <div className="trace-body">
              {analysis && (
                <div className="trace-step">
                  <div className="rail-dot" />
                  <div className="grow">
                    <div className="txt"><b>Intent inference</b> — neural router + heuristic matchers</div>
                    <div className="sub">
                      {analysis.intents?.slice(0, 4).map((i) => `${i.id} ${i.score.toFixed(2)}`).join('  ·  ')}
                    </div>
                    {analysis.tokens != null && (
                      <div className="sub">{analysis.tokens} BPE tokens · {analysis.numbers?.length || 0} numbers · {analysis.entities?.length || 0} entities</div>
                    )}
                  </div>
                </div>
              )}
              {plan.map((s) => (
                <div className="trace-step" key={s.step}>
                  <div className="rail-dot" />
                  <div className="grow">
                    <div className="txt"><b>{s.step}.</b> {s.label}</div>
                    <div className="sub">{s.detail}</div>
                  </div>
                </div>
              ))}
              {sources.length > 0 && (
                <div className="trace-step">
                  <div className="rail-dot" />
                  <div className="grow">
                    <div className="txt"><b>Retrieved</b> {sources.length} passages</div>
                    <div className="sub">{sources.map((s) => `${s.id} (${s.score.toFixed(2)})`).join('  ·  ')}</div>
                  </div>
                </div>
              )}
              {skills.map((s, i) => (
                <div className={`trace-step ${s.status === 'error' ? 'error' : s.status === 'running' ? 'pending' : ''}`} key={`${s.id}-${i}`}>
                  <div className="rail-dot" />
                  <div className="grow">
                    <div className="txt">
                      <b>{s.name || s.id}</b> {s.status === 'done' && <span className="muted mono" style={{ fontSize: 11 }}>{s.ms} ms</span>}
                      {s.status === 'running' && <span className="muted"> · running…</span>}
                    </div>
                    <div className="sub">{s.status === 'error' ? `⚠️ ${s.error}` : `args: ${Object.keys(s.args || {}).slice(0, 5).join(', ') || '—'}`}</div>
                    {s.viz && <div style={{ marginTop: 8 }}><Viz viz={s.viz} /></div>}
                  </div>
                </div>
              ))}
              {neural && (
                <div className="trace-step">
                  <div className="rail-dot" style={{ background: 'var(--accent-2)' }} />
                  <div className="grow">
                    <div className="txt"><b>Neural synthesis</b> — {neural.tokens} tokens @ {neural.tokensPerSecond} tok/s</div>
                    <div className="sub">entropy {neural.entropy} nats · mean log-prob {neural.meanLogProb}</div>
                  </div>
                </div>
              )}
              {warnings.map((w, i) => (
                <div className="trace-step error" key={`w${i}`}>
                  <div className="rail-dot" />
                  <div className="grow"><div className="txt">⚠️ {w}</div></div>
                </div>
              ))}
              {done && (
                <div className="trace-step">
                  <div className="rail-dot" style={{ background: 'var(--accent-3)' }} />
                  <div className="grow">
                    <div className="txt"><b>Complete</b> — confidence {(done.confidence * 100).toFixed(0)}%</div>
                    <div className="sub">{done.ms} ms · {done.skills?.length || 0} instruments · {done.sources?.length || 0} sources</div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Message({ msg }) {
  const html = useMemo(() => renderMarkdown(msg.content), [msg.content]);
  if (msg.role === 'user') {
    return (
      <motion.div className="msg" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
        <div className="bubble-user">{msg.content}</div>
      </motion.div>
    );
  }
  const t = msg.trace;
  return (
    <motion.div className="msg" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <div className="msg-head">
        <div className="avatar atlas"><Cpu size={14} /></div>
        <b style={{ color: 'var(--text-0)', fontWeight: 600 }}>ATLAS</b>
        <span className="mono">R1 · deep-research runtime</span>
        {msg.streaming && <span className="pill live"><i className="dot" /> thinking</span>}
      </div>
      <Trace trace={t} streaming={msg.streaming} />
      <div className="answer">
        <div className="answer-head">
          <Sparkles size={14} style={{ color: 'var(--accent)' }} />
          <b style={{ fontSize: 13 }}>Response</b>
          <div style={{ marginLeft: 'auto' }} className="row">
            <CopyBtn text={msg.content} />
            <button
              className="btn ghost sm"
              onClick={() => {
                const blob = new Blob([msg.content], { type: 'text/markdown' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `atlas-answer-${Date.now()}.md`;
                a.click();
              }}
            >
              <Download size={13} /> .md
            </button>
          </div>
        </div>
        <div className="answer-body">
          <div className="md" dangerouslySetInnerHTML={{ __html: html }} />
          {msg.streaming && <span className="cursor-blink" />}
          {!msg.content && msg.streaming && <div className="empty">Engaging instruments…</div>}
        </div>
        {t?.done && (
          <div className="answer-foot">
            <span>⏱ {t.done.ms} ms</span>
            <span>🎯 confidence {(t.done.confidence * 100).toFixed(0)}%</span>
            {t.done.skills?.length > 0 && <span>🧪 {t.done.skills.join(' · ')}</span>}
            {t.neural && <span>🧠 {t.neural.tokens} tok @ {t.neural.tokensPerSecond}/s</span>}
          </div>
        )}
      </div>
      {t?.neural?.steps?.length > 0 && (
        <details className="trace" style={{ padding: '0 0 6px' }}>
          <summary className="trace-head" style={{ listStyle: 'none' }}>
            <Zap size={13} style={{ color: 'var(--accent-2)' }} /> <b>Token-level decoding (first steps)</b>
          </summary>
          <div className="trace-body"><TokenProbs steps={t.neural.steps} /></div>
        </details>
      )}
    </motion.div>
  );
}
