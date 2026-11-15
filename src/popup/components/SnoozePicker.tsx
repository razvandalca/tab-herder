import { useState } from 'preact/hooks';
import {
  SNOOZE_PRESETS,
  describeWake,
  parseLocalDateTime,
  presetWakeTime,
  toLocalDateTimeValue,
  validateWakeTime,
} from '@/core/snooze';

interface Props {
  /** What is being snoozed, for the accessible label. */
  label: string;
  onPick: (wakeAt: number) => void;
  onCancel: () => void;
}

/** Inline picker: preset times plus a custom date/time. */
export function SnoozePicker({ label, onPick, onCancel }: Props) {
  const now = Date.now();
  const [custom, setCustom] = useState(() => toLocalDateTimeValue(presetWakeTime('tomorrow', now)));
  const [error, setError] = useState<string | null>(null);

  const submitCustom = (e: Event) => {
    e.preventDefault();
    const t = parseLocalDateTime(custom);
    const err = t === null ? 'Invalid date' : validateWakeTime(t, Date.now());
    if (err) return setError(err);
    onPick(t!);
  };

  return (
    <div class="snooze-picker" role="group" aria-label={`Snooze ${label}`}>
      <div class="snooze-presets">
        {SNOOZE_PRESETS.map((p) => {
          const at = presetWakeTime(p.id, now);
          return (
            <button
              key={p.id}
              type="button"
              class="btn sm"
              onClick={() => onPick(at)}
              title={new Date(at).toLocaleString()}
            >
              <span>{p.label}</span>
              <span class="small muted">{describeWake(at, now)}</span>
            </button>
          );
        })}
      </div>
      <form class="inline-form" style="padding: 0" onSubmit={submitCustom}>
        <input
          class="input sm grow"
          type="datetime-local"
          aria-label="Custom snooze time"
          value={custom}
          min={toLocalDateTimeValue(now)}
          onInput={(e) => {
            setCustom((e.target as HTMLInputElement).value);
            setError(null);
          }}
        />
        <button class="btn sm primary" type="submit">
          Snooze
        </button>
        <button class="btn sm" type="button" onClick={onCancel}>
          Cancel
        </button>
      </form>
      {error && (
        <div class="small" style="color: var(--danger)" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
