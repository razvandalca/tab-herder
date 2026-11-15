import { useState } from 'preact/hooks';
import type { MatchType, Rule } from '@/shared/types';
import { newId } from '@/shared/defaults';
import { validatePattern } from '@/core/rules';
import { ColorPicker } from '@/ui/ColorPicker';

interface Props {
  rule?: Rule;
  onSave: (r: Rule) => void;
  onCancel: () => void;
}

const TYPE_HINTS: Record<MatchType, string> = {
  domain: 'e.g. github.com — matches github.com and every subdomain',
  glob: 'e.g. *://*.github.com/pulls* — Chrome match-pattern style; scheme optional',
  regex: 'e.g. ^https://(www\\.)?example\\.(com|org)/ — tested against the full URL, case-insensitive',
  title: 'e.g. jira, ticket — comma-separated keywords matched against the tab title',
};

export function RuleForm({ rule, onSave, onCancel }: Props) {
  const [draft, setDraft] = useState<Rule>(
    rule ?? { id: newId(), name: '', color: 'auto', matchType: 'domain', pattern: '', enabled: true },
  );
  const [error, setError] = useState<string | null>(null);
  const update = (patch: Partial<Rule>) => setDraft((d) => ({ ...d, ...patch }));

  const submit = (e: Event) => {
    e.preventDefault();
    const name = draft.name.trim();
    if (!name) return setError('Group name is required');
    const err = validatePattern(draft.matchType, draft.pattern);
    if (err) return setError(err);
    onSave({ ...draft, name, pattern: draft.pattern.trim(), autoCloseMinutes: draft.autoCloseMinutes || undefined });
  };

  return (
    <form class="card" style="background: var(--bg-2)" onSubmit={submit}>
      <div class="grid2">
        <label class="field">
          <span>Group name</span>
          <input
            class="input"
            value={draft.name}
            onInput={(e) => update({ name: (e.target as HTMLInputElement).value })}
            placeholder="Dev"
            autoFocus
          />
        </label>
        <label class="field">
          <span>Match type</span>
          <select
            class="input"
            value={draft.matchType}
            onChange={(e) => update({ matchType: (e.target as HTMLSelectElement).value as MatchType })}
          >
            <option value="domain">Domain</option>
            <option value="glob">URL glob</option>
            <option value="regex">URL regex</option>
            <option value="title">Title keyword</option>
          </select>
        </label>
      </div>
      <label class="field">
        <span>Pattern</span>
        <input
          class="input"
          value={draft.pattern}
          onInput={(e) => update({ pattern: (e.target as HTMLInputElement).value })}
          spellcheck={false}
        />
        <span class="hint">{TYPE_HINTS[draft.matchType]}</span>
      </label>
      <div class="grid2">
        <div class="field">
          <span>Colour</span>
          <ColorPicker value={draft.color} allowAuto onChange={(c) => update({ color: c })} />
        </div>
        <label class="field">
          <span>Auto-close group after (minutes of inactivity)</span>
          <input
            class="input"
            type="number"
            min={0}
            value={draft.autoCloseMinutes ?? 0}
            onInput={(e) =>
              update({ autoCloseMinutes: Math.max(0, Number((e.target as HTMLInputElement).value) || 0) })
            }
          />
          <span class="hint">0 = never. Tabs are saved to “Recently cleaned” first.</span>
        </label>
      </div>
      {error && <div style="color: var(--danger)">{error}</div>}
      <div class="row">
        <button class="btn primary" type="submit">
          {rule ? 'Save' : 'Add rule'}
        </button>
        <button class="btn" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
