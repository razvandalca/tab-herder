import { useState } from 'preact/hooks';
import type { ExportFile, LocalState, Settings } from '@/shared/types';
import { send } from '@/shared/messages';
import { normalizeProfiles } from '@/core/profiles';
import type { PanelProps } from '../App';

interface Props extends PanelProps {
  settings: Settings;
  local: LocalState;
}

function download(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const stamp = () => new Date().toISOString().slice(0, 10);

export function ImportExport({ settings, local, notify, fail }: Props) {
  const [rulesMode, setRulesMode] = useState<'replace' | 'append'>('append');

  const exportAll = () => download(`tab-herder-${stamp()}.json`, { version: 2, exportedAt: Date.now(), settings: normalizeProfiles(settings), sessions: local.sessions } satisfies ExportFile);
  const exportRules = () => download(`tab-herder-rules-${stamp()}.json`, { version: 2, exportedAt: Date.now(), settings: normalizeProfiles(settings) } satisfies ExportFile);
  const exportSessions = () => download(`tab-herder-sessions-${stamp()}.json`, { version: 2, exportedAt: Date.now(), sessions: local.sessions } satisfies ExportFile);

  const importFile = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text()) as ExportFile;
      const r = await send<{ rules: number; sessions: number }>({ type: 'importData', data, rulesMode });
      notify(`Imported ${r.rules} rules and ${r.sessions} sessions`);
    } catch (err) {
      fail(err);
    }
  };

  return (
    <section>
      <div class="card">
        <h2>Export</h2>
        <div class="hint">Plain JSON files. Settings include rule profiles, cleanup options and the allowlist.</div>
        <div class="row" style="flex-wrap: wrap">
          <button class="btn primary" onClick={exportAll}>Export everything</button>
          <button class="btn" onClick={exportRules}>Export settings &amp; rules</button>
          <button class="btn" onClick={exportSessions}>Export sessions</button>
        </div>
      </div>
      <div class="card">
        <h2>Import</h2>
        <div class="field">
          <span>When the file contains rules</span>
          <label class="check"><input type="radio" name="rulesMode" checked={rulesMode === 'append'} onChange={() => setRulesMode('append')} /><span>Append to my rules (skip duplicates by id; profiles with a new id are added)</span></label>
          <label class="check"><input type="radio" name="rulesMode" checked={rulesMode === 'replace'} onChange={() => setRulesMode('replace')} /><span>Replace my rules (and profiles, if the file has them)</span></label>
        </div>
        <div class="hint">Other settings in the file overwrite the current ones. Sessions are always appended.</div>
        <label class="btn" style="align-self: flex-start">
          Choose file…
          <input type="file" accept="application/json,.json" style="display: none" onChange={(e) => void importFile(e)} />
        </label>
      </div>
    </section>
  );
}
