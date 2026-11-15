/** True when the shared popup UI is rendered in Chrome's side panel (see src/sidepanel/index.html). */
export function isSidePanel(): boolean {
  return document.body.classList.contains('sidepanel');
}

/**
 * Opens the side panel in a window. Must run inside a user gesture (click, menu, command),
 * so callers should not await anything before it.
 */
export function openSidePanel(windowId: number): Promise<void> {
  return chrome.sidePanel.open({ windowId });
}
