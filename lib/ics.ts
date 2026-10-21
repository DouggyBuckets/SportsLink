// Just enough iCalendar to read Michigan Recreation's public Google Calendar
// feeds: single events, DAILY/WEEKLY repeats (BYDAY, UNTIL, INTERVAL),
// EXDATE, and edited/cancelled single occurrences (RECURRENCE-ID).
// Times with TZID=America/New_York are read as device-local wall time,
// which is right for anyone in Ann Arbor.

export type IcsEvent = {
  uid: string;
  summary: string;
  start: Date;
  end: Date;
  status: string;
  rrule: Record<string, string> | null;
  exdates: string[]; // day keys
  recurrenceId: string | null; // day key of the occurrence this edits
};

export type Occurrence = { summary: string; start: Date; end: Date };

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

// 20261019T060000 (wall time), 20261221T045959Z (UTC) or 20261019 (all day).
function parseIcsDate(value: string): Date {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return new Date(NaN);
  const [, y, mo, d, h = "0", mi = "0", s = "0", z] = m;
  return z ? new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)) : new Date(+y, +mo - 1, +d, +h, +mi, +s);
}

export function parseIcs(text: string): IcsEvent[] {
  // Long lines are folded onto continuation lines that start with a space.
  const lines = text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const events: IcsEvent[] = [];
  let cur: Partial<IcsEvent> | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") cur = { exdates: [], rrule: null, recurrenceId: null, status: "CONFIRMED", summary: "" };
    else if (line === "END:VEVENT") {
      if (cur?.uid && cur.start && cur.end) events.push(cur as IcsEvent);
      cur = null;
    } else if (cur) {
      const colon = line.indexOf(":");
      if (colon < 0) continue;
      const key = line.slice(0, colon).split(";")[0];
      const value = line.slice(colon + 1);
      if (key === "UID") cur.uid = value;
      else if (key === "SUMMARY") cur.summary = value.replace(/\\([,;\\])/g, "$1");
      else if (key === "STATUS") cur.status = value;
      else if (key === "DTSTART") cur.start = parseIcsDate(value);
      else if (key === "DTEND") cur.end = parseIcsDate(value);
      else if (key === "RECURRENCE-ID") cur.recurrenceId = dayKey(parseIcsDate(value));
      else if (key === "EXDATE") cur.exdates!.push(...value.split(",").map((v) => dayKey(parseIcsDate(v))));
      else if (key === "RRULE") cur.rrule = Object.fromEntries(value.split(";").map((p) => p.split("=") as [string, string]));
    }
  }
  return events;
}

// Does a repeating series (or single event) have an occurrence on `day`?
function occursOn(e: IcsEvent, day: Date): boolean {
  const first = new Date(e.start.getFullYear(), e.start.getMonth(), e.start.getDate());
  if (day < first) return false;
  if (!e.rrule) return dayKey(day) === dayKey(first);
  const { FREQ, UNTIL, BYDAY, INTERVAL } = e.rrule;
  const startThatDay = new Date(day.getFullYear(), day.getMonth(), day.getDate(), e.start.getHours(), e.start.getMinutes());
  if (UNTIL && startThatDay > parseIcsDate(UNTIL)) return false;
  const interval = Number(INTERVAL ?? 1);
  const daysSince = Math.round((day.getTime() - first.getTime()) / 86_400_000);
  if (FREQ === "DAILY") return daysSince % interval === 0;
  if (FREQ === "WEEKLY") {
    const byDay = BYDAY ? BYDAY.split(",") : [WEEKDAYS[first.getDay()]];
    const weeksSince = Math.floor((daysSince + first.getDay()) / 7);
    return byDay.includes(WEEKDAYS[day.getDay()]) && weeksSince % interval === 0;
  }
  return false; // MONTHLY/YEARLY aren't used by these feeds.
}

export function occurrencesOn(events: IcsEvent[], day: Date): Occurrence[] {
  const edited = new Set(events.filter((e) => e.recurrenceId).map((e) => `${e.uid}|${e.recurrenceId}`));
  const key = dayKey(day);
  const out: Occurrence[] = [];
  for (const e of events) {
    if (e.status === "CANCELLED") continue;
    if (e.recurrenceId) {
      if (dayKey(e.start) === key) out.push({ summary: e.summary, start: e.start, end: e.end });
      continue;
    }
    if (e.exdates.includes(key) || edited.has(`${e.uid}|${key}`) || !occursOn(e, day)) continue;
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), e.start.getHours(), e.start.getMinutes());
    out.push({ summary: e.summary, start, end: new Date(start.getTime() + (e.end.getTime() - e.start.getTime())) });
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

// The last day the feed says anything about (open-ended series count as
// forever). Past this, "no hours listed" means "not posted yet", not "closed".
export function coveredUntil(events: IcsEvent[]): Date {
  let last = 0;
  for (const e of events) {
    if (e.status === "CANCELLED") continue;
    if (e.rrule && !e.rrule.UNTIL && !e.rrule.COUNT) return new Date(8.64e15);
    const end = e.rrule?.UNTIL ? parseIcsDate(e.rrule.UNTIL).getTime() : e.end.getTime();
    last = Math.max(last, end);
  }
  return new Date(last);
}
