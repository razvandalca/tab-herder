import { getSettings } from '@/shared/storage';

let timer: ReturnType<typeof setTimeout> | undefined;

export function scheduleBadgeUpdate(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = undefined;
    void updateBadge();
  }, 200);
}

export async function updateBadge(): Promise<void> {
  const settings = await getSettings();
  if (!settings.badge.enabled) {
    await chrome.action.setBadgeText({ text: '' });
    return;
  }
  const tabs = await chrome.tabs.query({});
  const count = tabs.length;
  const over = settings.badge.threshold > 0 && count >= settings.badge.threshold;
  await chrome.action.setBadgeText({ text: String(count) });
  await chrome.action.setBadgeBackgroundColor({ color: over ? '#d93025' : '#5f6368' });
  await chrome.action.setBadgeTextColor?.({ color: '#ffffff' });
}
