import { useState } from 'preact/hooks';
import { send } from '@/shared/messages';
import type { Runner } from '../App';

export function QuickActions({ run, currentWindowId }: { run: Runner; currentWindowId: number }) {
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');

  const save = async () => {
    await run('Session saved', () => send({ type: 'saveSession', kind: 'window', windowId: currentWindowId, name }));
    setSaving(false);
    setName('');
  };

  return (
    <div class="stack">
      <div class="quick">
        <button class="btn primary" onClick={() => run('Tabs grouped', () => send({ type: 'groupNow' }))}>Group now</button>
        <button class="btn" onClick={() => run('Cleaned up', async () => {
          const r = await send<{ closed: number; discarded: number }>({ type: 'cleanupNow' });
          return `closed ${r.closed}, discarded ${r.discarded}`;
        })}>Clean up</button>
        <button class="btn" onClick={() => run('Duplicates closed', () => send({ type: 'closeDuplicates' }))}>Close duplicates</button>
        <button class="btn" onClick={() => setSaving((s) => !s)} aria-expanded={saving}>Save session</button>
      </div>
      {saving && (
        <form class="inline-form" style="padding: 0" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <input class="input sm grow" placeholder="Session name (this window)" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} autoFocus />
          <button class="btn sm primary" type="submit">Save</button>
          <button class="btn sm" type="button" onClick={() => setSaving(false)}>Cancel</button>
        </form>
      )}
    </div>
  );
}
