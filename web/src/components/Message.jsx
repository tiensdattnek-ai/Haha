import React, { useMemo, useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Copy, Check, RefreshCw, Download, ChevronRight, Globe, Database, Wrench, Brain, Play,
} from 'lucide-react';
import { renderMarkdown } from '../lib/markdown';
import { useStore } from '../store';
import { api } from '../api';

const PHASE_LABEL = {
  understand: 'Reading the question',
  plan: 'Planning',
  websearch: 'Searching live sources',
  retrieve: 'Reading local knowledge',
  execute: 'Running instruments',
  synthesize: 'Writing the answer',
  critique: 'Checking itself',
};

function Tool({ icon: Icon, label, onClick, done }) {
  return (
    <button className="btn ghost sm" onClick={onClick}>
      {done ? <Check size={12} /> : <Icon size={12} />} {label}
    </button>
  );
}

/** Progress readout while the answer is still streaming. */
function LiveStatus({ trace }) {
  const phase = trace.phases[trace.phases.length - 1];
  const searches = trace.web?.searches || [];
  const lines = [];
  if (trace.analysis?.intents?.length) {
    lines.push(`chose ${trace.analysis.intents.slice(0, 2).map((i) => i.id).join(', ')}`);
  }
  for (const s of searches.slice(-3)) lines.push(`searched ${s.provider} · ${s.hits} hits${s.cached ? ' (cached)' : ''}`);
  for (const d of (trace.web?.documents || []).slice(-2)) lines.push(`read ${d.title?.slice(0, 46)}…`);
  for (const s of trace.skills.slice(-2)) lines.push(`${s.name}${s.status === 'done' ? ` · ${s.ms} ms` : '…'}`);
  return (
    <div className="col" style={{ gap: 2 }}>
      <div className="status-line">
        <span className="spinner" />
        <b style={{ fontWeight: 500, color: 'var(--text-1)' }}>{PHASE_LABEL[phase?.phase] || 'Thinking'}</b>
      </div>
      {lines.slice(-4).map((l, i) => (
        <div key={i} className="step done"><span className="mark">·</span><span className="grow dim" style={{ fontSize: 12 }}>{l}</span></div>
      ))}
    </div>
  );
}

function SourceChips({ trace, onOpen }) {
  const web = trace.web?.results || [];
  const kb = trace.sources || [];
  if (!web.length && !kb.length) return null;
  return (
    <div className="source-chips">
      {web.slice(0, 5).map((r, i) => (
        <a className="chip-src" key={r.url} href={r.url} target="_blank" rel="noreferrer" title={`${r.source} · relevance ${r.score}`}>
          <b>{i + 1}</b><Globe size={11} /><span>{r.title}</span>
        </a>
      ))}
      {kb.slice(0, 3).map((s) => (
        <button className="chip-src" key={s.id} onClick={onOpen} title={s.text?.slice(0, 160)}>
          <Database size={11} /><span>{s.title}</span>
        </button>
      ))}
      {(web.length > 5 || kb.length > 3) && (
        <button className="chip-src" onClick={onOpen}>+{web.length + kb.length - 8} more<ChevronRight size={11} /></button>
      )}
    </div>
  );
}

export default function Message({ msg, isLast }) {
  const { setDrawer, regenerate, settings } = useStore();
  const [copied, setCopied] = useState(false);
  const bodyRef = useRef(null);
  const html = useMemo(() => renderMarkdown(msg.content), [msg.content]);

  // wire up copy/run buttons injected into code blocks
  useEffect(() => {
    const root = bodyRef.current;
    if (!root) return undefined;
    const pres = root.querySelectorAll('pre');
    const cleanups = [];
    pres.forEach((pre) => {
      if (pre.querySelector('.code-tools')) return;
      const code = pre.querySelector('code');
      const text = code?.textContent || '';
      const tools = document.createElement('div');
      tools.className = 'code-tools';

      const copyBtn = document.createElement('button');
      copyBtn.textContent = 'copy';
      copyBtn.onclick = () => {
        navigator.clipboard?.writeText(text);
        copyBtn.textContent = 'copied';
        setTimeout(() => { copyBtn.textContent = 'copy'; }, 1200);
      };
      tools.appendChild(copyBtn);

      const looksJs = !/^\s*(def |class |import [a-z_]+$|print\()/m.test(text) && /[;={}()]/.test(text);
      if (looksJs && text.length < 4000) {
        const runBtn = document.createElement('button');
        runBtn.textContent = 'run';
        runBtn.onclick = async () => {
          runBtn.textContent = 'running…';
          try {
            const res = await api.runSkill('code.run', { code: text });
            const out = res.result?.data;
            let box = pre.nextElementSibling;
            if (!box || !box.classList.contains('run-out')) {
              box = document.createElement('pre');
              box.className = 'run-out';
              box.style.marginTop = '-6px';
              pre.after(box);
            }
            const lines = [];
            if (out?.logs?.length) lines.push(out.logs.join('\n'));
            if (out?.error) lines.push(`✖ ${out.error}`);
            else if (out?.value !== undefined && out?.value !== null) lines.push(`→ ${out.value}`);
            box.innerHTML = `<code>${(lines.join('\n') || '(no output)').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</code>`;
          } catch (e) {
            const box = document.createElement('pre');
            box.className = 'run-out';
            box.innerHTML = `<code>✖ ${e.message}</code>`;
            pre.after(box);
          } finally {
            runBtn.textContent = 'run';
          }
        };
        tools.appendChild(runBtn);
      }
      pre.appendChild(tools);
      cleanups.push(() => tools.remove());
    });
    return () => cleanups.forEach((fn) => fn());
  }, [html]);

  if (msg.role === 'user') {
    return (
      <div className="turn-user">
        <div className="body">{msg.content}</div>
      </div>
    );
  }

  const t = msg.trace || {};
  const done = t.done;

  return (
    <motion.div className="turn turn-ai" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <div className="turn-meta">
        <span className="dotmark" /> ATLAS
        {done && <>· {done.ms} ms · confidence {(done.confidence * 100).toFixed(0)}%</>}
        {t.web?.results?.length ? <>· {t.web.results.length} live sources</> : null}
      </div>

      {msg.streaming && !msg.content && <LiveStatus trace={t} />}
      {msg.streaming && msg.content && settings.showTrace && (
        <div className="status-line"><span className="spinner" /> {PHASE_LABEL[t.phases?.[t.phases.length - 1]?.phase] || 'Writing'}</div>
      )}

      <div className="md" ref={bodyRef} dangerouslySetInnerHTML={{ __html: html }} />
      {msg.streaming && <span className="caret" />}

      <SourceChips trace={t} onOpen={() => setDrawer('sources')} />

      {!msg.streaming && (
        <div className="turn-tools">
          <Tool
            icon={Copy}
            done={copied}
            label={copied ? 'Copied' : 'Copy'}
            onClick={() => { navigator.clipboard?.writeText(msg.content); setCopied(true); setTimeout(() => setCopied(false), 1400); }}
          />
          {isLast && <Tool icon={RefreshCw} label="Regenerate" onClick={regenerate} />}
          <Tool icon={Brain} label="Trace" onClick={() => setDrawer('trace')} />
          {t.skills?.length > 0 && <Tool icon={Wrench} label={`${t.skills.length} instruments`} onClick={() => setDrawer('skills')} />}
          <Tool
            icon={Download}
            label="Markdown"
            onClick={() => {
              const blob = new Blob([msg.content], { type: 'text/markdown' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = `atlas-${Date.now()}.md`;
              a.click();
            }}
          />
        </div>
      )}
    </motion.div>
  );
}
