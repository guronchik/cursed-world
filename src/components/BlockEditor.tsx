// Редактор блоков в духе Notion: свой, без внешних библиотек (TipTap/BlockNote не ставятся без сети).
// Текстовые блоки — contentEditable (неуправляемые: React не трогает DOM, пока блок в фокусе).
// «/» — меню блоков, @ или [[ — ссылка на другую страницу, markdown-сокращения, перетаскивание за ⠿,
// панель форматирования над выделением (ПК) и над клавиатурой (телефон).
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent, type MouseEvent as RMouseEvent, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Block, BlockType } from '../db/schema';
import { cloneBlocks, isTextBlock, LIST_TYPES, markdownToBlocks, newBlock, sanitizeHtml, escapeHtml } from '../lib/blocks';
import { useMedia } from '../lib/hooks';
import { fetchPreview, hostOf, isUrl, youtubeId } from '../lib/links';
import { putImage } from '../lib/media';
import { clamp, L } from '../lib/runtime';
import { Icon } from './Icon';
import { BlobImg, ImagePick, Modal } from './ui';

export interface PageRef {
  id: string;
  title: string;
  icon?: { name: string; color: string };
}

export const BLOCK_COLORS: Record<string, string> = {
  gray: 'rgba(142,142,147,.18)',
  brown: 'rgba(172,142,104,.2)',
  orange: 'rgba(255,159,10,.17)',
  yellow: 'rgba(255,214,10,.17)',
  green: 'rgba(48,209,88,.18)',
  blue: 'rgba(10,132,255,.18)',
  purple: 'rgba(191,90,242,.18)',
  pink: 'rgba(255,55,95,.17)',
  red: 'rgba(255,69,58,.18)',
};
const HILITE = ['rgba(48,209,88,0.3)', 'rgba(255,214,10,0.32)', 'rgba(255,69,58,0.3)', 'rgba(10,132,255,0.3)', 'rgba(191,90,242,0.3)'];

interface MenuItem {
  type: BlockType;
  label: string;
  hint: string;
  icon: string;
  keys: string;
}
export const BLOCK_MENU = (): MenuItem[] => [
  { type: 'p', label: L('Текст', 'Text'), hint: L('Обычный абзац', 'Plain paragraph'), icon: 'type', keys: 'text p текст абзац' },
  { type: 'h1', label: L('Заголовок 1', 'Heading 1'), hint: '#', icon: 'heading', keys: 'h1 heading заголовок' },
  { type: 'h2', label: L('Заголовок 2', 'Heading 2'), hint: '##', icon: 'heading', keys: 'h2 heading заголовок' },
  { type: 'h3', label: L('Заголовок 3', 'Heading 3'), hint: '###', icon: 'heading', keys: 'h3 heading заголовок' },
  { type: 'bullet', label: L('Маркированный список', 'Bulleted list'), hint: '-', icon: 'list', keys: 'bullet list список маркер' },
  { type: 'number', label: L('Нумерованный список', 'Numbered list'), hint: '1.', icon: 'listnum', keys: 'number list нумерованный список' },
  { type: 'todo', label: L('To-do', 'To-do'), hint: '[]', icon: 'todo', keys: 'todo check задача чекбокс' },
  { type: 'toggle', label: L('Раскрывающийся', 'Toggle'), hint: '>>', icon: 'toggle', keys: 'toggle раскрывающийся' },
  { type: 'quote', label: L('Цитата', 'Quote'), hint: '>', icon: 'quote', keys: 'quote цитата' },
  { type: 'callout', label: 'Callout', hint: L('Выделенный блок', 'Highlighted box'), icon: 'bulb', keys: 'callout выноска' },
  { type: 'divider', label: L('Разделитель', 'Divider'), hint: '---', icon: 'divider', keys: 'divider line разделитель линия' },
  { type: 'image', label: L('Картинка', 'Image'), hint: L('Загрузить', 'Upload'), icon: 'image', keys: 'image picture картинка фото' },
  { type: 'embed', label: 'YouTube / embed', hint: L('Видео по ссылке', 'Video by link'), icon: 'youtube', keys: 'youtube embed video видео' },
  { type: 'bookmark', label: L('Ссылка-закладка', 'Bookmark'), hint: L('Карточка ссылки', 'Link card'), icon: 'link', keys: 'bookmark link ссылка закладка' },
  { type: 'table', label: L('Таблица', 'Table'), hint: '', icon: 'table', keys: 'table таблица' },
  { type: 'ideas', label: 'Ideas', hint: L('Идеи видео', 'Video ideas'), icon: 'bulb', keys: 'ideas идеи' },
  { type: 'notes', label: 'Notes', hint: L('Заметки к видео', 'Video notes'), icon: 'note', keys: 'notes заметки' },
];
const TURN_INTO: BlockType[] = ['p', 'h1', 'h2', 'h3', 'bullet', 'number', 'todo', 'toggle', 'quote', 'callout'];

// ───── каретка ─────
function caretOffset(el: HTMLElement) {
  const sel = getSelection();
  if (!sel || !sel.rangeCount) return 0;
  const r = sel.getRangeAt(0);
  if (!el.contains(r.startContainer)) return 0;
  const pre = document.createRange();
  pre.selectNodeContents(el);
  pre.setEnd(r.startContainer, r.startOffset);
  return pre.toString().length;
}
function setCaret(el: HTMLElement, offset: number | 'end') {
  el.focus();
  const sel = getSelection();
  if (!sel) return;
  const r = document.createRange();
  const total = el.textContent?.length || 0;
  let left = offset === 'end' ? total : clamp(offset, 0, total);
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const len = node.textContent?.length || 0;
    if (left <= len) {
      r.setStart(node, left);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
      return;
    }
    left -= len;
    node = walker.nextNode();
  }
  r.selectNodeContents(el);
  r.collapse(false);
  sel.removeAllRanges();
  sel.addRange(r);
}
const textBeforeCaret = (el: HTMLElement) => (el.textContent || '').slice(0, caretOffset(el));
const htmlOf = (frag: DocumentFragment) => {
  const d = document.createElement('div');
  d.appendChild(frag);
  return d.innerHTML;
};
const plain = (html: string) => {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.textContent || '';
};
function exec(cmd: string, val?: string) {
  try {
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand(cmd, false, val);
  } catch {
    /* старые движки */
  }
}
function deleteBack(n: number) {
  const sel = getSelection();
  if (!sel) return;
  for (let i = 0; i < n; i++) sel.modify('extend', 'backward', 'character');
  if (!sel.isCollapsed) exec('delete');
}

type Popup = { kind: 'slash' | 'mention'; id: string; q: string; trigger: number; x: number; y: number; sel: number };

export function BlockEditor({
  value,
  onChange,
  pages = [],
  selfId,
  onOpenPage,
  renderSpecial,
  readOnly,
}: {
  value: Block[];
  onChange: (b: Block[]) => void;
  pages?: PageRef[];
  selfId?: string;
  onOpenPage?: (id: string) => void;
  renderSpecial?: (b: Block) => ReactNode;
  readOnly?: boolean;
}) {
  const [blocks, setBlocksState] = useState<Block[]>(() => (value.length ? value : [newBlock('p')]));
  const els = useRef(new Map<string, HTMLElement>());
  const force = useRef(new Set<string>());
  const pendingFocus = useRef<{ id: string; at: number | 'end' } | null>(null);
  const [popup, setPopup] = useState<Popup | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; over: number } | null>(null);
  const coarse = useMedia('(pointer: coarse)');
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;

  const commit = (next: Block[]) => {
    if (!next.length) next = [newBlock('p')];
    blocksRef.current = next;
    setBlocksState(next);
    onChange(next);
  };
  const patch = (id: string, p: Partial<Block>, forceDom = false) => {
    if (forceDom) force.current.add(id);
    commit(blocksRef.current.map((b) => (b.id === id ? { ...b, ...p } : b)));
  };
  const focusLater = (id: string, at: number | 'end' = 'end') => {
    pendingFocus.current = { id, at };
  };
  useLayoutEffect(() => {
    const f = pendingFocus.current;
    if (!f) return;
    const el = els.current.get(f.id);
    if (el) {
      pendingFocus.current = null;
      setCaret(el, f.at);
    }
  });

  const idx = (id: string) => blocksRef.current.findIndex((b) => b.id === id);
  const insertAfter = (id: string | null, nb: Block[], focus = true) => {
    const list = blocksRef.current.slice();
    const i = id ? list.findIndex((b) => b.id === id) : list.length - 1;
    list.splice(i + 1, 0, ...nb);
    commit(list);
    if (focus && nb[0] && isTextBlock(nb[0].type)) focusLater(nb[0].id, 0);
  };
  const remove = (id: string) => commit(blocksRef.current.filter((b) => b.id !== id));

  // ───── числа нумерованных списков ─────
  const numbers = useMemo(() => {
    const m = new Map<string, number>();
    const counters: number[] = [];
    for (const b of blocks) {
      const ind = b.indent || 0;
      if (b.type === 'number') {
        counters.length = ind + 1;
        counters[ind] = (counters[ind] || 0) + 1;
        m.set(b.id, counters[ind]);
      } else if (!LIST_TYPES.includes(b.type)) counters.length = 0;
    }
    return m;
  }, [blocks]);

  // ───── превращение блока ─────
  const turnInto = (id: string, type: BlockType) => {
    const b = blocksRef.current.find((x) => x.id === id);
    if (!b) return;
    if (isTextBlock(type)) {
      const nb = newBlock(type, isTextBlock(b.type) ? b.html : '');
      patch(id, { type, checked: nb.checked ?? b.checked, open: nb.open ?? b.open, icon: type === 'callout' ? b.icon || nb.icon : b.icon, color: type === 'callout' ? b.color || nb.color : b.color }, true);
      focusLater(id, 'end');
    } else {
      const nb = newBlock(type);
      const list = blocksRef.current.slice();
      const i = list.findIndex((x) => x.id === id);
      const empty = isTextBlock(b.type) && !plain(b.html).trim();
      list.splice(empty ? i : i + 1, empty ? 1 : 0, nb);
      if (list[list.length - 1].id === nb.id) list.push(newBlock('p'));
      commit(list);
    }
  };

  const applyPick = (item: MenuItem) => {
    if (!popup) return;
    const el = els.current.get(popup.id);
    if (el) {
      el.focus();
      setCaret(el, popup.trigger + 1 + popup.q.length);
      deleteBack(popup.q.length + 1);
      patch(popup.id, { html: sanitizeHtml(el.innerHTML) });
    }
    const b = blocksRef.current.find((x) => x.id === popup.id);
    setPopup(null);
    if (!b) return;
    if (!plain(b.html).trim() || b.type === item.type) turnInto(b.id, item.type);
    else {
      const nb = newBlock(item.type);
      insertAfter(b.id, isTextBlock(item.type) ? [nb] : [nb, newBlock('p')]);
    }
  };
  const applyMention = (p: PageRef) => {
    if (!popup) return;
    const el = els.current.get(popup.id);
    if (!el) return setPopup(null);
    const trig = (el.textContent || '').slice(popup.trigger, popup.trigger + 2) === '[[' ? 2 : 1;
    setCaret(el, popup.trigger + trig + popup.q.length);
    deleteBack(popup.q.length + trig);
    exec('insertHTML', `<a data-page="${escapeHtml(p.id)}" class="mention" contenteditable="false">@${escapeHtml(p.title || L('Без названия', 'Untitled'))}</a>&nbsp;`);
    patch(popup.id, { html: sanitizeHtml(el.innerHTML) });
    setPopup(null);
  };

  const menuItems = useMemo(() => {
    if (popup?.kind !== 'slash') return [];
    const q = popup.q.toLowerCase();
    return BLOCK_MENU().filter((m) => !q || m.label.toLowerCase().includes(q) || m.keys.includes(q));
  }, [popup]);
  const mentionItems = useMemo(() => {
    if (popup?.kind !== 'mention') return [];
    const q = popup.q.toLowerCase();
    return pages.filter((p) => p.id !== selfId && (!q || (p.title || '').toLowerCase().includes(q))).slice(0, 8);
  }, [popup, pages, selfId]);

  // ───── ввод ─────
  const onInput = (b: Block, el: HTMLElement) => {
    const before = textBeforeCaret(el);
    // markdown-сокращения в начале блока
    const md: [RegExp, BlockType][] = [
      [/^###\s$/, 'h3'],
      [/^##\s$/, 'h2'],
      [/^#\s$/, 'h1'],
      [/^[-*•]\s$/, 'bullet'],
      [/^1[.)]\s$/, 'number'],
      [/^\[\s?\]\s$/, 'todo'],
      [/^>>\s$/, 'toggle'],
      [/^>\s$/, 'quote'],
      [/^!\s$/, 'callout'],
    ];
    if (b.type === 'p' || (b.type !== 'h1' && LIST_TYPES.includes(b.type))) {
      for (const [re, t] of md)
        if (re.test(before) && (b.type === 'p' || t !== b.type)) {
          deleteBack(before.length);
          const html = sanitizeHtml(el.innerHTML);
          force.current.add(b.id);
          const extra = t === 'todo' ? { checked: false } : t === 'toggle' ? { open: true } : t === 'callout' ? { icon: 'bulb', color: 'yellow' } : {};
          commit(blocksRef.current.map((x) => (x.id === b.id ? { ...x, type: t, html, ...extra } : x)));
          focusLater(b.id, 0);
          return;
        }
      if (/^---$/.test(el.textContent || '') && b.type === 'p') {
        const list = blocksRef.current.slice();
        const i = list.findIndex((x) => x.id === b.id);
        const np = newBlock('p');
        list.splice(i, 1, newBlock('divider'), np);
        commit(list);
        focusLater(np.id, 0);
        return;
      }
    }
    patch(b.id, { html: sanitizeHtml(el.innerHTML) });
    // «/» и упоминания
    const r = getSelection()?.getRangeAt(0).getBoundingClientRect();
    const pos = { x: r?.left || 0, y: (r?.bottom || 0) + 6 };
    const slash = before.match(/(?:^|\s)\/([^\s/]{0,24})$/);
    const at = before.match(/(?:^|\s)@([^\s@]{0,30})$/) || before.match(/\[\[([^\]]{0,30})$/);
    if (slash) setPopup({ kind: 'slash', id: b.id, q: slash[1], trigger: before.length - slash[1].length - 1, ...pos, sel: 0 });
    else if (at && pages.length) {
      const trigLen = at[0].trimStart().startsWith('[[') ? 2 : 1;
      setPopup({ kind: 'mention', id: b.id, q: at[1], trigger: before.length - at[1].length - trigLen, ...pos, sel: 0 });
    } else if (popup) setPopup(null);
  };

  const onKeyDown = (b: Block, el: HTMLElement, e: KeyboardEvent) => {
    if (popup && popup.id === b.id) {
      const n = popup.kind === 'slash' ? menuItems.length : mentionItems.length;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (n) setPopup({ ...popup, sel: (popup.sel + (e.key === 'ArrowDown' ? 1 : n - 1)) % n });
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (n) {
          e.preventDefault();
          if (popup.kind === 'slash') applyPick(menuItems[popup.sel]);
          else applyMention(mentionItems[popup.sel]);
          return;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setPopup(null);
        return;
      }
    }
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      const url = window.prompt(L('Ссылка (https://…)', 'Link (https://…)'), 'https://');
      if (url && /^(https?:|mailto:)/i.test(url)) exec('createLink', url);
      patch(b.id, { html: sanitizeHtml(el.innerHTML) });
      return;
    }
    if (mod && e.shiftKey && e.key.toLowerCase() === 'h') {
      e.preventDefault();
      exec('hiliteColor', HILITE[0]);
      patch(b.id, { html: sanitizeHtml(el.innerHTML) });
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !(b.type === 'toggle' && e.altKey)) {
      e.preventDefault();
      const empty = !(el.textContent || '').trim() && !el.querySelector('a');
      if (empty && (LIST_TYPES.includes(b.type) || b.type === 'quote' || b.type === 'callout' || b.type === 'toggle')) {
        if ((b.indent || 0) > 0) return patch(b.id, { indent: (b.indent || 0) - 1 });
        force.current.add(b.id);
        commit(blocksRef.current.map((x) => (x.id === b.id ? { ...x, type: 'p', html: '' } : x)));
        focusLater(b.id, 0);
        return;
      }
      const sel = getSelection();
      if (!sel || !sel.rangeCount) return;
      if (!sel.isCollapsed) sel.deleteFromDocument();
      const r = sel.getRangeAt(0);
      const tail = document.createRange();
      tail.setStart(r.endContainer, r.endOffset);
      tail.setEnd(el, el.childNodes.length);
      const after = sanitizeHtml(htmlOf(tail.extractContents()));
      const before = sanitizeHtml(el.innerHTML);
      const contType: BlockType = LIST_TYPES.includes(b.type) ? b.type : 'p';
      const nb = newBlock(contType, after, { indent: LIST_TYPES.includes(b.type) ? b.indent : undefined });
      force.current.add(b.id);
      const list = blocksRef.current.map((x) => (x.id === b.id ? { ...x, html: before } : x));
      list.splice(list.findIndex((x) => x.id === b.id) + 1, 0, nb);
      commit(list);
      focusLater(nb.id, 0);
      return;
    }
    if (e.key === 'Backspace') {
      const sel = getSelection();
      if (!sel?.isCollapsed || caretOffset(el) !== 0) return;
      e.preventDefault();
      if (b.type !== 'p') {
        if ((b.indent || 0) > 0) return patch(b.id, { indent: (b.indent || 0) - 1 });
        force.current.add(b.id);
        commit(blocksRef.current.map((x) => (x.id === b.id ? { ...x, type: 'p', checked: undefined } : x)));
        focusLater(b.id, 0);
        return;
      }
      const i = idx(b.id);
      const prev = blocksRef.current[i - 1];
      if (!prev) return;
      if (isTextBlock(prev.type)) {
        const at = plain(prev.html).length;
        force.current.add(prev.id);
        const merged = sanitizeHtml(prev.html + el.innerHTML);
        commit(blocksRef.current.filter((x) => x.id !== b.id).map((x) => (x.id === prev.id ? { ...x, html: merged } : x)));
        focusLater(prev.id, at);
      } else if (!(el.textContent || '').length) {
        remove(b.id);
        const pp = blocksRef.current.slice(0, i).reverse().find((x) => isTextBlock(x.type));
        if (pp) focusLater(pp.id, 'end');
      } else remove(prev.id);
      return;
    }
    if (e.key === 'Tab' && (LIST_TYPES.includes(b.type) || b.type === 'p')) {
      e.preventDefault();
      patch(b.id, { indent: clamp((b.indent || 0) + (e.shiftKey ? -1 : 1), 0, 4) });
      return;
    }
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.shiftKey) {
      const text = el.textContent || '';
      const off = caretOffset(el);
      const atEdge = e.key === 'ArrowUp' ? off === 0 || !text.slice(0, off).includes('\n') && isFirstLine(el) : off === text.length || isLastLine(el);
      if (!atEdge) return;
      const list = blocksRef.current;
      const i = idx(b.id);
      const step = e.key === 'ArrowUp' ? -1 : 1;
      for (let j = i + step; j >= 0 && j < list.length; j += step)
        if (isTextBlock(list[j].type)) {
          e.preventDefault();
          const t = els.current.get(list[j].id);
          if (t) setCaret(t, e.key === 'ArrowUp' ? 'end' : 0);
          return;
        }
    }
  };

  const onPaste = (b: Block, el: HTMLElement, e: ClipboardEvent) => {
    const files = Array.from(e.clipboardData.files || []).filter((f) => f.type.startsWith('image/'));
    if (files.length) {
      e.preventDefault();
      void Promise.all(files.map((f) => putImage(f, f.name, 1600))).then((ids) => insertAfter(b.id, ids.map((blobId) => newBlock('image', '', { blobId })), false));
      return;
    }
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    e.preventDefault();
    const empty = !(el.textContent || '').trim();
    if (isUrl(text) && empty) {
      const t: BlockType = youtubeId(text) ? 'embed' : 'bookmark';
      const nb = newBlock(t, '', { url: text.trim() });
      const list = blocksRef.current.slice();
      list.splice(idx(b.id), 1, nb, newBlock('p'));
      commit(list);
      return;
    }
    if (text.includes('\n')) {
      const parsed = markdownToBlocks(text);
      if (parsed.length > 1) {
        const list = blocksRef.current.slice();
        const i = idx(b.id);
        list.splice(empty ? i : i + 1, empty ? 1 : 0, ...parsed);
        commit(list);
        const last = [...parsed].reverse().find((x) => isTextBlock(x.type));
        if (last) focusLater(last.id, 'end');
        return;
      }
    }
    if (isUrl(text) && !getSelection()?.isCollapsed) exec('createLink', text.trim());
    else exec('insertText', text);
    patch(b.id, { html: sanitizeHtml(el.innerHTML) });
  };

  const onClickContent = (e: RMouseEvent) => {
    const a = (e.target as HTMLElement).closest('a') as HTMLAnchorElement | null;
    if (!a) return;
    const page = a.getAttribute('data-page');
    if (page) {
      e.preventDefault();
      onOpenPage?.(page);
    } else if (a.href && (e.metaKey || e.ctrlKey || coarse || readOnly)) {
      e.preventDefault();
      window.open(a.href, '_blank', 'noopener');
    }
  };

  // ───── перетаскивание блоков ─────
  const listRef = useRef<HTMLDivElement>(null);
  const startDrag = (id: string, e: RPointerEvent) => {
    if (readOnly) return;
    e.preventDefault();
    const startY = e.clientY;
    let moved = false;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const overIndex = (y: number) => {
      const rows = Array.from(listRef.current?.querySelectorAll<HTMLElement>(':scope > [data-bid]') || []);
      let k = rows.length;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i].getBoundingClientRect();
        if (y < r.top + r.height / 2) {
          k = i;
          break;
        }
      }
      return k;
    };
    const move = (ev: PointerEvent) => {
      if (!moved && Math.abs(ev.clientY - startY) < 4) return;
      moved = true;
      setDrag({ id, over: overIndex(ev.clientY) });
    };
    const up = (ev: PointerEvent) => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      setDrag(null);
      if (!moved) {
        setMenuFor(id);
        return;
      }
      const over = overIndex(ev.clientY);
      const list = blocksRef.current.slice();
      const from = list.findIndex((b) => b.id === id);
      const [it] = list.splice(from, 1);
      list.splice(over > from ? over - 1 : over, 0, it);
      commit(list);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };

  const menuBlock = blocks.find((b) => b.id === menuFor);
  const move = (id: string, d: number) => {
    const list = blocksRef.current.slice();
    const i = list.findIndex((b) => b.id === id);
    const j = clamp(i + d, 0, list.length - 1);
    if (i === j) return;
    [list[i], list[j]] = [list[j], list[i]];
    commit(list);
  };

  return (
    <div className="be" onClick={onClickContent}>
      <div ref={listRef} className="relative">
        {blocks.map((b, i) => (
          <div
            key={b.id}
            data-bid={b.id}
            className={`be-row group ${drag?.id === b.id ? 'opacity-40' : ''}`}
            style={{ paddingLeft: (b.indent || 0) * 24 }}
          >
            {drag && drag.over === i && <div className="be-drop" />}
            {!readOnly && (
              <div className="be-gutter">
                <button className="be-handle" title={L('Добавить блок ниже', 'Add block below')} onClick={() => {
                  const nb = newBlock('p');
                  insertAfter(b.id, [nb]);
                }}>
                  <Icon name="plus" size={14} />
                </button>
                <button className="be-handle touch-none cursor-grab" aria-label={L('Перетащить блок', 'Drag block')} onPointerDown={(e) => startDrag(b.id, e)}>
                  <Icon name="grip" size={14} />
                </button>
              </div>
            )}
            <BlockView
              b={b}
              num={numbers.get(b.id)}
              readOnly={readOnly}
              register={(el) => {
                if (el) els.current.set(b.id, el);
                else els.current.delete(b.id);
              }}
              mustSet={() => {
                const f = force.current.has(b.id);
                force.current.delete(b.id);
                return f;
              }}
              onInput={(el) => onInput(b, el)}
              onKeyDown={(el, e) => onKeyDown(b, el, e)}
              onPaste={(el, e) => onPaste(b, el, e)}
              onFocus={() => setFocused(b.id)}
              onBlur={() => setTimeout(() => setFocused((f) => (f === b.id ? null : f)), 150)}
              patch={(p) => patch(b.id, p)}
              special={renderSpecial}
            />
          </div>
        ))}
        {drag && drag.over === blocks.length && <div className="be-drop" />}
        {!readOnly && (
          <button
            className="block w-full min-h-[64px] cursor-text"
            aria-label={L('Добавить блок', 'Add block')}
            onClick={() => {
              const last = blocksRef.current[blocksRef.current.length - 1];
              if (last && isTextBlock(last.type) && !plain(last.html).trim()) {
                const el = els.current.get(last.id);
                if (el) setCaret(el, 'end');
              } else insertAfter(null, [newBlock('p')]);
            }}
          />
        )}
      </div>

      {popup && (popup.kind === 'slash' ? menuItems.length > 0 : mentionItems.length > 0) &&
        createPortal(
          <div className="be-pop" style={{ left: Math.min(popup.x, window.innerWidth - 270), top: Math.min(popup.y, window.innerHeight - 300) }} onMouseDown={(e) => e.preventDefault()}>
            {popup.kind === 'slash'
              ? menuItems.map((m, k) => (
                  <button key={m.type} className={`be-pop-item ${k === popup.sel ? 'be-pop-on' : ''}`} onClick={() => applyPick(m)}>
                    <span className="be-pop-ic"><Icon name={m.icon} size={15} /></span>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block text-[13.5px]">{m.label}</span>
                      <span className="block text-[11px] text-dim truncate">{m.hint}</span>
                    </span>
                  </button>
                ))
              : mentionItems.map((p, k) => (
                  <button key={p.id} className={`be-pop-item ${k === popup.sel ? 'be-pop-on' : ''}`} onClick={() => applyMention(p)}>
                    <span className="be-pop-ic" style={{ color: p.icon?.color }}><Icon name={p.icon?.name || 'file'} size={15} /></span>
                    <span className="text-[13.5px] truncate text-left">{p.title || L('Без названия', 'Untitled')}</span>
                  </button>
                ))}
          </div>,
          document.body,
        )}

      {!readOnly && <FormatBar mobile={coarse} focused={focused} onMenu={() => focused && setMenuFor(focused)} onIndent={(d) => {
        const b = blocksRef.current.find((x) => x.id === focused);
        if (b) patch(b.id, { indent: clamp((b.indent || 0) + d, 0, 4) });
      }} onChanged={() => {
        const id = focused || [...els.current.entries()].find(([, el]) => el.contains(getSelection()?.anchorNode || null))?.[0];
        const el = id ? els.current.get(id) : undefined;
        if (id && el) patch(id, { html: sanitizeHtml(el.innerHTML) });
      }} />}

      <Modal open={!!menuBlock} onClose={() => setMenuFor(null)} title={L('Блок', 'Block')}>
        {menuBlock && (
          <div className="space-y-4">
            {isTextBlock(menuBlock.type) && (
              <div>
                <div className="label mb-1.5 ml-1">{L('Превратить в', 'Turn into')}</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {BLOCK_MENU().filter((m) => TURN_INTO.includes(m.type)).map((m) => (
                    <button key={m.type} className={`chip !justify-start ${menuBlock.type === m.type ? 'chip-on' : ''}`} onClick={() => {
                      turnInto(menuBlock.id, m.type);
                      setMenuFor(null);
                    }}>
                      <Icon name={m.icon} size={13} /> {m.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <div className="label mb-1.5 ml-1">{L('Фон блока', 'Block background')}</div>
              <div className="flex flex-wrap gap-2">
                <button className={`w-8 h-8 rounded-full border border-line grid place-items-center ${!menuBlock.color ? 'ring-2 ring-[var(--accent-1)]' : ''}`} onClick={() => patch(menuBlock.id, { color: undefined })} aria-label={L('Без цвета', 'No color')}>
                  <Icon name="x" size={12} />
                </button>
                {Object.entries(BLOCK_COLORS).map(([k, c]) => (
                  <button key={k} aria-label={k} className={`w-8 h-8 rounded-full border border-line ${menuBlock.color === k ? 'ring-2 ring-[var(--accent-1)]' : ''}`} style={{ background: c }} onClick={() => patch(menuBlock.id, { color: k })} />
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button className="chip" onClick={() => move(menuBlock.id, -1)}><Icon name="up" size={13} /> {L('Выше', 'Up')}</button>
              <button className="chip" onClick={() => move(menuBlock.id, 1)}><Icon name="down" size={13} /> {L('Ниже', 'Down')}</button>
              <button className="chip" onClick={() => {
                insertAfter(menuBlock.id, cloneBlocks([menuBlock]), false);
                setMenuFor(null);
              }}><Icon name="copy" size={13} /> {L('Дублировать', 'Duplicate')}</button>
              <button className="chip text-blood" onClick={() => {
                remove(menuBlock.id);
                setMenuFor(null);
              }}><Icon name="trash" size={13} /> {L('Удалить', 'Delete')}</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function isFirstLine(el: HTMLElement) {
  const r = getSelection()?.getRangeAt(0).getBoundingClientRect();
  const box = el.getBoundingClientRect();
  return !r || !r.height || r.top - box.top < 18;
}
function isLastLine(el: HTMLElement) {
  const r = getSelection()?.getRangeAt(0).getBoundingClientRect();
  const box = el.getBoundingClientRect();
  return !r || !r.height || box.bottom - r.bottom < 18;
}

// ───── один блок ─────
function Editable({
  html,
  className,
  placeholder,
  always,
  register,
  mustSet,
  readOnly,
  onInput,
  onKeyDown,
  onPaste,
  onFocus,
  onBlur,
}: {
  html: string;
  className: string;
  placeholder: string;
  always?: boolean;
  register?: (el: HTMLElement | null) => void;
  mustSet?: () => boolean;
  readOnly?: boolean;
  onInput?: (el: HTMLElement) => void;
  onKeyDown?: (el: HTMLElement, e: KeyboardEvent) => void;
  onPaste?: (el: HTMLElement, e: ClipboardEvent) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const must = mustSet?.() || false;
    if ((must || document.activeElement !== el) && el.innerHTML !== html) el.innerHTML = html;
  });
  useLayoutEffect(() => {
    register?.(ref.current);
    return () => register?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div
      ref={ref}
      className={`be-text ${className}`}
      contentEditable={!readOnly}
      suppressContentEditableWarning
      spellCheck
      data-ph={placeholder}
      data-always={always ? '' : undefined}
      onInput={(e) => onInput?.(e.currentTarget)}
      onKeyDown={(e) => onKeyDown?.(e.currentTarget, e)}
      onPaste={(e) => onPaste?.(e.currentTarget, e)}
      onFocus={onFocus}
      onBlur={onBlur}
    />
  );
}

function BlockView({
  b,
  num,
  readOnly,
  register,
  mustSet,
  onInput,
  onKeyDown,
  onPaste,
  onFocus,
  onBlur,
  patch,
  special,
}: {
  b: Block;
  num?: number;
  readOnly?: boolean;
  register: (el: HTMLElement | null) => void;
  mustSet: () => boolean;
  onInput: (el: HTMLElement) => void;
  onKeyDown: (el: HTMLElement, e: KeyboardEvent) => void;
  onPaste: (el: HTMLElement, e: ClipboardEvent) => void;
  onFocus: () => void;
  onBlur: () => void;
  patch: (p: Partial<Block>) => void;
  special?: (b: Block) => ReactNode;
}) {
  const bg = b.color && b.type !== 'callout' ? BLOCK_COLORS[b.color] : undefined;
  const ed = (className: string, placeholder: string, always?: boolean) => (
    <Editable html={b.html} className={className} placeholder={placeholder} always={always} register={register} mustSet={mustSet} readOnly={readOnly} onInput={onInput} onKeyDown={onKeyDown} onPaste={onPaste} onFocus={onFocus} onBlur={onBlur} />
  );
  const ph = L('Пиши или «/» для команд', "Type or '/' for commands");
  let body: ReactNode;
  switch (b.type) {
    case 'h1':
      body = ed('be-h1', L('Заголовок 1', 'Heading 1'), true);
      break;
    case 'h2':
      body = ed('be-h2', L('Заголовок 2', 'Heading 2'), true);
      break;
    case 'h3':
      body = ed('be-h3', L('Заголовок 3', 'Heading 3'), true);
      break;
    case 'bullet':
      body = (
        <div className="flex gap-2">
          <span className="be-mark">{['•', '◦', '▪'][(b.indent || 0) % 3]}</span>
          {ed('flex-1', L('Пункт списка', 'List item'), true)}
        </div>
      );
      break;
    case 'number':
      body = (
        <div className="flex gap-2">
          <span className="be-mark be-num">{num || 1}.</span>
          {ed('flex-1', L('Пункт списка', 'List item'), true)}
        </div>
      );
      break;
    case 'todo':
      body = (
        <div className="flex gap-2 items-start">
          <button className={`be-check ${b.checked ? 'be-check-on' : ''}`} role="checkbox" aria-checked={!!b.checked} onClick={() => !readOnly && patch({ checked: !b.checked })}>
            {b.checked && <Icon name="check" size={12} />}
          </button>
          {ed(`flex-1 ${b.checked ? 'line-through text-dim' : ''}`, 'To-do', true)}
        </div>
      );
      break;
    case 'toggle':
      body = (
        <div>
          <div className="flex gap-1 items-start">
            <button className="be-mark be-tog" aria-expanded={!!b.open} onClick={() => patch({ open: !b.open })}>
              <Icon name={b.open ? 'down' : 'right'} size={13} />
            </button>
            {ed('flex-1 font-medium', L('Раскрывающийся блок', 'Toggle'), true)}
          </div>
          {b.open && <ToggleBody b={b} readOnly={readOnly} patch={patch} />}
        </div>
      );
      break;
    case 'quote':
      body = <div className="be-quote">{ed('', L('Цитата', 'Quote'), true)}</div>;
      break;
    case 'callout':
      body = (
        <div className="be-callout" style={{ background: BLOCK_COLORS[b.color || 'yellow'] || BLOCK_COLORS.yellow }}>
          <button className="shrink-0 mt-0.5" onClick={() => {
            if (readOnly) return;
            const order = ['bulb', 'alert', 'star', 'flame', 'pin', 'note', 'check'];
            patch({ icon: order[(order.indexOf(b.icon || 'bulb') + 1) % order.length] });
          }} aria-label={L('Сменить иконку', 'Change icon')}>
            <Icon name={b.icon || 'bulb'} size={18} />
          </button>
          {ed('flex-1', 'Callout', true)}
        </div>
      );
      break;
    case 'divider':
      body = <hr className="be-hr" />;
      break;
    case 'image':
      body = <ImageBlock b={b} readOnly={readOnly} patch={patch} />;
      break;
    case 'embed':
    case 'bookmark':
      body = <LinkBlock b={b} readOnly={readOnly} patch={patch} />;
      break;
    case 'table':
      body = <TableBlock b={b} readOnly={readOnly} patch={patch} />;
      break;
    case 'ideas':
    case 'notes':
      body = special?.(b) ?? null;
      break;
    default:
      body = ed('', ph);
  }
  return (
    <div className="be-block flex-1 min-w-0" style={bg ? { background: bg, borderRadius: 8, padding: '2px 8px' } : undefined}>
      {body}
    </div>
  );
}

function ToggleBody({ b, readOnly, patch }: { b: Block; readOnly?: boolean; patch: (p: Partial<Block>) => void }) {
  return (
    <div className="pl-6 mt-0.5">
      <Editable
        html={b.body || ''}
        className="text-muted"
        placeholder={L('Содержимое (Shift+Enter — новая строка)', 'Content (Shift+Enter for a new line)')}
        always
        readOnly={readOnly}
        onInput={(el) => patch({ body: sanitizeHtml(el.innerHTML) })}
        onKeyDown={(_el, e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            exec('insertLineBreak');
          }
        }}
      />
    </div>
  );
}

function ImageBlock({ b, readOnly, patch }: { b: Block; readOnly?: boolean; patch: (p: Partial<Block>) => void }) {
  if (!b.blobId)
    return readOnly ? null : (
      <ImagePick onPicked={(blobId) => patch({ blobId })} className="be-empty">
        <Icon name="image" size={16} /> {L('Загрузить картинку (сжимается до 1600 px)', 'Upload an image (resized to 1600 px)')}
      </ImagePick>
    );
  return (
    <figure className="my-1">
      <BlobImg id={b.blobId} className="rounded-xl max-h-[520px] w-auto max-w-full object-contain" />
      <input
        className="be-caption"
        value={b.caption || ''}
        readOnly={readOnly}
        placeholder={L('Подпись', 'Caption')}
        onChange={(e) => patch({ caption: e.target.value })}
      />
    </figure>
  );
}

function LinkBlock({ b, readOnly, patch }: { b: Block; readOnly?: boolean; patch: (p: Partial<Block>) => void }) {
  const [url, setUrl] = useState(b.url || '');
  const [play, setPlay] = useState(false);
  const yt = youtubeId(b.url);
  useEffect(() => {
    if (!b.url || b.preview?.title) return;
    let alive = true;
    void fetchPreview(b.url).then((p) => {
      if (alive && (p.title || p.image)) patch({ preview: { title: p.title, image: p.image, site: p.site } });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b.url]);
  if (!b.url)
    return readOnly ? null : (
      <form
        className="be-empty !p-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (isUrl(url)) patch({ url: url.trim(), type: youtubeId(url) ? 'embed' : b.type });
        }}
      >
        <Icon name={b.type === 'embed' ? 'youtube' : 'link'} size={16} />
        <input className="flex-1 bg-transparent outline-none text-[14px]" placeholder={b.type === 'embed' ? L('Ссылка на YouTube', 'YouTube link') : L('Вставь ссылку', 'Paste a link')} value={url} onChange={(e) => setUrl(e.target.value)} />
        <button className="btn btn-xs" type="submit">OK</button>
      </form>
    );
  if (b.type === 'embed' && yt)
    return (
      <div className="be-embed">
        {play ? (
          <iframe className="absolute inset-0 w-full h-full" src={`https://www.youtube-nocookie.com/embed/${yt}?autoplay=1`} title="YouTube" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen loading="lazy" />
        ) : (
          <button className="absolute inset-0 w-full h-full group" onClick={() => setPlay(true)} aria-label="Play">
            <img src={`https://i.ytimg.com/vi/${yt}/hqdefault.jpg`} alt="" loading="lazy" className="w-full h-full object-cover" onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')} />
            <span className="absolute inset-0 grid place-items-center">
              <span className="w-14 h-10 rounded-xl bg-[#ff0033] text-white grid place-items-center shadow-lg group-hover:scale-105 transition-transform">
                <Icon name="play" size={18} />
              </span>
            </span>
            {b.preview?.title && <span className="absolute left-0 right-0 bottom-0 p-3 text-left text-[13px] font-semibold text-white bg-gradient-to-t from-black/80 to-transparent">{b.preview.title}</span>}
          </button>
        )}
      </div>
    );
  return (
    <a className="be-bookmark" href={b.url} target="_blank" rel="noopener noreferrer">
      <span className="min-w-0 flex-1 p-3">
        <span className="block text-[14px] truncate">{b.preview?.title || hostOf(b.url)}</span>
        {b.preview?.site && <span className="block text-[12px] text-dim truncate mt-0.5">{b.preview.site}</span>}
        <span className="flex items-center gap-1.5 text-[12px] text-muted mt-2 min-w-0">
          {yt ? <Icon name="youtube" size={13} className="text-[#ff0033] shrink-0" /> : <Icon name="link" size={12} className="shrink-0" />}
          <span className="truncate">{b.url}</span>
        </span>
      </span>
      {b.preview?.image && <img src={b.preview.image} alt="" loading="lazy" className="w-[34%] max-w-[240px] object-cover shrink-0" onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')} />}
    </a>
  );
}

function TableBlock({ b, readOnly, patch }: { b: Block; readOnly?: boolean; patch: (p: Partial<Block>) => void }) {
  const rows = b.rows?.length ? b.rows : [['', ''], ['', '']];
  const set = (r: number, c: number, v: string) => patch({ rows: rows.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)) });
  const cols = Math.max(...rows.map((r) => r.length));
  return (
    <div className="scroll-x">
      <table className="be-table">
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {Array.from({ length: cols }, (_, c) => (
                <td key={c} className={r === 0 ? 'font-semibold' : ''}>
                  <input value={row[c] || ''} readOnly={readOnly} onChange={(e) => set(r, c, e.target.value)} aria-label={`R${r + 1}C${c + 1}`} />
                </td>
              ))}
              {!readOnly && (
                <td className="be-table-x">
                  <button aria-label={L('Удалить строку', 'Delete row')} onClick={() => rows.length > 1 && patch({ rows: rows.filter((_, i) => i !== r) })}>
                    <Icon name="x" size={11} />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {!readOnly && (
        <div className="flex gap-2 mt-1">
          <button className="chip !text-[11.5px]" onClick={() => patch({ rows: [...rows, Array(cols).fill('')] })}>+ {L('строка', 'row')}</button>
          <button className="chip !text-[11.5px]" onClick={() => patch({ rows: rows.map((r) => [...r, '']) })}>+ {L('столбец', 'column')}</button>
          {cols > 1 && <button className="chip !text-[11.5px]" onClick={() => patch({ rows: rows.map((r) => r.slice(0, cols - 1)) })}>− {L('столбец', 'column')}</button>}
        </div>
      )}
    </div>
  );
}

// ───── панель форматирования ─────
function FormatBar({ mobile, focused, onChanged, onMenu, onIndent }: { mobile: boolean; focused: string | null; onChanged: () => void; onMenu: () => void; onIndent: (d: number) => void }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [kb, setKb] = useState(0);
  const [colors, setColors] = useState(false);
  useEffect(() => {
    const onSel = () => {
      const sel = getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return setRect(null);
      const node = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement;
      if (!node?.closest('.be-text')) return setRect(null);
      setRect(sel.getRangeAt(0).getBoundingClientRect());
    };
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, []);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv || !mobile) return;
    const upd = () => setKb(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    upd();
    vv.addEventListener('resize', upd);
    vv.addEventListener('scroll', upd);
    return () => {
      vv.removeEventListener('resize', upd);
      vv.removeEventListener('scroll', upd);
    };
  }, [mobile]);
  const run = (cmd: string, val?: string) => {
    exec(cmd, val);
    onChanged();
  };
  const link = () => {
    const url = window.prompt(L('Ссылка (https://…)', 'Link (https://…)'), 'https://');
    if (url && /^(https?:|mailto:)/i.test(url)) run('createLink', url);
  };
  const buttons = (
    <>
      <button title="Bold (Ctrl+B)" onClick={() => run('bold')}><Icon name="bold" size={15} /></button>
      <button title="Italic (Ctrl+I)" onClick={() => run('italic')}><Icon name="italic" size={15} /></button>
      <button title="Underline (Ctrl+U)" onClick={() => run('underline')}><Icon name="underline" size={15} /></button>
      <button title="Strike" onClick={() => run('strikeThrough')}><Icon name="strike" size={15} /></button>
      <button title="Link (Ctrl+K)" onClick={link}><Icon name="link" size={15} /></button>
      <button title={L('Выделение цветом', 'Highlight')} onClick={() => setColors((c) => !c)}><Icon name="highlight" size={15} /></button>
      {colors && (
        <span className="flex items-center gap-1 px-1">
          {HILITE.map((c) => (
            <button key={c} aria-label={c} className="!w-6 !h-6 !min-w-0 rounded-full" style={{ background: c }} onClick={() => run('hiliteColor', c)} />
          ))}
          <button aria-label={L('Убрать', 'Clear')} className="!w-6 !h-6 !min-w-0 rounded-full border border-line" onClick={() => run('hiliteColor', 'transparent')}>
            <Icon name="x" size={10} />
          </button>
        </span>
      )}
    </>
  );
  if (mobile) {
    if (!focused) return null;
    return createPortal(
      <div className="be-kbbar" style={{ bottom: kb }} onMouseDown={(e) => e.preventDefault()} onPointerDown={(e) => e.preventDefault()}>
        <button title={L('Блок', 'Block')} onClick={onMenu}><Icon name="more" size={16} /></button>
        {buttons}
        <button title={L('Отступ', 'Indent')} onClick={() => onIndent(1)}><Icon name="indent" size={15} /></button>
        <button title={L('Убрать отступ', 'Outdent')} onClick={() => onIndent(-1)}><Icon name="outdent" size={15} /></button>
        <button title={L('Скрыть клавиатуру', 'Hide keyboard')} className="ml-auto" onClick={() => (document.activeElement as HTMLElement | null)?.blur()}><Icon name="kbdhide" size={16} /></button>
      </div>,
      document.body,
    );
  }
  if (!rect) return null;
  return createPortal(
    <div className="be-float" style={{ left: clamp(rect.left + rect.width / 2 - 140, 8, window.innerWidth - 300), top: Math.max(8, rect.top - 46) }} onMouseDown={(e) => e.preventDefault()}>
      {buttons}
    </div>,
    document.body,
  );
}
