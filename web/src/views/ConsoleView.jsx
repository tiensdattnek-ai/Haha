import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Telescope, Boxes, Brain, Library, Zap } from 'lucide-react';
import { useStore } from '../store';
import Message from '../components/Message';
import Composer from '../components/Composer';

const EXAMPLES = [
  { icon: Telescope, label: 'Plan a 16-week programme on sleep and memory consolidation' },
  { icon: Zap, label: 'How many participants for d = 0.35 at 90% power?' },
  { icon: Brain, label: 'Compare 12 15 11 19 22 14 vs 8 9 14 7 11 10' },
  { icon: Library, label: 'Format: Smith, J. 2021. Power in cognitive science. Psych Methods, 26(3), 245-260.' },
  { icon: Boxes, label: 'Critique: we surveyed 30 students after the intervention and scores rose' },
  { icon: Brain, label: 'Show me the attention heads for "preregistration prevents p-hacking"' },
];

export default function ConsoleView() {
  const { messages, model, skills, health, send } = useStore();
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  return (
    <div className="main">
      <div className="stream">
        <div className="stream-inner">
          {messages.length === 0 && (
            <motion.div className="hero" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <h1>A research mind, <em>trained from scratch</em>,<br />running on your sandbox.</h1>
              <p>
                ATLAS-R1 is a {model?.params ? `${(model.params / 1e6).toFixed(2)}M-parameter` : ''} transformer written in plain JavaScript —
                its autodiff engine, tokenizer, optimiser and training loop all live in this repository. It is wired to
                {' '}{skills.total || 61} deterministic research instruments and a curated knowledge base, so the prose is
                neural and the numbers are exact.
              </p>
              <div className="chip-row">
                {EXAMPLES.map((e, i) => (
                  <motion.button
                    key={i}
                    className="chip"
                    onClick={() => send(e.label)}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.06 * i + 0.15 }}
                  >
                    <e.icon size={12} style={{ marginRight: 6, verticalAlign: -2, color: 'var(--accent)' }} />
                    {e.label}
                  </motion.button>
                ))}
              </div>
              <div className="stat-grid">
                <div className="stat-card">
                  <div className="k">Parameters</div>
                  <div className="v">{model?.params ? model.params.toLocaleString() : '—'}</div>
                  <div className="s">{model?.config ? `${model.config.nLayer}L · ${model.config.nHead}H · ${model.config.nEmbd}D` : 'loading'}</div>
                </div>
                <div className="stat-card">
                  <div className="k">Val perplexity</div>
                  <div className="v">{model?.meta?.perplexity ? model.meta.perplexity.toFixed(1) : model?.history?.length ? Math.exp(model.history[model.history.length - 1].loss).toFixed(1) : '—'}</div>
                  <div className="s">{model?.meta?.tokens ? `${(model.meta.tokens / 1000).toFixed(0)}k training tokens` : 'training'}</div>
                </div>
                <div className="stat-card">
                  <div className="k">Instruments</div>
                  <div className="v">{skills.total || '—'}</div>
                  <div className="s">{skills.categories?.length || 0} categories</div>
                </div>
                <div className="stat-card">
                  <div className="k">Knowledge</div>
                  <div className="v">{model?.passages ?? '—'}</div>
                  <div className="s">indexed passages · hybrid RAG</div>
                </div>
                <div className="stat-card">
                  <div className="k">Runtime</div>
                  <div className="v">{health?.memoryMB ? `${health.memoryMB}MB` : '—'}</div>
                  <div className="s">{health?.node} · {health?.status}</div>
                </div>
              </div>
            </motion.div>
          )}
          {messages.map((m) => <Message key={m.id} msg={m} />)}
          <div ref={endRef} />
        </div>
      </div>
      <Composer />
    </div>
  );
}
