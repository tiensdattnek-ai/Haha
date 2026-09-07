import React, { useEffect, useRef } from 'react';
import { PanelLeft, Info, Menu } from 'lucide-react';
import { useStore } from '../store';
import Message from '../components/Message';
import Composer from '../components/Composer';

const STARTERS = [
  { t: 'Plan a study', d: 'Design a preregistered experiment testing whether spaced practice beats massed practice', m: 'research' },
  { t: 'Do the statistics', d: 'Compare these groups: 12 15 11 19 22 14 vs 8 9 14 7 11 10', m: 'research' },
  { t: 'Write code', d: 'Write a JavaScript function that fetches with timeout, retry and exponential backoff', m: 'code' },
  { t: 'Search live sources', d: 'Find the most used vector database libraries and compare them', m: 'research' },
  { t: 'Debug an error', d: "TypeError: Cannot read properties of undefined (reading 'map') at render (App.jsx:22)", m: 'code' },
  { t: 'Just talk', d: 'What can you actually do, and what are you bad at?', m: 'chat' },
];

export default function ChatView() {
  const { messages, streaming, send, setMode, setDrawer, conversations, conversationId, setRail, model } = useStore();
  const endRef = useRef(null);
  const title = conversations.find((c) => c.id === conversationId)?.title;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: messages.length > 2 ? 'smooth' : 'auto', block: 'end' });
  }, [messages]);

  return (
    <div className="main">
      <header className="topbar">
        <button className="icon-btn" onClick={() => setRail(true)} title="Menu" style={{ display: 'none' }}><Menu size={16} /></button>
        <PanelLeft size={15} style={{ color: 'var(--text-3)' }} />
        <h2 className="grow">{title || 'New chat'}</h2>
        <span className="pill" title="model status">
          <i className={`dot ${model?.status === 'ready' ? '' : 'off'}`} />
          {model?.params ? `${(model.params / 1e6).toFixed(2)}M` : 'no model'}
        </span>
        <button className="icon-btn" onClick={() => setDrawer('trace')} title="Details"><Info size={16} /></button>
      </header>

      <div className="thread">
        <div className="thread-inner">
          {!messages.length && (
            <div className="welcome">
              <h1>What are we working on?</h1>
              <p>
                Type anything. I plan the work, search live sources, run {' '}
                deterministic instruments for every number, and tell you how confident the result is.
              </p>
              <div className="starters">
                {STARTERS.map((s) => (
                  <button
                    key={s.t}
                    className="starter"
                    onClick={() => { setMode(s.m); send(s.d); }}
                  >
                    <b>{s.t}</b>
                    <span>{s.d}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <Message key={m.id} msg={m} isLast={i === messages.length - 1 && !streaming} />
          ))}
          <div ref={endRef} style={{ height: 1 }} />
        </div>
      </div>

      <Composer />
    </div>
  );
}
