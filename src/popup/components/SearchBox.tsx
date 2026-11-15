import { useEffect, useRef } from 'preact/hooks';
import { Icons } from '@/ui/icons';

export function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div class="row" style="position: relative">
      <span style="position: absolute; left: 9px; top: 7px; color: var(--fg-3)"><Icons.search /></span>
      <input
        ref={ref}
        class="input"
        style="padding-left: 28px"
        type="search"
        placeholder="Search open tabs…"
        aria-label="Search open tabs"
        value={value}
        onInput={(e) => onChange((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onChange('');
        }}
      />
    </div>
  );
}
