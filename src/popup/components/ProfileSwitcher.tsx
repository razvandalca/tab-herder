import { switchProfile } from '@/core/profiles';
import { useSettings } from '@/ui/hooks';

/**
 * Compact rule-profile picker for the popup header. Hidden while there is only one profile.
 * Switching only changes which rules apply from now on; existing groups are left alone until
 * the user presses "Group now".
 */
export function ProfileSwitcher({ notify }: { notify: (msg: string) => void }) {
  const [settings, save] = useSettings();
  if (!settings || settings.profiles.length < 2) return null;
  const change = async (id: string) => {
    const next = switchProfile(settings, id);
    await save(next);
    const name = next.profiles.find((p) => p.id === id)?.name ?? '';
    notify(`Profile: ${name}. Press Group now to apply`);
  };
  return (
    <select
      class="input sm"
      style="width: auto; max-width: 140px; margin-left: auto"
      title="Rule profile"
      aria-label="Rule profile"
      value={settings.activeProfileId}
      onChange={(e) => void change((e.target as HTMLSelectElement).value)}
    >
      {settings.profiles.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
