// Выбор предмета из списка или создание нового прямо на месте.
import { useState } from 'react';
import { db, type Subject } from '../db/schema';
import { useLive } from '../lib/hooks';
import { L, uid } from '../lib/runtime';
import { IBtn } from './ui';

const PALETTE = ['#0a84ff', '#30d5c8', '#ff9f0a', '#bf5af2', '#ff375f', '#34c759', '#5e5ce6', '#ffd60a', '#64d2ff', '#ff6482'];

export function SubjectPicker({ value, onChange, onCreated }: { value?: string; onChange: (id: string | undefined, s?: Subject) => void; onCreated?: (s: Subject) => void }) {
  const subjects = useLive(() => db.subjects.toArray(), []) || [];
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const create = async () => {
    const n = name.trim();
    if (!n) return;
    const found = subjects.find((s) => s.name.toLowerCase() === n.toLowerCase());
    const s = found || { id: uid(), name: n, color: PALETTE[subjects.length % PALETTE.length] };
    if (!found) await db.subjects.put(s);
    onChange(s.id, s);
    onCreated?.(s);
    setAdding(false);
    setName('');
  };
  if (adding)
    return (
      <div className="flex gap-2">
        <input
          className="inp"
          autoFocus
          value={name}
          placeholder={L('Название предмета', 'Subject name')}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void create();
            }
            if (e.key === 'Escape') setAdding(false);
          }}
        />
        <IBtn icon="check" title={L('Создать', 'Create')} onClick={create} />
        <IBtn icon="x" title={L('Отмена', 'Cancel')} onClick={() => setAdding(false)} />
      </div>
    );
  return (
    <select
      className="inp"
      value={value || ''}
      onChange={(e) => {
        if (e.target.value === '__new') setAdding(true);
        else onChange(e.target.value || undefined, subjects.find((s) => s.id === e.target.value));
      }}
    >
      <option value="">—</option>
      {subjects.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
      <option value="__new">＋ {L('Новый предмет…', 'New subject…')}</option>
    </select>
  );
}
