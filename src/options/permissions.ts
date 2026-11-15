import { send } from '@/shared/messages';

export const CONTENT_PERMISSION = { permissions: ['scripting'], origins: ['<all_urls>'] } as const;

export async function hasContentPermission(): Promise<boolean> {
  return chrome.permissions.contains({
    permissions: [...CONTENT_PERMISSION.permissions],
    origins: [...CONTENT_PERMISSION.origins],
  });
}

/** Must be called synchronously from a click handler (Chrome requires a user gesture). */
export async function requestContentPermission(): Promise<boolean> {
  const granted = await chrome.permissions.request({
    permissions: [...CONTENT_PERMISSION.permissions],
    origins: [...CONTENT_PERMISSION.origins],
  });
  if (granted) await send({ type: 'setContentScript', enabled: true });
  return granted;
}

export async function releaseContentPermissionIfUnused(stillNeeded: boolean): Promise<void> {
  if (stillNeeded) return;
  await send({ type: 'setContentScript', enabled: false });
  await chrome.permissions
    .remove({ permissions: [...CONTENT_PERMISSION.permissions], origins: [...CONTENT_PERMISSION.origins] })
    .catch(() => false);
}
