import { useEffect, useMemo, useState } from 'preact/hooks';
import { buildCommands, searchCommands, type PaletteMatch } from '@/core/palette';
import { send } from '@/shared/messages';
import type { GroupSnapshot } from '@/shared/types';
import type { Runner } from '../App';

interface Options {
  /** Text after `>`, or null when not in palette mode. */
  query: string | null;
  groups: GroupSnapshot[];
  currentWindowId: number;
  run: Runner;
  /** Called after a command ran, to leave palette mode. */
  exit: () => void;
}

/** State + keyboard handling for the `>` command palette in the popup search box. */
export function usePalette({ query, groups, currentWindowId, run, exit }: Options) {
  const commands = useMemo(() => buildCommands(groups, currentWindowId), [groups, currentWindowId]);
  const matches = useMemo(() => (query === null ? [] : searchCommands(query, commands)), [query, commands]);
  const [selected, setSelected] = useState(0);
  const [armed, setArmed] = useState<string | null>(null);

  useEffect(() => {
    setSelected(0);
    setArmed(null);
  }, [query]);

  const execute = (index: number) => {
    const m = matches[index];
    if (!m) return;
    if (m.command.confirm && armed !== m.command.id) {
      setSelected(index);
      setArmed(m.command.id);
      return;
    }
    setArmed(null);
    exit();
    void run(m.command.done, async () => {
      const r = await send(m.command.request(m.arg));
      if (m.command.id === 'cleanupNow') {
        const c = r as { closed: number; discarded: number };
        return `closed ${c.closed}, discarded ${c.discarded}`;
      }
      return r;
    });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (query === null) return;
    const n = matches.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!n) return;
      setArmed(null);
      setSelected((s) => (s + (e.key === 'ArrowDown' ? 1 : -1) + n) % n);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      execute(Math.min(selected, n - 1));
    }
  };

  const clamped = Math.min(selected, Math.max(0, matches.length - 1));
  return { active: query !== null, matches, selected: clamped, armed, execute, onKeyDown };
}

interface ListProps {
  matches: PaletteMatch[];
  selected: number;
  armed: string | null;
  execute: (index: number) => void;
}

export function CommandList({ matches, selected, armed, execute }: ListProps) {
  return (
    <div class="stack">
      <div class="list palette" role="listbox" aria-label="Commands">
        {matches.length === 0 && <div class="muted" style="padding: 8px">No matching commands</div>}
        {matches.map((m, i) => {
          const confirming = armed === m.command.id;
          return (
            <div
              key={m.command.id}
              role="option"
              aria-selected={i === selected}
              class={`item clickable ${i === selected ? 'selected' : ''}`}
              style={m.command.confirm ? 'color: var(--danger)' : ''}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => execute(i)}
            >
              <span class="grow ellipsis">{confirming ? m.command.confirm : m.label}</span>
            </div>
          );
        })}
      </div>
      <div class="muted small" style="padding: 0 8px">
        <span class="kbd">↑</span> <span class="kbd">↓</span> choose · <span class="kbd">Enter</span> run · <span class="kbd">Esc</span> back to tab search
      </div>
    </div>
  );
}
