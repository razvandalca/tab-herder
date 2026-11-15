// Generates Chrome Web Store screenshots (1280x800, 24-bit PNG, no alpha) into release/screenshots/.
// Loads dist/ into Chromium, opens fake tabs with realistic titles, groups them, and composes
// the popup / options captures onto captioned frames. Run: bun run build && bun run screenshots
import { chromium } from 'playwright';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const EXT = fileURLToPath(new URL('../dist', import.meta.url));
const OUT = fileURLToPath(new URL('../release/screenshots', import.meta.url));
mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'th-shots-profile-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PAGES = {
  'github.com/anthropics/claude-code/pull/4821': 'Fix debounce on tab updates by rdalca · Pull Request #4821',
  'github.com/preactjs/preact/issues': 'Issues · preactjs/preact',
  'docs.github.com/en/actions': 'GitHub Actions documentation',
  'stackoverflow.com/questions/71234/chrome-tabgroups-api':
    'javascript - How do I use the chrome.tabGroups API? - Stack Overflow',
  'developer.chrome.com/docs/extensions/reference/api/tabGroups': 'chrome.tabGroups | API | Chrome for Developers',
  'developer.mozilla.org/en-US/docs/Web/API/Fetch_API': 'Fetch API - Web APIs | MDN',
  'vite.dev/guide/': 'Getting Started | Vite',
  'www.youtube.com/watch?v=dQw4w9WgXcQ': 'Lo-fi beats to debug to - YouTube',
  'www.youtube.com/watch?v=9bZkp7q19f0': 'Building a Chrome extension in 2026 - YouTube',
  'twitter.com/home': 'Home / X',
  'www.reddit.com/r/webdev/': 'r/webdev',
  'www.amazon.com/dp/B0CX23V2ZK': 'Amazon.com: USB-C Hub 7-in-1',
  'mail.google.com/mail/u/0/': 'Inbox (12) - Gmail',
  'calendar.google.com/calendar/u/0/r': 'Google Calendar - Week of 20 October 2026',
  'news.ycombinator.com/': 'Hacker News',
  'en.wikipedia.org/wiki/Tab_(interface)': 'Tab (interface) - Wikipedia',
};

const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium',
  headless: true,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  viewport: { width: 1280, height: 800 },
  colorScheme: 'light',
});
await context.route('**/*', (route) => {
  const url = new URL(route.request().url());
  if (url.protocol.startsWith('chrome')) return route.continue();
  const key = url.hostname + url.pathname + url.search;
  const title = PAGES[key] ?? PAGES[url.hostname + url.pathname] ?? url.hostname;
  route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><meta charset="utf-8"><title>${title}</title><h1>${title}</h1>`,
  });
});

let [sw] = context.serviceWorkers();
if (!sw) sw = await context.waitForEvent('serviceworker');
const extId = new URL(sw.url()).host;

const ext = await context.newPage();
await ext.goto(`chrome-extension://${extId}/src/options/index.html`);
const api = (fn, ...args) => ext.evaluate(fn, ...args);
const send = (req) => api((r) => chrome.runtime.sendMessage(r), req);

// Rules: presets the user would typically add.
await api(() =>
  chrome.storage.sync.set({
    rules: [
      {
        id: 'p-dev-1',
        name: 'Dev',
        color: 'blue',
        matchType: 'domain',
        pattern: 'github.com',
        enabled: true,
        presetId: 'dev',
      },
      {
        id: 'p-dev-2',
        name: 'Dev',
        color: 'blue',
        matchType: 'domain',
        pattern: 'stackoverflow.com',
        enabled: true,
        presetId: 'dev',
      },
      {
        id: 'p-docs-1',
        name: 'Docs',
        color: 'green',
        matchType: 'domain',
        pattern: 'developer.mozilla.org',
        enabled: true,
        presetId: 'docs',
      },
      {
        id: 'p-docs-2',
        name: 'Docs',
        color: 'green',
        matchType: 'domain',
        pattern: 'developer.chrome.com',
        enabled: true,
        presetId: 'docs',
      },
      {
        id: 'p-docs-3',
        name: 'Docs',
        color: 'green',
        matchType: 'glob',
        pattern: '*://*/docs/*',
        enabled: true,
        presetId: 'docs',
      },
      {
        id: 'p-docs-4',
        name: 'Docs',
        color: 'green',
        matchType: 'glob',
        pattern: '*://vite.dev/*',
        enabled: true,
        presetId: 'docs',
      },
      {
        id: 'p-video',
        name: 'Video',
        color: 'red',
        matchType: 'domain',
        pattern: 'youtube.com',
        enabled: true,
        autoCloseMinutes: 120,
        presetId: 'video',
      },
      {
        id: 'p-social-1',
        name: 'Social',
        color: 'pink',
        matchType: 'domain',
        pattern: 'twitter.com',
        enabled: true,
        presetId: 'social',
      },
      {
        id: 'p-social-2',
        name: 'Social',
        color: 'pink',
        matchType: 'domain',
        pattern: 'reddit.com',
        enabled: true,
        presetId: 'social',
      },
      {
        id: 'p-shop',
        name: 'Shopping',
        color: 'yellow',
        matchType: 'domain',
        pattern: 'amazon.com',
        enabled: true,
        presetId: 'shopping',
      },
      {
        id: 'p-mail-1',
        name: 'Mail & Calendar',
        color: 'purple',
        matchType: 'domain',
        pattern: 'mail.google.com',
        enabled: true,
        presetId: 'mail',
      },
      {
        id: 'p-mail-2',
        name: 'Mail & Calendar',
        color: 'purple',
        matchType: 'domain',
        pattern: 'calendar.google.com',
        enabled: true,
        presetId: 'mail',
      },
      { id: 'u-news', name: 'Reading', color: 'orange', matchType: 'title', pattern: 'wikipedia', enabled: true },
    ],
  }),
);
await api(() =>
  chrome.storage.sync.set({
    settings: {
      mode: 'auto',
      groupByDomain: true,
      mergeSubdomains: true,
      minGroupSize: 2,
      includeIncognito: false,
      contentGrouping: false,
      badge: { enabled: true, threshold: 30 },
      cleanup: {
        enabled: true,
        intervalMinutes: 15,
        inactiveHours: 12,
        inactiveAction: 'discard',
        closeDuplicates: true,
        allowlist: ['mail.google.com', 'calendar.google.com', 'localhost'],
        detectUnsavedForms: false,
      },
    },
  }),
);

for (const key of Object.keys(PAGES)) {
  const p = await context.newPage();
  await p.goto(`https://${key}`);
}
const DUPES_PLACEHOLDER = [
  'www.amazon.com/dp/B0CX23V2ZK?utm_source=newsletter&utm_medium=email',
  'github.com/anthropics/claude-code/pull/4821#discussion_r1',
  'developer.mozilla.org/en-US/docs/Web/API/Fetch_API?utm_campaign=mdn',
];
await sleep(300);
await send({ type: 'groupNow' });
await sleep(300);
// Make the Shopping group collapsed, like a tidy user would.
await api(async () => {
  const g = (await chrome.tabGroups.query({ title: 'Shopping' }))[0];
  if (g) await chrome.tabGroups.update(g.id, { collapsed: true });
});
// Activate the PR tab so the popup shows something sensible as "current".
await api(async () => {
  const [t] = await chrome.tabs.query({ url: 'https://github.com/anthropics/*' });
  if (t) await chrome.tabs.update(t.id, { active: true });
});
await sleep(200);

// ---- captures -------------------------------------------------------------
const popup = await context.newPage();
await popup.setViewportSize({ width: 380, height: 580 });
const capPopup = async (hash = '', before) => {
  await popup.goto(`chrome-extension://${extId}/src/popup/index.html${hash}`);
  await sleep(400);
  if (before) await before(popup);
  await sleep(300);
  await popup.evaluate(() => {
    document.body.style.maxHeight = 'none';
    document.body.style.overflow = 'visible';
  });
  await sleep(100);
  const buf = await popup.screenshot({ scale: 'device', fullPage: true });
  return `data:image/png;base64,${buf.toString('base64')}`;
};
const capOptions = async (hash) => {
  await ext.setViewportSize({ width: 1000, height: 660 });
  await ext.goto(`chrome-extension://${extId}/src/options/index.html${hash}`);
  await sleep(500);
  const buf = await ext.screenshot({ scale: 'device' });
  return `data:image/png;base64,${buf.toString('base64')}`;
};

const popupMain = await capPopup('', async (p) => {
  await p.getByRole('button', { name: 'Show tabs' }).nth(0).click();
});
const popupSearch = await capPopup('', async (p) => {
  await p.keyboard.type('chrome tab');
});
for (const key of DUPES_PLACEHOLDER) {
  const p = await context.newPage();
  await p.goto(`https://${key}`);
}
await sleep(1200); // auto mode debounce
await send({ type: 'closeDuplicates' });
await sleep(300);
const popupCleaned = await capPopup('', async (p) => {
  await p.getByText('Recently cleaned').click();
});
const optRules = await capOptions('#rules');
const optCleanup = await capOptions('#cleanup');

// ---- framing ----------------------------------------------------------------
const frame = await context.newPage();
await frame.setViewportSize({ width: 1280, height: 800 });
const css = `
  * { box-sizing: border-box; margin: 0; }
  html, body { width: 1280px; height: 800px; overflow: hidden; font-family: -apple-system, "Segoe UI", Inter, Roboto, Helvetica, Arial, sans-serif; color: #10203a; }
  body { background: linear-gradient(135deg, #e8f0ff 0%, #f6f8fc 55%, #fff4e5 100%); display: flex; align-items: center; padding: 0 72px; gap: 56px; }
  .copy { flex: 1; min-width: 0; }
  .eyebrow { font-size: 15px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: #3b6fd6; margin-bottom: 14px; }
  h1 { font-size: 44px; line-height: 1.12; font-weight: 700; letter-spacing: -0.015em; margin-bottom: 22px; }
  ul { list-style: none; padding: 0; }
  li { font-size: 20px; line-height: 1.4; color: #3a4a66; margin: 0 0 12px; padding-left: 28px; position: relative; }
  li::before { content: ""; position: absolute; left: 0; top: 9px; width: 11px; height: 11px; border-radius: 50%; background: #3b6fd6; }
  .shot { flex: none; border-radius: 14px; box-shadow: 0 24px 60px rgba(16,32,58,.22), 0 2px 6px rgba(16,32,58,.12); overflow: hidden; background: #fff; }
  .shot img { display: block; }
  body.wide { flex-direction: column; justify-content: flex-start; padding: 44px 72px 0; gap: 26px; align-items: stretch; }
  body.wide .copy { display: flex; align-items: baseline; gap: 28px; }
  body.wide h1 { font-size: 36px; margin: 0; }
  body.wide .sub { font-size: 20px; color: #3a4a66; }
  body.wide .shot { align-self: center; border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
`;
const popupFrame = (img, eyebrow, title, bullets) => `<!doctype html><html><head><style>${css}</style></head><body>
  <div class="copy"><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><ul>${bullets.map((b) => `<li>${b}</li>`).join('')}</ul></div>
  <div class="shot"><img src="${img}" style="max-width:437px;max-height:730px"></div></body></html>`;
const wideFrame = (img, title, sub) => `<!doctype html><html><head><style>${css}</style></head><body class="wide">
  <div class="copy"><h1>${title}</h1><div class="sub">${sub}</div></div>
  <div class="shot"><img src="${img}" style="width:1000px"></div></body></html>`;

const shots = [
  [
    '1-groups',
    popupFrame(popupMain, 'Tab Herder', 'Your tabs, grouped automatically', [
      'Native Chrome tab groups, named and coloured for you',
      'Group by site, or by rules you write: domain, URL pattern, regex, title',
      'Pinned tabs and tabs you move by hand are left alone',
    ]),
  ],
  [
    '2-search',
    popupFrame(popupSearch, 'Find anything', 'Jump to any tab in a keystroke', [
      'Fuzzy search across every window',
      'Alt+Shift+F opens the popup with the search box focused',
      'Groups, tab counts and quick actions in one view',
    ]),
  ],
  [
    '3-cleanup',
    popupFrame(popupCleaned, 'Safe cleanup', 'Close duplicates, sleep stale tabs', [
      'Duplicates detected even with tracking parameters and anchors',
      'Inactive tabs put to sleep or closed on a schedule you set',
      'Everything lands in Recently cleaned with one-click restore',
    ]),
  ],
  [
    '4-rules',
    wideFrame(
      optRules,
      'Rules and presets',
      'Drag to set priority. Add Dev, Docs, Social, Video, Shopping, Mail and Cloud in one click.',
    ),
  ],
  [
    '5-settings',
    wideFrame(
      optCleanup,
      'Cleanup that never closes what matters',
      'Audible, pinned and allowlisted tabs are always protected. No account, no servers.',
    ),
  ],
];
for (const [name, html] of shots) {
  await frame.setContent(html);
  await sleep(300);
  const png = await frame.screenshot({ type: 'png' });
  writeFileSync(join(OUT, `${name}.png`), stripAlpha(png));
  console.log('wrote', join(OUT, `${name}.png`));
}

await context.close();
rmSync(profile, { recursive: true, force: true });

// ---- PNG: drop the alpha channel (store requires 24-bit, no alpha) ---------
function stripAlpha(png) {
  const SIG = 8;
  let pos = SIG;
  const chunks = [];
  let ihdr;
  const idat = [];
  while (pos < png.length) {
    const len = png.readUInt32BE(pos);
    const type = png.toString('ascii', pos + 4, pos + 8);
    const data = png.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') ihdr = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type !== 'IEND') chunks.push([type, data]);
    pos += 12 + len;
  }
  const w = ihdr.readUInt32BE(0),
    h = ihdr.readUInt32BE(4),
    depth = ihdr[8],
    ctype = ihdr[9];
  if (ctype === 2 && depth === 8) return png;
  if (ctype !== 6 || depth !== 8) throw new Error(`unexpected PNG colour type ${ctype}/${depth}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4,
    stride = w * bpp;
  const prev = Buffer.alloc(stride);
  const cur = Buffer.alloc(stride);
  const out = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0,
        b = prev[i],
        c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c,
          pa = Math.abs(p - a),
          pb = Math.abs(p - b),
          pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 255;
    }
    const o = y * (1 + w * 3);
    out[o] = 0;
    for (let x = 0; x < w; x++) {
      out[o + 1 + x * 3] = cur[x * 4];
      out[o + 2 + x * 3] = cur[x * 4 + 1];
      out[o + 3 + x * 3] = cur[x * 4 + 2];
    }
    cur.copy(prev);
  }
  const ihdr2 = Buffer.from(ihdr);
  ihdr2[9] = 2;
  const chunk = (type, data) => {
    const t = Buffer.from(type, 'ascii');
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(Buffer.concat([t, data])) >>> 0);
    return Buffer.concat([len, t, data, crc]);
  };
  return Buffer.concat([
    png.subarray(0, SIG),
    chunk('IHDR', ihdr2),
    chunk('IDAT', zlib.deflateSync(out, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
