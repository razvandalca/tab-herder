// Optional content script (only registered when the user enables "detect unsaved form input"
// or "group by content"). It tracks whether the user typed into a form and exposes the page's
// meta description. No data leaves the page except in answer to the service worker's probe.
import type { ContentRequest, ContentResponse } from '@/shared/messages';

let dirty = false;

const markDirty = (e: Event) => {
  const t = e.target as HTMLElement | null;
  if (!t) return;
  if (t instanceof HTMLInputElement) {
    const type = t.type.toLowerCase();
    if (['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'hidden', 'range', 'color'].includes(type)) return;
    if (t.form && t.form.method.toLowerCase() === 'get' && type === 'search') return;
    dirty = true;
  } else if (t instanceof HTMLTextAreaElement || t.isContentEditable) {
    dirty = true;
  }
};

document.addEventListener('input', markDirty, { capture: true, passive: true });
document.addEventListener('submit', () => (dirty = false), { capture: true, passive: true });

function metaDescription(): string {
  const el =
    document.querySelector<HTMLMetaElement>('meta[name="description"]') ??
    document.querySelector<HTMLMetaElement>('meta[property="og:description"]');
  return (el?.content ?? '').slice(0, 500);
}

chrome.runtime.onMessage.addListener((msg: ContentRequest, _sender, sendResponse) => {
  if (msg?.type === 'th:probe') {
    const res: ContentResponse = { dirty, description: metaDescription() };
    sendResponse(res);
  }
  return false;
});
