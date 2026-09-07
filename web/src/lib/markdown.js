import { marked } from 'marked';
import katex from 'katex';
import 'katex/dist/katex.min.css';

marked.setOptions({ gfm: true, breaks: false });

const mathBlocks = [];

function extractMath(src) {
  mathBlocks.length = 0;
  return String(src)
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => {
      mathBlocks.push({ tex, display: true });
      return `%%MATH${mathBlocks.length - 1}%%`;
    })
    .replace(/(?<![\\$])\$([^$\n]+?)\$(?!\$)/g, (_, tex) => {
      mathBlocks.push({ tex, display: false });
      return `%%MATH${mathBlocks.length - 1}%%`;
    });
}

function restoreMath(html) {
  return html.replace(/%%MATH(\d+)%%/g, (_, i) => {
    const m = mathBlocks[Number(i)];
    if (!m) return '';
    try {
      return katex.renderToString(m.tex, { displayMode: m.display, throwOnError: false, output: 'html' });
    } catch {
      return `<code>${m.tex}</code>`;
    }
  });
}

export function renderMarkdown(src) {
  if (!src) return '';
  try {
    return restoreMath(marked.parse(extractMath(src)));
  } catch (e) {
    return `<pre>${String(src).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</pre>`;
  }
}
