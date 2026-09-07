import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Sun, Moon, Download, Trash2, KeyRound, HardDrive, Globe, RotateCcw, Check,
} from 'lucide-react';
import { useStore, DEFAULT_SETTINGS } from '../store';
import { auth, store as db } from '../db';
import { api } from '../api';

function Slider({ label, value, min, max, step, onChange, hint }) {
  return (
    <div className="slider-row">
      <div className="lab"><span>{label}</span><b>{value}</b></div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <div className="dim" style={{ fontSize: 11 }}>{hint}</div>}
    </div>
  );
}

function Toggle({ label, hint, on, onChange }) {
  return (
    <div className="toggle-row">
      <span className="grow">{label}{hint && <><br /><span className="dim" style={{ fontSize: 11.5 }}>{hint}</span></>}</span>
      <div className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)} />
    </div>
  );
}

export default function Settings() {
  const {
    settingsOpen, setSettingsOpen, settings, patchSettings, resetSettings,
    user, logout, webStatus, loadServer, conversations,
  } = useStore();
  const [tab, setTab] = useState('general');
  const [usage, setUsage] = useState(null);
  const [pw, setPw] = useState({ old: '', next: '', msg: null });
  const [confirmWipe, setConfirmWipe] = useState(false);

  useEffect(() => {
    if (settingsOpen) {
      db.usage().then(setUsage).catch(() => {});
      api.webStatus().then((s) => useStore.setState({ webStatus: s })).catch(() => {});
    }
  }, [settingsOpen]);

  if (!settingsOpen) return null;

  const TABS = [['general', 'General'], ['pipeline', 'Pipeline'], ['model', 'Decoding'], ['sources', 'Live sources'], ['data', 'Account & data']];

  return (
    <AnimatePresence>
      <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSettingsOpen(false)}>
        <motion.div
          className="modal"
          initial={{ y: -12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -8, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-head">
            <h3 className="grow">Settings</h3>
            <button className="icon-btn" onClick={() => setSettingsOpen(false)}><X size={16} /></button>
          </div>
          <div className="drawer-tabs">
            {TABS.map(([id, label]) => (
              <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>
            ))}
          </div>
          <div className="modal-body">
            {tab === 'general' && (
              <>
                <div className="card" style={{ marginBottom: 16 }}>
                  <div className="card-head">Appearance</div>
                  <div className="card-body">
                    <div className="toggle-row">
                      <span className="grow">Theme<br /><span className="dim" style={{ fontSize: 11.5 }}>Both themes are strictly monochrome.</span></span>
                      <div className="seg">
                        <button className={settings.theme === 'ink' ? 'on' : ''} onClick={() => patchSettings({ theme: 'ink' })}><Moon size={12} /> Ink</button>
                        <button className={settings.theme === 'paper' ? 'on' : ''} onClick={() => patchSettings({ theme: 'paper' })}><Sun size={12} /> Paper</button>
                      </div>
                    </div>
                    <Toggle
                      label="Show the live progress trace"
                      hint="Displays which stage the agent is in while it answers."
                      on={settings.showTrace}
                      onChange={(v) => patchSettings({ showTrace: v })}
                    />
                  </div>
                </div>
                <div className="card">
                  <div className="card-head">Shortcuts</div>
                  <div className="card-body">
                    {[['⌘ / Ctrl + K', 'command palette'], ['/', 'focus the composer'], ['Enter', 'send'], ['Shift + Enter', 'newline'], ['Esc', 'close panels']].map(([k, v]) => (
                      <div className="kv" key={k}><span className="k">{v}</span><span className="v">{k}</span></div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {tab === 'pipeline' && (
              <div className="card">
                <div className="card-head">What the agent is allowed to do</div>
                <div className="card-body">
                  <Toggle label="Live web search" hint="GitHub, npm, PyPI, and open-web providers when reachable." on={settings.web} onChange={(v) => patchSettings({ web: v })} />
                  <Toggle label="Local knowledge retrieval" hint="Hybrid dense + BM25 over the curated corpus." on={settings.retrieval} onChange={(v) => patchSettings({ retrieval: v })} />
                  <Toggle label="Neural synthesis paragraph" hint="A paragraph generated by the from-scratch model, always labelled." on={settings.neural} onChange={(v) => patchSettings({ neural: v })} />
                  <hr className="hair" />
                  <Slider label="Max instruments per answer" value={settings.maxSkills} min={1} max={5} step={1} onChange={(v) => patchSettings({ maxSkills: v })} />
                  <Slider label="Web results to consider" value={settings.webResults} min={3} max={12} step={1} onChange={(v) => patchSettings({ webResults: v })} />
                  <Slider label="Documents to read in full" value={settings.webDocs} min={0} max={5} step={1} onChange={(v) => patchSettings({ webDocs: v })} hint="Reading fetches the README or source file and quotes it." />
                </div>
              </div>
            )}

            {tab === 'model' && (
              <div className="card">
                <div className="card-head">Decoding — ATLAS-R1</div>
                <div className="card-body">
                  <Slider label="Temperature" value={settings.temperature} min={0.05} max={1.6} step={0.05} onChange={(v) => patchSettings({ temperature: v })} hint="Higher is more surprising, lower is more repetitive." />
                  <Slider label="Top-k" value={settings.topK} min={0} max={200} step={1} onChange={(v) => patchSettings({ topK: v })} hint="0 disables the k filter." />
                  <Slider label="Top-p (nucleus)" value={settings.topP} min={0.1} max={1} step={0.01} onChange={(v) => patchSettings({ topP: v })} />
                  <Slider label="Repetition penalty" value={settings.repetitionPenalty} min={1} max={2} step={0.01} onChange={(v) => patchSettings({ repetitionPenalty: v })} />
                  <Slider label="Max tokens" value={settings.maxTokens} min={16} max={200} step={2} onChange={(v) => patchSettings({ maxTokens: v })} />
                  <Slider label="Seed" value={settings.seed} min={1} max={9999} step={1} onChange={(v) => patchSettings({ seed: v })} hint="Same seed and settings give a byte-identical sample." />
                  <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={resetSettings}><RotateCcw size={12} /> Reset to defaults</button>
                </div>
              </div>
            )}

            {tab === 'sources' && (
              <>
                <div className="card" style={{ marginBottom: 16 }}>
                  <div className="card-head"><Globe size={11} /> Provider availability</div>
                  <div className="card-body">
                    {(webStatus?.providers || []).map((p) => (
                      <div className="kv" key={p.id}>
                        <span className="k">
                          {p.label}<br /><span className="dim mono" style={{ fontSize: 10.5 }}>{p.id} · {p.kind}</span>
                        </span>
                        <span className="v">
                          {p.online ? <>online · {p.ms} ms</> : <span className="dim">unreachable</span>}
                        </span>
                      </div>
                    ))}
                    <div className="dim" style={{ fontSize: 11.5, marginTop: 10, lineHeight: 1.6 }}>
                      Providers are probed at boot and every 10 minutes. Unreachable ones are skipped automatically —
                      run this app on an unrestricted network and the open-web providers activate by themselves.
                    </div>
                    <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={loadServer}><RotateCcw size={12} /> Re-probe</button>
                  </div>
                </div>
                {webStatus?.tls && (
                  <div className="card">
                    <div className="card-head">TLS trust</div>
                    <div className="card-body small muted">
                      {webStatus.tls.applied
                        ? `Using the ${webStatus.tls.source} in addition to Node's bundled roots, so TLS-intercepting proxies work.`
                        : `Default Node roots (${webStatus.tls.reason}).`}
                    </div>
                  </div>
                )}
              </>
            )}

            {tab === 'data' && (
              <>
                <div className="card" style={{ marginBottom: 16 }}>
                  <div className="card-head"><HardDrive size={11} /> Local storage</div>
                  <div className="card-body">
                    <div className="kv"><span className="k">account</span><span className="v">{user?.username}</span></div>
                    <div className="kv"><span className="k">conversations</span><span className="v">{conversations.length}</span></div>
                    {usage && (
                      <>
                        <div className="kv"><span className="k">used</span><span className="v">{(usage.usage / 1048576).toFixed(2)} MB</span></div>
                        <div className="kv"><span className="k">quota</span><span className="v">{(usage.quota / 1048576).toFixed(0)} MB</span></div>
                        <div className="meter" style={{ marginTop: 8 }}><i style={{ width: `${Math.max(1, usage.pct * 100).toFixed(2)}%` }} /></div>
                      </>
                    )}
                    <div className="row wrap" style={{ marginTop: 12 }}>
                      <button
                        className="btn sm"
                        onClick={async () => {
                          const data = await db.exportUser(user.id);
                          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                          const a = document.createElement('a');
                          a.href = URL.createObjectURL(blob);
                          a.download = `atlas-${user.username}-${new Date().toISOString().slice(0, 10)}.json`;
                          a.click();
                        }}
                      >
                        <Download size={12} /> Export everything
                      </button>
                      <button
                        className="btn sm"
                        onClick={async () => {
                          if (!confirmWipe) { setConfirmWipe(true); return; }
                          await db.wipeUser(user.id);
                          useStore.setState({ conversations: [], messages: [], conversationId: null, liveTrace: null });
                          setConfirmWipe(false);
                        }}
                      >
                        <Trash2 size={12} /> {confirmWipe ? 'Click again to erase all chats' : 'Erase all chats'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="card" style={{ marginBottom: 16 }}>
                  <div className="card-head"><KeyRound size={11} /> Change password</div>
                  <div className="card-body">
                    <div className="field"><label>Current password</label><input type="password" value={pw.old} onChange={(e) => setPw({ ...pw, old: e.target.value })} /></div>
                    <div className="field"><label>New password</label><input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></div>
                    {pw.msg && <div className="small" style={{ marginBottom: 8 }}>{pw.msg}</div>}
                    <button
                      className="btn sm"
                      onClick={async () => {
                        try {
                          await auth.changePassword(user.id, pw.old, pw.next);
                          setPw({ old: '', next: '', msg: '✓ password changed' });
                        } catch (e) { setPw({ ...pw, msg: `⚠ ${e.message}` }); }
                      }}
                    >
                      <Check size={12} /> Update password
                    </button>
                  </div>
                </div>

                <div className="card">
                  <div className="card-head">Danger zone</div>
                  <div className="card-body">
                    <div className="small muted" style={{ marginBottom: 10 }}>
                      Deleting the account removes the credential and every conversation from this browser. There is no server copy.
                    </div>
                    <button
                      className="btn sm"
                      onClick={async () => {
                        if (!window.confirm(`Delete the account "${user.username}" and all of its data?`)) return;
                        await auth.deleteAccount(user.id);
                        logout();
                      }}
                    >
                      <Trash2 size={12} /> Delete this account
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
