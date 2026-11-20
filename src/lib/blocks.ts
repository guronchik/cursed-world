// Блоки страниц (как в Notion): создание, шаблон видео, безопасный HTML, текст для поиска, Markdown ↔ блоки.
// Модуль чистый (без базы данных) — им пользуется и миграция схемы.
import type { Block, BlockType } from '../db/schema';
import { L, uid } from './runtime';

export const TEXT_TYPES: BlockType[] = ['p', 'h1', 'h2', 'h3', 'bullet', 'number', 'todo', 'toggle', 'quote', 'callout'];
export const isTextBlock = (t: BlockType) => TEXT_TYPES.includes(t);
export const LIST_TYPES: BlockType[] = ['bullet', 'number', 'todo'];

export function newBlock(type: BlockType = 'p', html = '', extra: Partial<Block> = {}): Block {
  const b: Block = { id: uid(), type, html, ...extra };
  if (type === 'todo' && b.checked === undefined) b.checked = false;
  if (type === 'toggle') b.open ??= true;
  if (type === 'callout') {
    b.icon ??= 'bulb';
    b.color ??= 'yellow';
  }
  if (type === 'table' && !b.rows) b.rows = [['', '', ''], ['', '', '']];
  return b;
}

/** Шаблон страницы нового видео (редактируется в YouTube Technique → Шаблоны). */
export function defaultVideoTemplate(): Block[] {
  const h = (t: string) => newBlock('h2', t);
  return [
    h(L('Идея / Hook', 'Idea / Hook')),
    newBlock('p', ''),
    h(L('Сценарий', 'Script')),
    newBlock('p', ''),
    h('Shot list'),
    newBlock('todo', ''),
    h(L('Идеи обложки', 'Thumbnail ideas')),
    newBlock('bullet', ''),
    h(L('Варианты названий', 'Title options')),
    newBlock('number', ''),
    h(L('Описание и теги', 'Description & tags')),
    newBlock('p', ''),
    newBlock('ideas'),
    newBlock('notes'),
    h(L('Чек-лист', 'Checklist')),
    newBlock('todo', L('Сценарий готов', 'Script ready')),
    newBlock('todo', L('Снято', 'Shot')),
    newBlock('todo', L('Смонтировано', 'Edited')),
    newBlock('todo', L('Обложка', 'Thumbnail')),
    newBlock('todo', L('Опубликовано', 'Published')),
  ];
}

/** Копия блоков с новыми id (для шаблонов и дублирования). */
export const cloneBlocks = (blocks: Block[]): Block[] => blocks.map((b) => ({ ...b, id: uid(), rows: b.rows?.map((r) => r.slice()) }));

// ───── безопасный inline-HTML ─────
const ALLOWED = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'CODE', 'A', 'MARK', 'SPAN', 'BR']);
const COLOR_RE = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|transparent)$/i;

export function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Оставляет только безопасное форматирование: жирный, курсив, подчёркнутый, зачёркнутый, код, ссылки, выделение цветом, упоминания. */
export function sanitizeHtml(html: string): string {
  if (!html) return '';
  if (typeof document === 'undefined') return escapeHtml(html.replace(/<[^>]*>/g, ''));
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const walk = (node: Node): string => {
    let out = '';
    node.childNodes.forEach((n) => {
      if (n.nodeType === 3) out += escapeHtml(n.textContent || '');
      else if (n.nodeType === 1) {
        const el = n as HTMLElement;
        const tag = el.tagName;
        const inner = walk(el);
        if (tag === 'DIV' || tag === 'P') {
          out += (out && !out.endsWith('<br>') ? '<br>' : '') + inner;
          return;
        }
        if (!ALLOWED.has(tag)) {
          out += inner;
          return;
        }
        if (tag === 'BR') {
          out += '<br>';
          return;
        }
        if (tag === 'A') {
          const page = el.getAttribute('data-page');
          if (page) {
            out += `<a data-page="${escapeHtml(page)}" class="mention" contenteditable="false">${escapeHtml(el.textContent || '')}</a>`;
            return;
          }
          const href = el.getAttribute('href') || '';
          if (/^(https?:|mailto:)/i.test(href)) out += `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
          else out += inner;
          return;
        }
        if (tag === 'SPAN' || tag === 'MARK') {
          const bg = el.style?.backgroundColor;
          const fg = el.style?.color;
          const st = [bg && COLOR_RE.test(bg) ? `background-color:${bg}` : '', fg && COLOR_RE.test(fg) ? `color:${fg}` : ''].filter(Boolean).join(';');
          if (tag === 'MARK') out += `<mark${st ? ` style="${st}"` : ''}>${inner}</mark>`;
          else out += st ? `<span style="${st}">${inner}</span>` : inner;
          return;
        }
        const t = tag === 'STRONG' ? 'b' : tag === 'EM' ? 'i' : tag === 'STRIKE' ? 's' : tag.toLowerCase();
        out += inner ? `<${t}>${inner}</${t}>` : '';
      }
    });
    return out;
  };
  return walk(tpl.content).replace(/(<br>)+$/, '');
}

export function htmlToText(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}

/** Плоский текст страницы для поиска. */
export function blocksText(blocks: Block[]) {
  return blocks
    .map((b) => [htmlToText(b.html || ''), b.body ? htmlToText(b.body) : '', b.caption || '', b.url || '', b.preview?.title || '', ...(b.rows || []).flat()].filter(Boolean).join(' '))
    .join('\n');
}

/** id страниц, на которые ссылается документ (упоминания @ / [[ ]]). */
export function blocksLinks(blocks: Block[]) {
  const ids = new Set<string>();
  for (const b of blocks) for (const src of [b.html, b.body]) if (src) for (const m of src.matchAll(/data-page="([^"]+)"/g)) ids.add(m[1]);
  return [...ids];
}

// ───── Markdown ─────
function inlineMd(html: string, titleOf?: (id: string) => string | undefined) {
  return htmlToText(
    html
      .replace(/<a data-page="([^"]+)"[^>]*>(.*?)<\/a>/g, (_m, id, t) => `[[${titleOf?.(id) || t.replace(/^@/, '')}]]`)
      .replace(/<a href="([^"]+)"[^>]*>(.*?)<\/a>/g, '[$2]($1)')
      .replace(/<\/?(b|strong)>/g, '**')
      .replace(/<\/?(i|em)>/g, '*')
      .replace(/<\/?s>/g, '~~')
      .replace(/<\/?code>/g, '`')
      .replace(/<mark[^>]*>(.*?)<\/mark>/g, '==$1==')
      .replace(/<span[^>]*>(.*?)<\/span>/g, '$1'),
  );
}

export function blocksToMarkdown(blocks: Block[], opts: { titleOf?: (id: string) => string | undefined; ideas?: string; notes?: string } = {}) {
  const out: string[] = [];
  const isList: boolean[] = [];
  let n = 0;
  for (const b of blocks) {
    const before = out.length;
    const pad = '  '.repeat(b.indent || 0);
    const t = inlineMd(b.html || '', opts.titleOf);
    if (b.type !== 'number') n = 0;
    switch (b.type) {
      case 'h1':
        out.push(`# ${t}`);
        break;
      case 'h2':
        out.push(`## ${t}`);
        break;
      case 'h3':
        out.push(`### ${t}`);
        break;
      case 'bullet':
        out.push(`${pad}- ${t}`);
        break;
      case 'number':
        n += 1;
        out.push(`${pad}${n}. ${t}`);
        break;
      case 'todo':
        out.push(`${pad}- [${b.checked ? 'x' : ' '}] ${t}`);
        break;
      case 'quote':
        out.push(`> ${t.replace(/\n/g, '\n> ')}`);
        break;
      case 'callout':
        out.push(`> **${L('Важно', 'Note')}:** ${t.replace(/\n/g, '\n> ')}`);
        break;
      case 'toggle':
        out.push(`<details><summary>${t}</summary>\n\n${inlineMd(b.body || '', opts.titleOf)}\n\n</details>`);
        break;
      case 'divider':
        out.push('---');
        break;
      case 'image':
        out.push(`![${b.caption || 'image'}](${L('картинка', 'image')}${b.blobId ? `:${b.blobId}` : ''})`);
        break;
      case 'embed':
      case 'bookmark':
        out.push(b.url ? `[${b.preview?.title || b.url}](${b.url})` : '');
        break;
      case 'table': {
        const rows = b.rows || [];
        if (rows.length) {
          out.push(`| ${rows[0].join(' | ')} |`);
          out.push(`| ${rows[0].map(() => '---').join(' | ')} |`);
          for (const r of rows.slice(1)) out.push(`| ${r.join(' | ')} |`);
        }
        break;
      }
      case 'ideas':
        if (opts.ideas) out.push(`### Ideas\n\n${opts.ideas}`);
        break;
      case 'notes':
        if (opts.notes) out.push(`### Notes\n\n${opts.notes}`);
        break;
      default:
        out.push(t);
    }
    // пустые абзацы и пустые пункты списков в экспорт не попадают
    if (out.length > before && !t.trim() && ['p', 'bullet', 'number', 'todo', 'quote'].includes(b.type)) {
      out.length = before;
      if (b.type === 'number') n -= 1;
    }
    while (isList.length < out.length) isList.push(LIST_TYPES.includes(b.type));
  }
  // пункты одного списка идут подряд, остальные блоки разделяются пустой строкой
  return out
    .map((x, i) => (i === 0 ? x : (isList[i] && isList[i - 1] ? '\n' : '\n\n') + x))
    .join('')
    .replace(/\n{3,}/g, '\n\n');
}

function mdInline(s: string) {
  return escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<i>$2</i>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

/** Простой Markdown → блоки (для вставки текста и импорта). */
export function markdownToBlocks(md: string): Block[] {
  const out: Block[] = [];
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    const indent = Math.min(3, Math.floor((raw.match(/^\s*/)?.[0].length || 0) / 2));
    const line = raw.trim();
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) out.push(newBlock(`h${m[1].length}` as BlockType, mdInline(m[2])));
    else if ((m = line.match(/^[-*+]\s+\[([ xX])\]\s*(.*)$/))) out.push(newBlock('todo', mdInline(m[2]), { checked: m[1] !== ' ', indent }));
    else if ((m = line.match(/^\[([ xX]?)\]\s*(.*)$/))) out.push(newBlock('todo', mdInline(m[2]), { checked: m[1].toLowerCase() === 'x', indent }));
    else if ((m = line.match(/^[-*+•]\s+(.*)$/))) out.push(newBlock('bullet', mdInline(m[1]), { indent }));
    else if ((m = line.match(/^\d+[.)]\s+(.*)$/))) out.push(newBlock('number', mdInline(m[1]), { indent }));
    else if ((m = line.match(/^>\s?(.*)$/))) out.push(newBlock('quote', mdInline(m[1])));
    else if (/^(---|\*\*\*|___)$/.test(line)) out.push(newBlock('divider'));
    else if (/^https?:\/\/\S+$/.test(line)) out.push(newBlock('bookmark', '', { url: line }));
    else if (line.startsWith('|') && line.endsWith('|')) {
      const rows: string[][] = [];
      let j = i;
      while (j < lines.length && lines[j].trim().startsWith('|')) {
        const cells = lines[j].trim().slice(1, -1).split('|').map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        j++;
      }
      i = j - 1;
      out.push(newBlock('table', '', { rows }));
    } else out.push(newBlock('p', mdInline(line)));
  }
  return out;
}
