import React, { useRef, useEffect, useState } from 'react';
import { Send, Square, Telescope, Gauge, Command, Wand2 } from 'lucide-react';
import { useStore } from '../store';

const QUICK = [
  '/help',
  'Design a preregistered experiment on sleep and memory',
  'Power analysis for d = 0.35 at 90% power',
  'Critique this method: we surveyed 30 students after the intervention',
];

export default function Composer() {
  const { send, stop, streaming, mode, setMode, setPalette, settings, patchSettings } = useStore();
  const [text, setText] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(220, el.scrollHeight)}px`;
  }, [text]);

  const submit = () => {
    if (!text.trim() || streaming) return;
    send(text);
    setText('');
  };

  return (
    <div className="composer-wrap">
      <div className="composer">
        <textarea
          ref={ref}
          rows={1}
          value={text}
          placeholder="Ask a research question, paste data, or type / for the 61-instrument catalogue…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="composer-bar">
          <div className="mode-switch">
            <button className={mode === 'deep' ? 'on' : ''} onClick={() => setMode('deep')} title="Full pipeline: plan → retrieve → instruments → synthesis → critique">
              <Telescope size={13} /> Deep research
            </button>
            <button className={mode === 'fast' ? 'on' : ''} onClick={() => setMode('fast')} title="Single instrument, minimal latency">
              <Gauge size={13} /> Fast
            </button>
          </div>
          <button
            className={`icon-btn ${settings.neural ? 'active' : ''}`}
            title="Include a neural synthesis paragraph from ATLAS-R1"
            onClick={() => patchSettings({ neural: !settings.neural })}
          >
            <Wand2 size={15} />
          </button>
          <button className="icon-btn" title="Command palette (⌘K)" onClick={() => setPalette(true)}>
            <Command size={15} />
          </button>
          <div className="grow" />
          {streaming ? (
            <button className="btn" onClick={stop}><Square size={13} /> Stop</button>
          ) : (
            <button className="btn primary" onClick={submit} disabled={!text.trim()}>
              <Send size={14} /> Investigate
            </button>
          )}
        </div>
      </div>
      <div className="chip-row" style={{ maxWidth: 900, margin: '10px auto 0', justifyContent: 'flex-start' }}>
        {QUICK.map((q) => (
          <button key={q} className="chip" style={{ fontSize: 11.5, padding: '5px 10px' }} onClick={() => setText(q)}>{q}</button>
        ))}
      </div>
    </div>
  );
}
