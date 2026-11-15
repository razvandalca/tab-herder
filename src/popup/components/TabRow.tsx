import type { TabSnapshot } from '@/shared/types';
import { hostname } from '@/core/url';
import { Favicon } from '@/ui/Favicon';
import { Icons } from '@/ui/icons';
import { isSidePanel } from '@/ui/surface';

export function TabRow({ tab, showWindow }: { tab: TabSnapshot; showWindow?: boolean }) {
  const jump = async () => {
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
    // The side panel stays open while you browse; only the popup dismisses itself.
    if (!isSidePanel()) window.close();
  };
  const close = async (e: Event) => {
    e.stopPropagation();
    await chrome.tabs.remove(tab.id);
  };
  const host = hostname(tab.url) ?? tab.url;
  return (
    <div class={`item clickable ${tab.active ? 'active' : ''}`} role="listitem" onClick={jump} title={tab.url}>
      <Favicon src={tab.favIconUrl} />
      <div class="grow">
        <div class="ellipsis" style={tab.discarded ? 'opacity: 0.6' : ''}>
          {tab.title || tab.url}
        </div>
        <div class="ellipsis small muted">
          {host}
          {showWindow ? ' · other window' : ''}
          {tab.audible ? ' · 🔊' : ''}
          {tab.pinned ? ' · pinned' : ''}
        </div>
      </div>
      <button class="btn icon" title="Close tab" aria-label={`Close ${tab.title}`} onClick={close}>
        <Icons.x />
      </button>
    </div>
  );
}
