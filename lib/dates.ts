import { DAY_SHORT } from "@/lib/availability";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

export function parseDayKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatTime(iso: string | Date): string {
  const d = new Date(iso);
  const h = d.getHours() % 12 === 0 ? 12 : d.getHours() % 12;
  return `${h}:${String(d.getMinutes()).padStart(2, "0")} ${d.getHours() < 12 ? "AM" : "PM"}`;
}

export const formatDate = (d: Date) => `${DAY_SHORT[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()}`;

// "Today", "Tomorrow", then weekday within the week, then a full date.
export function relativeDay(iso: string | Date, now = new Date()): string {
  const d = new Date(iso);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(d) - startOf(now)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff < 7) return DAY_SHORT[d.getDay()];
  return formatDate(d);
}

export const formatWhen = (iso: string) => `${relativeDay(iso)} · ${formatTime(iso)}`;

export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

export const gameEnd = (g: { startsAt: string; durationMin: number }) => new Date(new Date(g.startsAt).getTime() + g.durationMin * 60_000);

// Next calendar date (today included) that falls on `day`, at `minutes` past
// local midnight. Rolls a week forward if that moment has already passed.
export function nextOccurrence(day: number, minutes: number, now = new Date()): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, minutes);
  d.setDate(d.getDate() + ((day - now.getDay() + 7) % 7));
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 7);
  return d;
}
