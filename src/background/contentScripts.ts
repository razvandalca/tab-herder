import contentScript from '@/content/formDirty?script';
import type { ContentResponse } from '@/shared/messages';

const SCRIPT_ID = 'tab-herder-probe';

export async function hasContentPermission(): Promise<boolean> {
  return chrome.permissions.contains({ permissions: ['scripting'], origins: ['<all_urls>'] });
}

/** Registers the probe content script. The options page must have obtained the permission first. */
export async function registerContentScript(): Promise<boolean> {
  if (!(await hasContentPermission())) return false;
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
  if (existing.length === 0) {
    await chrome.scripting.registerContentScripts([
      {
        id: SCRIPT_ID,
        js: [contentScript],
        matches: ['<all_urls>'],
        runAt: 'document_idle',
        persistAcrossSessions: true,
      },
    ]);
  }
  return true;
}

export async function unregisterContentScript(): Promise<void> {
  if (!chrome.scripting) return;
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
  } catch {
    /* not registered */
  }
}

/** Asks the probe script in each tab about unsaved input and meta description. Missing script = no answer. */
export async function probeTabs(tabIds: number[], timeoutMs = 400): Promise<Map<number, ContentResponse>> {
  const results = new Map<number, ContentResponse>();
  if (!tabIds.length) return results;
  await Promise.all(
    tabIds.map(async (id) => {
      const res = await Promise.race<ContentResponse | undefined>([
        chrome.tabs.sendMessage(id, { type: 'th:probe' }).catch(() => undefined),
        new Promise((r) => setTimeout(() => r(undefined), timeoutMs)),
      ]);
      if (res && typeof res === 'object') results.set(id, res);
    }),
  );
  return results;
}
