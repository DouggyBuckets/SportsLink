import { useEffect, useState } from "react";
import { formatTime } from "@/lib/dates";
import { coveredUntil, IcsEvent, occurrencesOn, parseIcs } from "@/lib/ics";
import { locationById } from "@/lib/locations";
import { sunset } from "@/lib/sun";
import { Game } from "@/lib/types";

// What we can know about a field before posting a game there. Neither U-M
// nor the city publishes field bookings or takes them online (checked Oct
// 2026), so this combines what *is* public:
//  - Hadley's opening hours: Michigan Recreation's Google Calendar feed.
//  - Field closures: Michigan Recreation's "Notices" RSS feed.
//  - Daylight and season rules from each field's page.
//  - Other SportsLink games already at that field.
// Plus a link to each field's real reservation process.

type FieldRules = {
  hours: "hadley-calendar" | "daylight" | "events-only";
  // Inclusive month range the field is open (0 = Jan).
  season?: [number, number];
  // Matches this field in a Michigan Recreation notice title.
  notices?: RegExp;
  reserve: { label: string; url: string; note: string };
};

const UM_REQUEST = "https://recreation.umich.edu/facilityrentals/#request";
const UM_NOTE = "Student orgs request 3+ weeks ahead · from $70/hr";
const CITY_RENTAL = "https://www.a2gov.org/parks-and-recreation/park-rentals/premium-athletic-field-rental/";
const CITY_NOTE = "City Parks · book 1+ week ahead · $48–72/hr, 2 hr minimum";

const RULES: Record<string, FieldRules> = {
  hadley: { hours: "hadley-calendar", notices: /hadley/i, reserve: { label: "Michigan Recreation rentals", url: UM_REQUEST, note: UM_NOTE } },
  coliseum: { hours: "events-only", notices: /coliseum/i, reserve: { label: "Michigan Recreation rentals", url: "https://recreation.umich.edu/facility/coliseum/", note: UM_NOTE } },
  "palmer-field": { hours: "daylight", notices: /palmer/i, reserve: { label: "Michigan Recreation rentals", url: UM_REQUEST, note: UM_NOTE } },
  mitchell: { hours: "daylight", season: [3, 10], notices: /mitchell/i, reserve: { label: "Mitchell East grass fields", url: "https://recreation.umich.edu/space/mitchell-east-grass-fields/", note: UM_NOTE } },
  // Hadley notices also say "Turf" (its indoor turf court), so those are
  // claimed by Hadley first.
  "hubbard-turf": { hours: "daylight", notices: /hubbard|turf field/i, reserve: { label: "Hubbard Road turf fields", url: "https://recreation.umich.edu/space/hubbard-road-turf-fields/", note: UM_NOTE } },
  "fuller-park": { hours: "daylight", season: [3, 10], reserve: { label: "City of Ann Arbor field rental", url: CITY_RENTAL, note: CITY_NOTE } },
  "burns-park": { hours: "daylight", reserve: { label: "Call City Parks", url: "tel:7347946230", note: "734-794-6230 · book 1+ week ahead" } },
};

export const fieldRules = (locationId: string): FieldRules | undefined => RULES[locationId];

// ── Live public data, fetched straight from the phone and cached ─────────

const HADLEY_ICS = "https://calendar.google.com/calendar/ical/c_85d859c7bb5ae9d268c9023b2cca384b3854ce303a7b8e6e39a80bd62184ff8c%40group.calendar.google.com/public/basic.ics";
const NOTICES_RSS = "https://recreation.umich.edu/feed/?post_type=notice";
const CACHE_MS = 30 * 60_000;
// Notices have no end date; anything older than this is assumed resolved.
const NOTICE_DAYS = 14;

export type Notice = { title: string; url: string; date: Date };
type FieldFeeds = { hadley: IcsEvent[] | null; notices: Notice[] };

let cache: { at: number; feeds: Promise<FieldFeeds> } | null = null;

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();

function parseNotices(xml: string): Notice[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, item]) => ({
    title: decode(item.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? ""),
    url: decode(item.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? ""),
    date: new Date(item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? 0),
  }));
}

const getText = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.text();
};

// Each feed fails on its own: no network just means fewer checks.
function loadFeeds(): Promise<FieldFeeds> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.feeds;
  const feeds = Promise.all([getText(HADLEY_ICS).then(parseIcs).catch(() => null), getText(NOTICES_RSS).then(parseNotices).catch(() => [])]).then(([hadley, notices]) => ({ hadley, notices }));
  cache = { at: Date.now(), feeds };
  return feeds;
}

export function useFieldFeeds(): FieldFeeds | null {
  const [feeds, setFeeds] = useState<FieldFeeds | null>(null);
  useEffect(() => {
    let live = true;
    loadFeeds().then((f) => live && setFeeds(f));
    return () => {
      live = false;
    };
  }, []);
  return feeds;
}

// ── The check itself ─────────────────────────────────────────────────────

export type CheckLine = { tone: "success" | "warning" | "danger" | "neutral"; icon: string; text: string; url?: string };
export type FieldCheck = { lines: CheckLine[]; blocked: string | null; reserve: FieldRules["reserve"] | null };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function checkField(input: { locationId: string; start: Date; durationMin: number; editingId?: string }, feeds: FieldFeeds | null, games: Game[], now = new Date()): FieldCheck {
  const rules = RULES[input.locationId];
  const place = locationById(input.locationId);
  const lines: CheckLine[] = [];
  let blocked: string | null = null;
  const end = new Date(input.start.getTime() + input.durationMin * 60_000);
  const day = new Date(input.start.getFullYear(), input.start.getMonth(), input.start.getDate());

  if (rules && place) {
    if (rules.season && (input.start.getMonth() < rules.season[0] || input.start.getMonth() > rules.season[1])) {
      lines.push({ tone: "warning", icon: "calendar.badge.exclamationmark", text: `Open ${MONTHS[rules.season[0]]}–${MONTHS[rules.season[1]]} only` });
    }

    if (rules.hours === "daylight") {
      const dusk = sunset(day, place.lat, place.lng);
      if (input.start >= dusk) lines.push({ tone: "warning", icon: "moon.fill", text: `Starts after sunset (${formatTime(dusk)}) · fields are open dawn to dusk` });
      else if (end > dusk) lines.push({ tone: "warning", icon: "sunset.fill", text: `Sunset is ${formatTime(dusk)}, before the game ends` });
      else lines.push({ tone: "success", icon: "sun.max.fill", text: `Daylight until ${formatTime(dusk)}` });
    } else if (rules.hours === "events-only") {
      lines.push({ tone: "warning", icon: "exclamationmark.triangle.fill", text: "Booked events only, no drop-in play. Reserve it first." });
    } else if (rules.hours === "hadley-calendar") {
      if (!feeds) lines.push({ tone: "neutral", icon: "clock", text: "Checking Hadley's hours…" });
      else if (!feeds.hadley) lines.push({ tone: "neutral", icon: "clock", text: "Couldn't load Hadley's hours" });
      else if (day > coveredUntil(feeds.hadley)) lines.push({ tone: "neutral", icon: "clock", text: "Hadley hasn't posted hours for that day yet" });
      else {
        const open = occurrencesOn(feeds.hadley, day).filter((o) => /open/i.test(o.summary) && !/closed|test/i.test(o.summary));
        const hours = open.map((o) => `${formatTime(o.start)}–${formatTime(o.end)}`).join(", ");
        if (open.length === 0) {
          blocked = "Hadley is closed that day.";
          lines.push({ tone: "danger", icon: "xmark.circle.fill", text: "Hadley is closed that day" });
        } else if (!open.some((o) => o.start <= input.start && o.end >= end)) {
          blocked = `Hadley is open ${hours} that day.`;
          lines.push({ tone: "danger", icon: "xmark.circle.fill", text: `Hadley is closed then · open ${hours}` });
        } else lines.push({ tone: "success", icon: "checkmark.circle.fill", text: `Hadley is open ${hours}` });
      }
    }

    const cutoff = now.getTime() - NOTICE_DAYS * 86_400_000;
    for (const n of feeds?.notices ?? []) {
      const forHadley = /hadley/i.test(n.title);
      const matches = rules.notices?.test(n.title) && (input.locationId === "hadley" || !forHadley);
      if (matches && n.date.getTime() >= cutoff) lines.push({ tone: "warning", icon: "megaphone.fill", text: `Rec notice: ${n.title}`, url: n.url });
    }
  }

  const clashes = games.filter(
    (g) => g.id !== input.editingId && g.status === "open" && g.locationId === input.locationId && new Date(g.startsAt) < end && new Date(new Date(g.startsAt).getTime() + g.durationMin * 60_000) > input.start
  );
  if (clashes.length) {
    const first = clashes[0];
    lines.push({
      tone: "warning",
      icon: "person.3.fill",
      text: clashes.length === 1 ? `Another SportsLink game is here at ${formatTime(first.startsAt)}` : `${clashes.length} other SportsLink games overlap here`,
    });
  }

  return { lines, blocked, reserve: rules?.reserve ?? null };
}
