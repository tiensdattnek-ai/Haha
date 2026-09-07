/**
 * ssr-smoke.mjs — renders every screen once in Node (no browser) to catch
 * import errors, JSX mistakes and render-time crashes before they reach the UI.
 * Bundle it first:
 *   npx esbuild scripts/ssr-smoke.mjs --bundle --platform=node --format=cjs \
 *     --loader:.css=empty --outfile=web/.ssr.cjs && node web/.ssr.cjs
 */
import { renderToString } from 'react-dom/server';
import React from 'react';

/* ------------------------------ browser shims ----------------------------- */
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
globalThis.sessionStorage = globalThis.localStorage;
globalThis.document = { documentElement: { dataset: {} }, createElement: () => ({ click() {}, style: {}, appendChild() {} }) };
globalThis.window = { addEventListener() {}, removeEventListener() {}, location: { href: '' } };
globalThis.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
globalThis.SVGElement = class SVGElement {};
globalThis.HTMLElement = class HTMLElement {};
globalThis.Element = class Element {};
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);
globalThis.cancelAnimationFrame = clearTimeout;
globalThis.indexedDB = { open: () => ({ addEventListener() {} }) };
globalThis.navigator = globalThis.navigator || { storage: {} };
if (!globalThis.crypto?.randomUUID) {
  globalThis.crypto = { randomUUID: () => 'smoke-uuid', getRandomValues: (a) => a, subtle: {} };
}

/* -------------------------------- targets --------------------------------- */
import App from '../web/src/App.jsx';
import AuthGate from '../web/src/components/AuthGate.jsx';
import Sidebar from '../web/src/components/Sidebar.jsx';
import Drawer from '../web/src/components/Drawer.jsx';
import Settings from '../web/src/components/Settings.jsx';
import CommandPalette from '../web/src/components/CommandPalette.jsx';
import Composer from '../web/src/components/Composer.jsx';
import Message from '../web/src/components/Message.jsx';
import ChatView from '../web/src/views/ChatView.jsx';
import SkillsView from '../web/src/views/SkillsView.jsx';
import LabView from '../web/src/views/LabView.jsx';
import KnowledgeView from '../web/src/views/KnowledgeView.jsx';
import ModelView from '../web/src/views/ModelView.jsx';
import { useStore } from '../web/src/store.js';

const sampleMessage = {
  id: 'm1',
  role: 'assistant',
  content: '## Heading\n\nSome **markdown** with `code` and a table.\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n```js\nconst x = 1;\n```',
  streaming: false,
  trace: {
    phases: [{ phase: 'done', label: 'x' }], plan: [], analysis: null, sources: [], skills: [],
    neural: null, done: { ms: 12, confidence: 0.8, skills: [], sources: [] }, warnings: [],
    web: { plan: null, providers: [], searches: [], results: [], documents: [] },
  },
};

const targets = [
  ['App (boot)', () => React.createElement(App)],
  ['AuthGate', () => React.createElement(AuthGate)],
  ['Sidebar', () => React.createElement(Sidebar)],
  ['ChatView', () => React.createElement(ChatView)],
  ['Composer', () => React.createElement(Composer)],
  ['Message', () => React.createElement(Message, { msg: sampleMessage, isLast: true })],
  ['Drawer (open)', () => React.createElement(Drawer)],
  ['Settings (open)', () => React.createElement(Settings)],
  ['CommandPalette', () => React.createElement(CommandPalette)],
  ['SkillsView', () => React.createElement(SkillsView)],
  ['LabView', () => React.createElement(LabView)],
  ['KnowledgeView', () => React.createElement(KnowledgeView)],
  ['ModelView', () => React.createElement(ModelView)],
];

function main() {
  // force the panels open so their bodies actually render
  useStore.setState({
    booting: false,
    user: { id: 'u', username: 'smoke' },
    drawer: 'trace',
    settingsOpen: true,
    paletteOpen: true,
    messages: [{ id: 'u1', role: 'user', content: 'hello' }, sampleMessage],
    liveTrace: sampleMessage.trace,
  });

  let failed = 0;
  for (const [label, make] of targets) {
    try {
      const html = renderToString(make());
      console.log(`  ok    ${label.padEnd(20)} ${String(html.length).padStart(7)} bytes`);
    } catch (e) {
      failed++;
      console.log(`  FAIL  ${label}: ${e.message}`);
    }
  }
  if (failed) {
    console.log(`\nssr smoke: ${failed} component(s) failed`);
    process.exit(1);
  }
  console.log('\nssr smoke ok — every screen renders');
}

main();
