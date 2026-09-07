import React, { useEffect } from 'react';
import { Cpu, Layers, Database, Clock, RefreshCcw } from 'lucide-react';
import { useStore } from '../store';
import { LossChart, Sparkline } from '../components/Charts';

const fmt = (n) => (typeof n === 'number' ? n.toLocaleString(undefined, { maximumFractionDigits: 4 }) : '—');

export default function ModelView() {
  const { model, refreshModel, health } = useStore();

  useEffect(() => {
    const t = setInterval(refreshModel, 20000);
    return () => clearInterval(t);
  }, []);

  if (!model?.config) {
    return <div className="view"><div className="view-inner"><div className="empty">Model not loaded. Run <code>npm run train</code> to produce a checkpoint.</div></div></div>;
  }

  const c = model.config;
  const m = model.meta || {};
  const hist = model.history || [];
  const speeds = hist.filter((h) => h.tokensPerSecond).map((h) => h.tokensPerSecond);

  return (
    <div className="view">
      <div className="view-inner">
        <div className="view-head">
          <h2>Model & Training</h2>
          <p>
            Full provenance of ATLAS-R1. Every weight in this checkpoint was produced by the training loop in
            <code style={{ margin: '0 5px' }}>scripts/train.js</code> from random initialisation — there is no imported
            model anywhere in this system.
          </p>
        </div>

        <div className="stat-grid" style={{ marginBottom: 24 }}>
          <div className="stat-card"><div className="k">Parameters</div><div className="v">{model.params.toLocaleString()}</div><div className="s">{c.nLayer}L · {c.nHead}H · {c.nEmbd}D</div></div>
          <div className="stat-card"><div className="k">Validation loss</div><div className="v">{m.finalValLoss ? m.finalValLoss.toFixed(4) : '—'}</div><div className="s">ppl {m.perplexity ? m.perplexity.toFixed(2) : '—'}</div></div>
          <div className="stat-card"><div className="k">Training tokens</div><div className="v">{m.tokens ? `${(m.tokens / 1000).toFixed(0)}k` : '—'}</div><div className="s">{m.corpusChars ? `${(m.corpusChars / 1e6).toFixed(2)}M chars` : ''}</div></div>
          <div className="stat-card"><div className="k">Wall clock</div><div className="v">{m.wallClockSeconds ? `${(m.wallClockSeconds / 60).toFixed(1)}m` : '—'}</div><div className="s">{m.steps ? `${m.steps} steps · batch ${m.batch}` : ''}</div></div>
          <div className="stat-card"><div className="k">Vocabulary</div><div className="v">{model.vocab}</div><div className="s">{model.merges} learned merges</div></div>
        </div>

        <div className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-head"><Layers size={12} /> Loss curve</div>
          <div className="panel-body"><LossChart history={hist} height={230} /></div>
        </div>

        <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
          <div className="panel">
            <div className="panel-head"><Cpu size={12} /> Architecture</div>
            <div className="panel-body">
              {[['Layers', c.nLayer], ['Attention heads', c.nHead], ['Model dimension', c.nEmbd], ['Head dimension', c.nEmbd / c.nHead],
                ['MLP ratio', c.mlpRatio], ['Context window', `${c.blockSize} tokens`], ['Vocabulary', c.vocabSize],
                ['Dropout', c.dropout ?? 0], ['Weight tying', 'embedding ↔ output head'], ['Norm', 'pre-LayerNorm'], ['Activation', 'GELU']]
                .map(([k, v]) => <div className="kv" key={k}><span className="k">{k}</span><span className="v">{String(v)}</span></div>)}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><Database size={12} /> Parameter budget</div>
            <div className="panel-body">
              {Object.entries(model.groups || {}).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => (
                <div key={k} style={{ marginBottom: 7 }}>
                  <div className="spread small"><code style={{ fontSize: 11 }}>{k}</code><b className="mono">{v.toLocaleString()}</b></div>
                  <div className="bar-track" style={{ marginTop: 3 }}><div className="bar-fill" style={{ width: `${(v / model.params) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><Clock size={12} /> Training run</div>
            <div className="panel-body">
              {[['Trained at', m.trainedAt ? new Date(m.trainedAt).toLocaleString() : '—'],
                ['Steps', m.steps], ['Batch size', m.batch],
                ['Optimiser', m.optimizer ? `AdamW · wd ${m.optimizer.weightDecay}` : 'AdamW'],
                ['Peak LR', m.optimizer?.lr], ['Final LR', m.optimizer?.minLr],
                ['Grad clip', m.optimizer?.clip], ['Warmup', m.optimizer?.warmup],
                ['Final train loss', m.finalTrainLoss?.toFixed(4)], ['Best val loss', m.bestValLoss?.toFixed(4)]]
                .map(([k, v]) => <div className="kv" key={k}><span className="k">{k}</span><span className="v">{v ?? '—'}</span></div>)}
              {speeds.length > 2 && (
                <>
                  <div className="small muted" style={{ marginTop: 10 }}>throughput (tokens/s)</div>
                  <Sparkline values={speeds} color="var(--accent-3)" />
                </>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><RefreshCcw size={12} /> Runtime</div>
            <div className="panel-body">
              {[['Status', model.status], ['Loaded at', model.loadedAt ? new Date(model.loadedAt).toLocaleTimeString() : '—'],
                ['Indexed passages', model.passages], ['Knowledge entries', model.knowledgeEntries],
                ['Router classes', model.router ? 'trained' : 'heuristic only'],
                ['Router accuracy', model.router?.accuracy ? `${(model.router.accuracy * 100).toFixed(1)}%` : '—'],
                ['Router samples', model.router?.samples], ['Memory', health?.memoryMB ? `${health.memoryMB} MB` : '—'],
                ['Node', health?.node]]
                .map(([k, v]) => <div className="kv" key={k}><span className="k">{k}</span><span className="v">{v ?? '—'}</span></div>)}
              <button className="btn ghost full sm" style={{ marginTop: 12 }} onClick={refreshModel}><RefreshCcw size={12} /> Refresh</button>
            </div>
          </div>
        </div>

        {m.samples?.length > 0 && (
          <>
            <div className="cat-head"><h3>Samples captured at the end of training</h3><div className="line" /></div>
            <div className="col" style={{ gap: 10 }}>
              {m.samples.map((s, i) => (
                <div className="source-card" key={i}>
                  <div className="f">{s.prompt}</div>
                  <div className="x" style={{ maxHeight: 'none', marginTop: 6 }}>{s.text}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
