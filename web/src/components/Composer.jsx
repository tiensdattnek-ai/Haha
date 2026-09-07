import React, { useRef, useEffect, useState } from 'react';
import { ArrowUp, Square, MessageCircle, Telescope, Code2, Globe, Sparkles, Command } from 'lucide-react';
import { useStore } from '../store';

const MODES = [
  ['chat', 'Chat', MessageCircle, 'One instrument, no web. Fastest.'],
  ['research', 'Research', Telescope, 'Plan → live search → instruments → synthesis → critique.'],
  ['code', 'Code', Code2, 'Coding instruments plus GitHub / npm / PyPI search.'],
];

export default function Composer() {
  const { send, stop, streaming, mode, setMode, settings, patchSettings, setPalette, messages } = useStore();
  const [text, setText] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(240, el.scrollHeight)}px`;
  }, [text]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'TEXTAREA' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const submit = () => {
    if (!text.trim() || streaming) return;
    send(text);
    setText('');
  };

  return (
    <div className="composer-dock">
      <div className="composer">
        <textarea
          ref={ref}
          rows={1}
          value={text}
          placeholder={messages.length ? 'Reply, or paste data / code / an error…' : 'Ask anything — a question, a dataset, a bug, a paper to plan…'}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
          }}
        />
        <div className="composer-bar">
          <div className="seg">
            {MODES.map(([id, label, Icon, hint]) => (
              <button key={id} className={mode === id ? 'on' : ''} onClick={() => setMode(id)} title={hint}>
                <Icon size={12} /> {label}
              </button>
            ))}
          </div>
          <button
            className={`icon-btn ${settings.web ? 'on' : ''}`}
            title={settings.web ? 'Live web search is on' : 'Live web search is off'}
            onClick={() => patchSettings({ web: !settings.web })}
          >
            <Globe size={15} />
          </button>
          <button
            className={`icon-btn ${settings.neural ? 'on' : ''}`}
            title={settings.neural ? 'Neural synthesis paragraph is on' : 'Neural synthesis paragraph is off'}
            onClick={() => patchSettings({ neural: !settings.neural })}
          >
            <Sparkles size={15} />
          </button>
          <button className="icon-btn" title="Command palette (⌘K)" onClick={() => setPalette(true)}>
            <Command size={15} />
          </button>
          <div className="grow" />
          {streaming ? (
            <button className="btn" onClick={stop}><Square size={12} /> Stop</button>
          ) : (
            <button className="btn solid" onClick={submit} disabled={!text.trim()}>
              <ArrowUp size={14} /> Send
            </button>
          )}
        </div>
      </div>
      <div className="hintbar">
        <span><kbd>enter</kbd> send</span>
        <span><kbd>shift</kbd>+<kbd>enter</kbd> newline</span>
        <span><kbd>/</kbd> focus</span>
        <span><kbd>⌘</kbd>+<kbd>k</kbd> commands</span>
      </div>
    </div>
  );
}
