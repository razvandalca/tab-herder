import type { GroupColor, MatchType, Rule } from './types';
import { newId } from './defaults';

export interface Preset {
  id: string;
  label: string;
  name: string;
  color: GroupColor;
  matches: Array<{ matchType: MatchType; pattern: string }>;
}

const domains = (...hosts: string[]) => hosts.map((h) => ({ matchType: 'domain' as const, pattern: h }));

export const PRESETS: Preset[] = [
  {
    id: 'dev',
    label: 'Dev',
    name: 'Dev',
    color: 'blue',
    matches: [
      ...domains('github.com', 'gitlab.com', 'stackoverflow.com', 'stackexchange.com', 'bitbucket.org', 'npmjs.com'),
      { matchType: 'glob', pattern: '*://localhost*/*' },
      { matchType: 'glob', pattern: '*://127.0.0.1*/*' },
    ],
  },
  {
    id: 'docs',
    label: 'Docs',
    name: 'Docs',
    color: 'cyan',
    matches: [
      ...domains('developer.mozilla.org', 'readthedocs.io', 'docs.rs', 'devdocs.io', 'notion.so'),
      { matchType: 'glob', pattern: '*://docs.*/*' },
      { matchType: 'glob', pattern: '*://*.atlassian.net/wiki/*' },
    ],
  },
  {
    id: 'social',
    label: 'Social',
    name: 'Social',
    color: 'pink',
    matches: domains(
      'twitter.com', 'x.com', 'facebook.com', 'instagram.com', 'reddit.com', 'linkedin.com',
      'threads.net', 'bsky.app', 'mastodon.social', 'tiktok.com',
    ),
  },
  {
    id: 'video',
    label: 'Video',
    name: 'Video',
    color: 'red',
    matches: domains(
      'youtube.com', 'youtu.be', 'vimeo.com', 'twitch.tv', 'netflix.com', 'primevideo.com',
      'disneyplus.com', 'hulu.com', 'max.com',
    ),
  },
  {
    id: 'shopping',
    label: 'Shopping',
    name: 'Shopping',
    color: 'yellow',
    matches: [
      { matchType: 'glob', pattern: '*://*.amazon.*/*' },
      ...domains('ebay.com', 'etsy.com', 'aliexpress.com', 'walmart.com', 'target.com', 'bestbuy.com', 'temu.com'),
    ],
  },
  {
    id: 'mail',
    label: 'Mail / Calendar',
    name: 'Mail',
    color: 'green',
    matches: domains(
      'mail.google.com', 'calendar.google.com', 'outlook.live.com', 'outlook.office.com',
      'outlook.office365.com', 'mail.proton.me', 'calendar.proton.me', 'mail.yahoo.com', 'fastmail.com',
    ),
  },
  {
    id: 'cloud',
    label: 'Cloud consoles',
    name: 'Cloud',
    color: 'orange',
    matches: domains(
      'portal.azure.com', 'console.aws.amazon.com', 'console.cloud.google.com',
      'cloud.digitalocean.com', 'dashboard.heroku.com', 'app.netlify.com', 'vercel.com',
      'dash.cloudflare.com', 'supabase.com',
    ),
  },
];

/** Expands a preset into concrete rules (one per match). */
export function rulesFromPreset(preset: Preset): Rule[] {
  return preset.matches.map((m) => ({
    id: newId(),
    name: preset.name,
    color: preset.color,
    matchType: m.matchType,
    pattern: m.pattern,
    enabled: true,
    presetId: preset.id,
  }));
}
