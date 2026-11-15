import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json' with { type: 'json' };

export default defineManifest({
  manifest_version: 3,
  name: 'Tab Herder',
  version: pkg.version,
  description: pkg.description,
  minimum_chrome_version: '121',
  icons: {
    16: 'icons/icon-16.png',
    32: 'icons/icon-32.png',
    48: 'icons/icon-48.png',
    128: 'icons/icon-128.png',
  },
  action: {
    default_popup: 'src/popup/index.html',
    default_title: 'Tab Herder',
    default_icon: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
    },
  },
  options_page: 'src/options/index.html',
  background: { service_worker: 'src/background/index.ts', type: 'module' },
  permissions: ['tabs', 'tabGroups', 'storage', 'alarms', 'contextMenus'],
  optional_permissions: ['scripting'],
  optional_host_permissions: ['<all_urls>'],
  incognito: 'spanning',
  commands: {
    'group-now': {
      suggested_key: { default: 'Alt+Shift+G' },
      description: 'Group all tabs now',
    },
    'close-current-group': {
      suggested_key: { default: 'Alt+Shift+W' },
      description: "Close the current tab's group",
    },
    'close-duplicates': {
      suggested_key: { default: 'Alt+Shift+D' },
      description: 'Close duplicate tabs',
    },
    _execute_action: {
      suggested_key: { default: 'Alt+Shift+F' },
      description: 'Open tab search',
    },
  },
});
