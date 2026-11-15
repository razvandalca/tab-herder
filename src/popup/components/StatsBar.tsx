import type { Stats } from '@/shared/messages';

export function StatsBar({ stats }: { stats: Stats | null }) {
  return (
    <div class="stats" aria-label="Statistics">
      <div class="stat"><b>{stats?.openTabs ?? '–'}</b><span>open tabs</span></div>
      <div class="stat"><b>{stats?.groups ?? '–'}</b><span>groups</span></div>
      <div class="stat"><b>{stats?.cleanedThisWeek ?? '–'}</b><span>cleaned this week</span></div>
    </div>
  );
}
