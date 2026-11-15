import { useState } from 'preact/hooks';
import { hostname } from '@/core/url';
import { Icons } from '@/ui/icons';

export function Allowlist({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState('');
  const add = (e: Event) => {
    e.preventDefault();
    const raw = text.trim().toLowerCase();
    if (!raw) return;
    const host = raw.includes('://') ? hostname(raw) : raw.replace(/^www\./, '').split('/')[0];
    if (!host || value.includes(host)) return setText('');
    onChange([...value, host]);
    setText('');
  };
  return (
    <div class="stack">
      <form class="row" onSubmit={add}>
        <input class="input grow" placeholder="example.com" value={text} onInput={(e) => setText((e.target as HTMLInputElement).value)} />
        <button class="btn" type="submit">Add</button>
      </form>
      <div class="chips">
        {value.map((d) => (
          <span class="chip" key={d}>
            {d}
            <button type="button" aria-label={`Remove ${d}`} onClick={() => onChange(value.filter((x) => x !== d))}><Icons.x /></button>
          </span>
        ))}
        {value.length === 0 && <span class="muted small">Empty</span>}
      </div>
    </div>
  );
}
