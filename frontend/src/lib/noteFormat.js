import { escapeHtml } from './api.js';

function inlineMd(t) {
  return escapeHtml(t)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>');
}

// Renders the structured notes (paragraphs, sub-headings, bullets, numbered steps) as HTML.
// Everything is escaped first, so it is safe to inject.
export function formatNoteContent(text) {
  if (!text) return '';
  const isHead = (l) => /^\s*#{1,6}\s*\S/.test(l) || /^\s*\*\*[^*]{2,60}?:?\*\*:?\s*$/.test(l);
  const GENERIC = /^\s*(?:#{1,6}\s*|\*\*)\s*(?:key points|remember|steps|types \/ comparison)\s*:?\s*(?:\*\*)?:?\s*$/i;
  const all = String(text).replace(/\r/g, '').split('\n').filter((l) => !GENERIC.test(l));
  // a sub-heading with nothing under it is just a label: leave it out
  const lines = all.filter((l, i) => {
    if (!isHead(l)) return true;
    for (let j = i + 1; j < all.length; j++) { if (!all[j].trim()) continue; return !isHead(all[j]); }
    return false;
  });
  let html = '';
  let list = null;
  let prevKind = '';
  const close = () => { if (list) { html += `</${list}>`; list = null; } };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { close(); prevKind = ''; continue; }
    let m;
    if ((m = line.match(/^#{1,6}\s*(.+)$/)) || (m = line.match(/^\*\*([^*]{2,60}?):?\*\*:?$/))) {
      close(); prevKind = 'head'; html += `<h4 class="note-sub">${inlineMd(m[1].replace(/:$/, ''))}</h4>`;
    } else if ((m = line.match(/^[-•*]\s+(.+)$/))) {
      const lvl = Math.min(2, Math.floor(raw.match(/^\s*/)[0].length / 2));
      if (list !== 'ul') { close(); html += '<ul class="note-list">'; list = 'ul'; }
      html += `<li${lvl ? ` class="lvl${lvl}"` : ''}>${inlineMd(m[1])}</li>`;
      prevKind = 'bullet';
    } else if ((m = line.match(/^\d+[.)]\s+(.+)$/))) {
      const nested = prevKind === 'bullet' || prevKind === 'numNested'; // 1,2,3 under a bullet belongs to it
      if (list !== 'ol') { close(); html += '<ol class="note-list">'; list = 'ol'; }
      html += `<li${nested ? ' style="margin-left:1.4rem"' : ''}>${inlineMd(m[1])}</li>`;
      prevKind = nested ? 'numNested' : 'num';
    } else {
      close(); prevKind = 'para'; html += `<p>${inlineMd(line)}</p>`;
    }
  }
  close();
  return html;
}

// A title with nothing under it is not shown.
export function noteHasBody(n) {
  return (
    (n.diagrams || []).length ||
    n.hasConflict ||
    String(n.content || '')
      .split('\n')
      .filter((l) => !/^\s*#{1,6}\s/.test(l) && !/^\s*\*\*[^*]+\*\*:?\s*$/.test(l))
      .join(' ')
      .replace(/[-•*]\s/g, ' ')
      .trim().length >= 25
  );
}

export const cleanTitle = (t) => String(t).replace(/\s*\(cont\.\)\s*$/i, '');
