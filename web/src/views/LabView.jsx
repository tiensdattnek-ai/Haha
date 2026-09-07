import React, { useState } from 'react';
import { Play, Loader2, Flame, Binary, Grid3x3, Gauge, Radar } from 'lucide-react';
import { api, trainStream } from '../api';
import { useStore } from '../store';
import { AttentionHeatmap, TokenProbs, LineChart, Sparkline } from '../components/Charts';

function Section({ icon: Icon, title, subtitle, children }) {
  return (
    <div className="panel" style={{ marginBottom: 20 }}>
      <div className="panel-head" style={{ fontSize: 12, letterSpacing: '0.08em' }}>
        <Icon size={13} style={{ color: 'var(--accent)' }} /> {title}
      </div>
      <div className="panel-body" style={{ padding: 18 }}>
        {subtitle && <p className="muted small" style={{ marginTop: 0 }}>{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

export default function LabView() {
  const { model, refreshModel } = useStore();
  const [busy, setBusy] = useState('');

  const [genPrompt, setGenPrompt] = useState('<bos><user> how do I preregister a study? <atlas>');
  const [genOpts, setGenOpts] = useState({ maxTokens: 96, temperature: 0.85, topK: 40, topP: 0.92, seed: 7 });
  const [gen, setGen] = useState(null);

  const [tokText, setTokText] = useState('Preregistration prevents undisclosed analytic flexibility.');
  const [tok, setTok] = useState(null);

  const [attText, setAttText] = useState('the effect size and confidence interval');
  const [attLayer, setAttLayer] = useState(-1);
  const [att, setAtt] = useState(null);
  const [head, setHead] = useState(0);

  const [ppText, setPpText] = useState('A randomised controlled trial with preregistered analysis reduces bias.');
  const [pp, setPp] = useState(null);

  const [embA, setEmbA] = useState('statistical power and sample size');
  const [embB, setEmbB] = useState('how many participants do I need');
  const [emb, setEmb] = useState(null);

  const [trainSteps, setTrainSteps] = useState(30);
  const [trainLr, setTrainLr] = useState(0.0006);
  const [trainText, setTrainText] = useState('');
  const [trainLog, setTrainLog] = useState([]);
  const [training, setTraining] = useState(false);

  const call = async (key, fn, setter) => {
    setBusy(key);
    try { setter(await fn()); } catch (e) { setter({ error: e.message }); } finally { setBusy(''); }
  };

  const runTrain = async () => {
    setTraining(true);
    setTrainLog([]);
    try {
      await trainStream({ steps: trainSteps, lr: trainLr, text: trainText }, (ev) => {
        setTrainLog((l) => [...l, ev]);
      });
    } catch (e) {
      setTrainLog((l) => [...l, { type: 'error', message: e.message }]);
    } finally {
      setTraining(false);
      refreshModel();
    }
  };

  const losses = trainLog.filter((e) => e.type === 'step').map((e) => e.loss);

  return (
    <div className="view">
      <div className="view-inner">
        <div className="view-head">
          <h2>Neural Lab</h2>
          <p>
            Direct access to the model you trained: sample from it, watch its tokenizer, read its attention heads,
            score text under it, probe its embedding space — and push gradients into it live.
          </p>
        </div>

        <Section icon={Flame} title="Sampling" subtitle="Raw completion from the parametric model, with the full decoding surface.">
          <div className="field">
            <label><span>prompt</span><code>special tokens: &lt;bos&gt; &lt;user&gt; &lt;atlas&gt; &lt;eos&gt;</code></label>
            <textarea value={genPrompt} onChange={(e) => setGenPrompt(e.target.value)} />
          </div>
          <div className="row wrap" style={{ gap: 14, marginBottom: 12 }}>
            {[['maxTokens', 8, 200, 1], ['temperature', 0.05, 1.6, 0.05], ['topK', 0, 200, 1], ['topP', 0.1, 1, 0.01], ['seed', 1, 999, 1]].map(([k, min, max, step]) => (
              <div key={k} style={{ minWidth: 130, flex: 1 }}>
                <div className="lab small spread"><span>{k}</span><b className="mono" style={{ color: 'var(--accent)' }}>{genOpts[k]}</b></div>
                <input type="range" min={min} max={max} step={step} value={genOpts[k]} onChange={(e) => setGenOpts({ ...genOpts, [k]: Number(e.target.value) })} />
              </div>
            ))}
          </div>
          <button className="btn primary" onClick={() => call('gen', () => api.generate(genPrompt, genOpts), setGen)} disabled={busy === 'gen'}>
            {busy === 'gen' ? <Loader2 size={14} /> : <Play size={14} />} Sample
          </button>
          {gen && !gen.error && (
            <div style={{ marginTop: 16 }}>
              <div className="md" style={{ padding: 14, background: 'var(--bg-2)', borderRadius: 12, border: '1px solid var(--stroke)' }}>
                <b className="mono small muted">output</b>
                <div style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>{gen.text}</div>
              </div>
              <div className="row wrap" style={{ marginTop: 10 }}>
                <span className="pill">{gen.stats.tokens} tokens</span>
                <span className="pill">{gen.stats.tokensPerSecond.toFixed(1)} tok/s</span>
                <span className="pill">entropy {gen.stats.meanEntropy.toFixed(3)}</span>
                <span className="pill">mean logP {gen.stats.meanLogProb.toFixed(3)}</span>
              </div>
              <div style={{ marginTop: 14 }}><TokenProbs steps={gen.steps} /></div>
            </div>
          )}
          {gen?.error && <div className="small" style={{ color: 'var(--danger)', marginTop: 10 }}>{gen.error}</div>}
        </Section>

        <Section icon={Binary} title="Tokenizer" subtitle="Byte-level BPE learned from the ATLAS corpus itself.">
          <div className="field"><textarea value={tokText} onChange={(e) => setTokText(e.target.value)} /></div>
          <button className="btn" onClick={() => call('tok', () => api.tokenize(tokText), setTok)}><Play size={13} /> Tokenise</button>
          {tok && !tok.error && (
            <div style={{ marginTop: 14 }}>
              <div className="row wrap" style={{ marginBottom: 10 }}>
                <span className="pill">{tok.ids.length} tokens</span>
                <span className="pill">{tok.ratio.toFixed(2)} chars/token</span>
                <span className="pill">vocab {tok.vocab}</span>
              </div>
              <div style={{ lineHeight: 2.1 }}>
                {tok.pieces.map((p, i) => (
                  <span key={i} className="token-chip" title={`id ${p.id}`}>{p.piece.replace(/\n/g, '⏎').replace(/ /g, '␣')}</span>
                ))}
              </div>
            </div>
          )}
        </Section>

        <Section icon={Grid3x3} title="Attention" subtitle="Per-head causal attention maps extracted from a live forward pass.">
          <div className="field"><input value={attText} onChange={(e) => setAttText(e.target.value)} /></div>
          <div className="row" style={{ marginBottom: 12 }}>
            <label className="small muted">layer</label>
            <select className="mono" value={attLayer} onChange={(e) => setAttLayer(Number(e.target.value))} style={{ padding: '6px 10px', borderRadius: 8, background: 'var(--bg-2)', color: 'var(--text-0)', border: '1px solid var(--stroke)' }}>
              {Array.from({ length: model?.config?.nLayer || 4 }, (_, i) => <option key={i} value={i}>layer {i}</option>)}
              <option value={-1}>last</option>
            </select>
            <button className="btn" onClick={() => call('att', () => api.attention(attText, attLayer), setAtt)}><Play size={13} /> Extract</button>
          </div>
          {att && !att.error && (
            <>
              <div className="row wrap" style={{ marginBottom: 10 }}>
                {att.maps.map((_, h) => (
                  <button key={h} className="chip" style={h === head ? { borderColor: 'var(--accent)', color: 'var(--text-0)' } : {}} onClick={() => setHead(h)}>head {h}</button>
                ))}
              </div>
              <AttentionHeatmap tokens={att.tokens} map={att.maps[head]} size={480} />
            </>
          )}
        </Section>

        <Section icon={Gauge} title="Perplexity" subtitle="How surprised the model is by your text — a domain-membership detector.">
          <div className="field"><textarea value={ppText} onChange={(e) => setPpText(e.target.value)} /></div>
          <button className="btn" onClick={() => call('pp', () => api.perplexity(ppText), setPp)}><Play size={13} /> Score</button>
          {pp && !pp.error && (
            <div style={{ marginTop: 14 }}>
              <div className="row wrap">
                <span className="pill">loss {pp.loss.toFixed(4)}</span>
                <span className="pill">perplexity {pp.ppl.toFixed(2)}</span>
                <span className="pill">{(pp.loss / Math.LN2).toFixed(2)} bits/token</span>
              </div>
              <div style={{ marginTop: 12 }}><LineChart points={pp.perToken.map((v, i) => ({ x: i, y: v }))} color="var(--warn)" height={130} /></div>
            </div>
          )}
        </Section>

        <Section icon={Radar} title="Embeddings" subtitle="Mean-pooled hidden states — the same vectors that power retrieval.">
          <div className="row wrap" style={{ gap: 12 }}>
            <div className="field grow"><label><span>text A</span></label><input value={embA} onChange={(e) => setEmbA(e.target.value)} /></div>
            <div className="field grow"><label><span>text B</span></label><input value={embB} onChange={(e) => setEmbB(e.target.value)} /></div>
          </div>
          <button className="btn" onClick={() => call('emb', () => api.embed(embA, embB), setEmb)}><Play size={13} /> Embed & compare</button>
          {emb && !emb.error && (
            <div style={{ marginTop: 14 }}>
              <div className="row wrap">
                <span className="pill">dim {emb.vector.length}</span>
                <span className="pill">cosine {emb.similarity?.toFixed(4)}</span>
              </div>
              <div style={{ marginTop: 10 }}><Sparkline values={emb.vector.slice(0, 96)} height={44} /></div>
              <div className="col" style={{ marginTop: 12, gap: 8 }}>
                {emb.neighbours?.map((n, i) => (
                  <div className="source-card" key={n.id}>
                    <div className="spread"><span className="t">[{i + 1}] {n.title}</span><span className="mono small" style={{ color: 'var(--accent)' }}>{n.score.toFixed(3)}</span></div>
                    <div className="f">{n.id} · {n.field}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>

        <Section icon={Flame} title="Live gradient descent" subtitle="Run real AdamW steps against the loaded weights. Leave the text box empty to continue pretraining on the corpus, or paste your own text to fine-tune on it.">
          <div className="row wrap" style={{ gap: 16, marginBottom: 12 }}>
            <div style={{ minWidth: 160, flex: 1 }}>
              <div className="lab small spread"><span>steps</span><b className="mono" style={{ color: 'var(--accent)' }}>{trainSteps}</b></div>
              <input type="range" min="5" max="200" value={trainSteps} onChange={(e) => setTrainSteps(Number(e.target.value))} />
            </div>
            <div style={{ minWidth: 160, flex: 1 }}>
              <div className="lab small spread"><span>learning rate</span><b className="mono" style={{ color: 'var(--accent)' }}>{trainLr.toExponential(1)}</b></div>
              <input type="range" min="0.00001" max="0.003" step="0.00001" value={trainLr} onChange={(e) => setTrainLr(Number(e.target.value))} />
            </div>
          </div>
          <div className="field">
            <label><span>fine-tuning text (optional, &gt;400 chars)</span></label>
            <textarea value={trainText} onChange={(e) => setTrainText(e.target.value)} placeholder="Paste domain text to adapt the model to it…" />
          </div>
          <button className="btn primary" onClick={runTrain} disabled={training}>
            {training ? <Loader2 size={14} /> : <Flame size={14} />} {training ? 'Training…' : 'Run training steps'}
          </button>
          {losses.length > 1 && (
            <div style={{ marginTop: 16 }}>
              <LineChart points={losses.map((v, i) => ({ x: i, y: v }))} height={150} color="var(--accent-3)" />
              <div className="row wrap" style={{ marginTop: 8 }}>
                <span className="pill">first {losses[0].toFixed(4)}</span>
                <span className="pill">last {losses[losses.length - 1].toFixed(4)}</span>
                <span className="pill">Δ {(losses[losses.length - 1] - losses[0]).toFixed(4)}</span>
              </div>
            </div>
          )}
          <div className="mono small" style={{ marginTop: 12, maxHeight: 180, overflowY: 'auto', color: 'var(--text-2)' }}>
            {trainLog.slice(-40).map((e, i) => (
              <div key={i}>
                {e.type === 'step'
                  ? `step ${String(e.step).padStart(3)} · loss ${e.loss.toFixed(4)} · ppl ${e.ppl.toFixed(1)} · |g| ${e.gradNorm.toFixed(2)} · ${e.ms}ms · ${e.tokensPerSecond} tok/s`
                  : `${e.type}: ${e.message}`}
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}
