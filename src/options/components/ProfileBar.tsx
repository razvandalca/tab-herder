import { useState } from 'preact/hooks';
import type { Settings } from '@/shared/types';
import { newId } from '@/shared/defaults';
import {
  createProfile,
  deleteProfile,
  duplicateProfile,
  profileRules,
  renameProfile,
  switchProfile,
} from '@/core/profiles';

interface Props {
  settings: Settings;
  save: (s: Settings) => Promise<void>;
  notify: (m: string) => void;
  /** Profile whose rules are shown below (may differ from the active one). */
  selectedId: string;
  select: (id: string) => void;
}

/** Create / rename / duplicate / delete / activate rule profiles. */
export function ProfileBar({ settings, save, notify, selectedId, select }: Props) {
  const [naming, setNaming] = useState<'new' | 'rename' | null>(null);
  const [name, setName] = useState('');
  const selected = settings.profiles.find((p) => p.id === selectedId) ?? settings.profiles[0]!;
  const isActive = selected.id === settings.activeProfileId;

  const startNaming = (kind: 'new' | 'rename') => {
    setNaming(kind);
    setName(kind === 'rename' ? selected.name : '');
  };

  const submit = async () => {
    if (!name.trim()) return;
    if (naming === 'new') {
      const id = newId();
      await save(createProfile(settings, name, id));
      select(id);
      notify(`Created profile ${name.trim()}`);
    } else {
      await save(renameProfile(settings, selected.id, name));
    }
    setNaming(null);
  };

  const duplicate = async () => {
    const id = newId();
    await save(duplicateProfile(settings, selected.id, id, newId));
    select(id);
    notify(`Duplicated ${selected.name}`);
  };

  const remove = async () => {
    if (!confirm(`Delete profile "${selected.name}" and its ${profileRules(settings, selected.id).length} rules?`))
      return;
    const next = deleteProfile(settings, selected.id);
    await save(next);
    select(next.activeProfileId);
    notify(`Deleted profile ${selected.name}`);
  };

  const activate = async () => {
    await save(switchProfile(settings, selected.id));
    notify(`${selected.name} is now active. Use "Group now" to regroup with its rules.`);
  };

  return (
    <section class="card" aria-label="Rule profiles">
      <div class="row between" style="flex-wrap: wrap; gap: 8px">
        <div>
          <h2>Profiles</h2>
          <div class="hint">
            Separate rule sets, e.g. Work and Personal. Only the active profile's rules are used; other settings are
            shared.
          </div>
        </div>
      </div>
      <div class="row" style="flex-wrap: wrap; gap: 6px">
        <select
          class="input"
          style="width: auto; min-width: 160px"
          aria-label="Profile to edit"
          value={selected.id}
          onChange={(e) => {
            setNaming(null);
            select((e.target as HTMLSelectElement).value);
          }}
        >
          {settings.profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.id === settings.activeProfileId ? ' (active)' : ''}
            </option>
          ))}
        </select>
        {isActive ? (
          <span class="badge">Active</span>
        ) : (
          <button type="button" class="btn sm primary" onClick={() => void activate()}>
            Make active
          </button>
        )}
        <button type="button" class="btn sm" onClick={() => startNaming('new')}>
          New
        </button>
        <button type="button" class="btn sm" onClick={() => startNaming('rename')}>
          Rename
        </button>
        <button type="button" class="btn sm" onClick={() => void duplicate()}>
          Duplicate
        </button>
        <button
          type="button"
          class="btn sm danger"
          disabled={settings.profiles.length <= 1}
          title={settings.profiles.length <= 1 ? 'The last profile cannot be deleted' : undefined}
          onClick={() => void remove()}
        >
          Delete
        </button>
      </div>
      {naming && (
        <form
          class="inline-form"
          style="padding: 0"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <input
            class="input sm grow"
            aria-label={naming === 'new' ? 'New profile name' : 'Profile name'}
            placeholder={naming === 'new' ? 'New profile name, e.g. Work' : 'Profile name'}
            value={name}
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
            autoFocus
          />
          <button class="btn sm primary" type="submit">
            {naming === 'new' ? 'Create' : 'Rename'}
          </button>
          <button type="button" class="btn sm" onClick={() => setNaming(null)}>
            Cancel
          </button>
        </form>
      )}
    </section>
  );
}
