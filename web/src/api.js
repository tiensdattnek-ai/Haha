/** api.js — typed-ish client for the ATLAS server, including SSE streaming. */

const json = async (r) => {
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
};

export const api = {
  health: () => fetch('/api/health').then(json),
  model: () => fetch('/api/model').then(json),
  skills: () => fetch('/api/skills').then(json),
  knowledge: () => fetch('/api/knowledge').then(json),
  corpus: () => fetch('/api/corpus/sample').then(json),
  sessions: () => fetch('/api/sessions').then(json),
  createSession: (title) => fetch('/api/sessions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title }) }).then(json),
  getSession: (id) => fetch(`/api/sessions/${id}`).then(json),
  deleteSession: (id) => fetch(`/api/sessions/${id}`, { method: 'DELETE' }).then(json),
  renameSession: (id, title) => fetch(`/api/sessions/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title }) }).then(json),
  runSkill: (id, args) => fetch(`/api/skills/${id}/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ args }) }).then(json),
  retrieve: (query, k = 5) => fetch('/api/retrieve', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query, k }) }).then(json),
  generate: (prompt, options) => fetch('/api/neural/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt, options }) }).then(json),
  tokenize: (text) => fetch('/api/neural/tokenize', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) }).then(json),
  attention: (text, layer) => fetch('/api/neural/attention', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, layer }) }).then(json),
  perplexity: (text) => fetch('/api/neural/perplexity', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) }).then(json),
  embed: (text, compare) => fetch('/api/neural/embed', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, compare }) }).then(json),
};

/** Generic SSE-over-POST reader. onEvent gets every parsed JSON frame. */
export async function streamPost(url, body, onEvent, signal) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`stream failed: HTTP ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() || '';
    for (const frame of frames) {
      const line = frame.split('\n').find((l) => l.startsWith('data: '));
      if (!line) continue;
      try {
        onEvent(JSON.parse(line.slice(6)));
      } catch { /* ignore malformed frame */ }
    }
  }
}

export const chatStream = (body, onEvent, signal) => streamPost('/api/chat/stream', body, onEvent, signal);
export const trainStream = (body, onEvent, signal) => streamPost('/api/train/stream', body, onEvent, signal);
