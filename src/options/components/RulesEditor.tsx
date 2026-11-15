import { useMemo, useState } from 'preact/hooks';
import type { Rule, Settings } from '@/shared/types';
import { COLOR_HEX } from '@/core/colors';
import { assignGroup, resolveColor } from '@/core/rules';
import { PRESETS, rulesFromPreset } from '@/shared/presets';
import { Icons } from '@/ui/icons';
import { RuleForm } from './RuleForm';
import { ProfileBar } from './ProfileBar';
import { profileRules, setProfileRules } from '@/core/profiles';

interface Props {
  settings: Settings;
  save: (s: Settings) => Promise<void>;
  notify: (m: string) => void;
}

export function RulesEditor({ settings, save, notify }: Props) {
  const [profileId, setProfileId] = useState(settings.activeProfileId);
  const editingId = settings.profiles.some((p) => p.id === profileId) ? profileId : settings.activeProfileId;
  const rules = profileRules(settings, editingId);
  const profileName = settings.profiles.find((p) => p.id === editingId)?.name ?? '';
  const [editing, setEditing] = useState<Rule | 'new' | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [testUrl, setTestUrl] = useState('');
  const [testTitle, setTestTitle] = useState('');

  const setRules = (next: Rule[]) => save(setProfileRules(settings, editingId, next));

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= rules.length) return;
    const next = [...rules];
    const [r] = next.splice(from, 1);
    next.splice(to, 0, r!);
    void setRules(next);
  };

  const upsert = (rule: Rule) => {
    const idx = rules.findIndex((r) => r.id === rule.id);
    void setRules(idx === -1 ? [...rules, rule] : rules.map((r) => (r.id === rule.id ? rule : r)));
    setEditing(null);
  };

  const addPreset = (id: string) => {
    const preset = PRESETS.find((p) => p.id === id)!;
    const existing = new Set(rules.filter((r) => r.presetId === id).map((r) => `${r.matchType}:${r.pattern}`));
    const fresh = rulesFromPreset(preset).filter((r) => !existing.has(`${r.matchType}:${r.pattern}`));
    if (!fresh.length) return notify(`${preset.label} preset is already added`);
    void setRules([...rules, ...fresh]);
    notify(`Added ${fresh.length} ${preset.label} rules`);
  };

  const testResult = useMemo(() => {
    if (!testUrl.trim()) return null;
    const url = /^[a-z]+:\/\//i.test(testUrl) ? testUrl : `https://${testUrl}`;
    return assignGroup({ url, title: testTitle }, { ...settings, rules });
  }, [testUrl, testTitle, settings, rules]);

  return (
    <section>
      <ProfileBar settings={settings} save={save} notify={notify} selectedId={editingId} select={(id) => { setEditing(null); setProfileId(id); }} />
      <div class="card">
        <div class="row between">
          <div>
            <h2>Rules{settings.profiles.length > 1 ? ` · ${profileName}` : ''}</h2>
            <div class="hint">Checked top to bottom; the first match wins. Drag to reorder.</div>
          </div>
          <button class="btn primary" onClick={() => setEditing('new')}>Add rule</button>
        </div>
        {editing === 'new' && <RuleForm onSave={upsert} onCancel={() => setEditing(null)} />}
        {rules.length === 0 && <div class="muted">No rules yet. Add one, or start from a preset below.</div>}
        <div class="stack" role="list" aria-label="Rules">
          {rules.map((rule, i) => (
            <div key={rule.id} role="listitem">
              {editing !== 'new' && editing?.id === rule.id ? (
                <RuleForm rule={rule} onSave={upsert} onCancel={() => setEditing(null)} />
              ) : (
                <div
                  class={`rule ${!rule.enabled ? 'disabled' : ''} ${dragIdx === i ? 'dragging' : ''} ${overIdx === i ? 'over' : ''}`}
                  draggable
                  onDragStart={(e) => { setDragIdx(i); e.dataTransfer?.setData('text/plain', String(i)); }}
                  onDragOver={(e) => { e.preventDefault(); setOverIdx(i); }}
                  onDragLeave={() => setOverIdx((o) => (o === i ? null : o))}
                  onDrop={(e) => { e.preventDefault(); if (dragIdx !== null) move(dragIdx, i); setDragIdx(null); setOverIdx(null); }}
                  onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
                >
                  <span class="handle" title="Drag to reorder" aria-hidden="true"><Icons.grip /></span>
                  <input type="checkbox" checked={rule.enabled} title="Enabled" aria-label={`Enable rule ${rule.name}`} onChange={(e) => upsert({ ...rule, enabled: (e.target as HTMLInputElement).checked })} />
                  <div class="meta">
                    <span class="dot" style={{ background: COLOR_HEX[resolveColor(rule.color, rule.name)] }} />
                    <b>{rule.name}</b>
                    <span class="muted small">{rule.matchType}</span>
                    <code>{rule.pattern}</code>
                    {rule.autoCloseMinutes ? <span class="badge">auto-close {rule.autoCloseMinutes} min</span> : null}
                    {rule.presetId ? <span class="muted small">preset</span> : null}
                  </div>
                  <div class="row" style="gap: 2px">
                    <button class="btn icon" title="Move up" aria-label="Move up" disabled={i === 0} onClick={() => move(i, i - 1)}>↑</button>
                    <button class="btn icon" title="Move down" aria-label="Move down" disabled={i === rules.length - 1} onClick={() => move(i, i + 1)}>↓</button>
                    <button class="btn sm" onClick={() => setEditing(rule)}>Edit</button>
                    <button class="btn sm danger" onClick={() => void setRules(rules.filter((r) => r.id !== rule.id))}>Delete</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div class="card">
        <h2>Presets</h2>
        <div class="hint">Adds a ready-made set of rules. Rules already present are skipped.</div>
        <div class="chips">
          {PRESETS.map((p) => (
            <button key={p.id} class="btn sm" onClick={() => addPreset(p.id)}>
              <span class="dot" style={{ background: COLOR_HEX[p.color] }} /> {p.label}
            </button>
          ))}
        </div>
      </div>

      <div class="card">
        <h2>Test a URL</h2>
        <div class="grid2">
          <label class="field"><span>URL</span><input class="input" placeholder="https://docs.github.com/en" value={testUrl} onInput={(e) => setTestUrl((e.target as HTMLInputElement).value)} /></label>
          <label class="field"><span>Title (optional)</span><input class="input" placeholder="Page title" value={testTitle} onInput={(e) => setTestTitle((e.target as HTMLInputElement).value)} /></label>
        </div>
        {testUrl.trim() && (
          <div class="row">
            {testResult ? (
              <>
                <span class="dot" style={{ background: COLOR_HEX[testResult.color] }} />
                <span>
                  Group <b>{testResult.name}</b>{' '}
                  <span class="muted small">
                    ({testResult.source === 'rule' ? `rule: ${rules.find((r) => r.id === testResult.ruleId)?.pattern ?? ''}` : testResult.source === 'domain' ? 'domain fallback' : 'content classification'})
                  </span>
                </span>
              </>
            ) : (
              <span class="muted">Would not be grouped.</span>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
