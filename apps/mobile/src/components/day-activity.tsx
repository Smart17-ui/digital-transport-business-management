import type { DayCost, DayEntry } from '@dt/domain';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { Pill } from '@/components/ui';
import { kwacha } from '@/lib/arrangements';
import { costCategoryLabel } from '@/lib/business';
import { colors, space } from '@/lib/theme';

function time(at: string): string {
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function entryLabel(entry: DayEntry, viewer: 'owner' | 'driver'): string {
  if (entry.amount < 0) return 'Correction';
  if (entry.kind === 'takings') return 'Takings collected';
  return viewer === 'owner' ? 'Handed to you' : 'Handed to the owner';
}

function EntryPill({ entry, corrected, viewer }: { entry: DayEntry; corrected: boolean; viewer: 'owner' | 'driver' }) {
  if (entry.unsent) return <Pill label="Saved, not sent yet" tone="neutral" />;
  if (corrected) return <Pill label="Corrected" tone="neutral" />;
  if (entry.status === 'confirmed') return <Pill label="Confirmed" tone="ok" />;
  if (entry.status === 'disputed') return <Pill label="Disputed" tone="problem" />;
  return <Pill label={viewer === 'owner' ? 'Needs checking' : 'Waiting for owner'} tone="waiting" />;
}

/** A day's entries and costs, newest first. */
export function DayActivity(props: { entries: DayEntry[]; costs: DayCost[]; viewer: 'owner' | 'driver' }) {
  const disputed = new Set(props.entries.filter((e) => e.status === 'disputed').map((e) => e.id));
  const corrected = new Set(props.entries.map((e) => e.reversesId));
  // The reversal of a disputed entry cancels nothing, so showing it would only confuse.
  const shown = props.entries.filter((e) => e.reversesId === null || !disputed.has(e.reversesId));
  const items = [
    ...shown.map((entry) => ({ key: entry.id, at: entry.at, entry, cost: null })),
    ...props.costs.map((cost) => ({ key: cost.id, at: cost.at, entry: null, cost })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  if (items.length === 0) return null;
  return (
    <View style={styles.list}>
      {items.map(({ key, at, entry, cost }) => (
        <View key={key} style={styles.item}>
          <Text style={styles.time}>{time(at)}</Text>
          <View style={styles.flex}>
            {entry ? (
              <>
                <Text style={styles.label}>{entryLabel(entry, props.viewer)}</Text>
                <View style={styles.pill}>
                  <EntryPill entry={entry} corrected={corrected.has(entry.id)} viewer={props.viewer} />
                </View>
                {entry.status === 'disputed' && entry.reason ? <Text style={styles.note}>{entry.reason}</Text> : null}
              </>
            ) : null}
            {cost ? (
              <>
                <Text style={styles.label}>
                  {cost.reversesId ? 'Correction: ' : ''}
                  {costCategoryLabel(cost.category)}
                  {cost.litres ? ` · ${cost.litres} L` : ''}
                </Text>
                {cost.note ? <Text style={styles.note}>{cost.note}</Text> : null}
                {cost.unsent ? (
                  <View style={styles.pill}>
                    <Pill label="Saved, not sent yet" tone="neutral" />
                  </View>
                ) : null}
              </>
            ) : null}
          </View>
          <Text style={styles.amount}>
            {entry ? kwacha(entry.amount) : cost!.amount < 0 ? `+ ${kwacha(-cost!.amount)}` : `- ${kwacha(cost!.amount)}`}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { marginTop: space(1) },
  item: { flexDirection: 'row', gap: space(3), paddingVertical: space(3), borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  time: { fontSize: 13, color: colors.muted, fontVariant: ['tabular-nums'] },
  label: { fontSize: 15, color: colors.text },
  note: { fontSize: 13, lineHeight: 18, color: colors.muted, marginTop: 2 },
  pill: { flexDirection: 'row', marginTop: space(1) },
  amount: { fontSize: 15, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
});
