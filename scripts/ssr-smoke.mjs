/**
 * ssr-smoke.mjs — renders the console once in Node (no browser) to catch
 * import errors, JSX mistakes and render-time crashes. Not a runtime target.
 */
import { renderToString } from 'react-dom/server';
import React from 'react';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.document = { documentElement: { dataset: {} }, createElement: () => ({ click() {} }) };
globalThis.window = { addEventListener() {}, removeEventListener() {}, location: { href: '' } };
globalThis.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
globalThis.SVGElement = class SVGElement {};
globalThis.HTMLElement = class HTMLElement {};
globalThis.Element = class Element {};
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);
globalThis.cancelAnimationFrame = clearTimeout;

import('../web/src/App.jsx').then(({ default: App }) => {
  const html = renderToString(React.createElement(App));
  if (!html.includes('ATLAS')) throw new Error('render produced no brand markup');
  console.log(`ssr smoke ok — ${html.length} bytes of markup`);
});
