import { COLOR_HEX, GROUP_COLORS } from '@/core/colors';
import type { GroupColor } from '@/shared/types';

interface Props {
  value: GroupColor | 'auto';
  onChange: (c: GroupColor | 'auto') => void;
  allowAuto?: boolean;
}

export function ColorPicker({ value, onChange, allowAuto }: Props) {
  return (
    <div class="swatches" role="radiogroup" aria-label="Group colour">
      {allowAuto && (
        <button type="button" class={`swatch auto ${value === 'auto' ? 'selected' : ''}`} title="Auto (by name)" aria-label="Auto colour" onClick={() => onChange('auto')} />
      )}
      {GROUP_COLORS.map((c) => (
        <button
          type="button"
          key={c}
          class={`swatch ${value === c ? 'selected' : ''}`}
          style={{ background: COLOR_HEX[c] }}
          title={c}
          aria-label={c}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  );
}
