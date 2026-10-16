import { AvailabilityBlock, Game } from "@/lib/types";

export const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const DAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
// Grid order: the school week first.
export const GRID_DAYS = [1, 2, 3, 4, 5, 6, 0];
// 5am lifts and runs through late-night open gym.
export const GRID_START_HOUR = 5;
export const GRID_END_HOUR = 24;

const cellKey = (day: number, hour: number) => `${day}-${hour}`;

// The editor works in whole-hour cells; storage works in merged blocks.
export function blocksToCells(blocks: AvailabilityBlock[]): Set<string> {
  const cells = new Set<string>();
  for (const b of blocks) {
    for (let h = Math.floor(b.start / 60); h * 60 < b.end; h++) cells.add(cellKey(b.day, h));
  }
  return cells;
}

export function cellsToBlocks(cells: Set<string>): AvailabilityBlock[] {
  const blocks: AvailabilityBlock[] = [];
  for (let day = 0; day < 7; day++) {
    let start: number | null = null;
    for (let h = 0; h <= 24; h++) {
      const on = h < 24 && cells.has(cellKey(day, h));
      if (on && start === null) start = h;
      if (!on && start !== null) {
        blocks.push({ day, start: start * 60, end: h * 60 });
        start = null;
      }
    }
  }
  return blocks;
}

export const hasCell = (cells: Set<string>, day: number, hour: number) => cells.has(cellKey(day, hour));

export function toggleCell(cells: Set<string>, day: number, hour: number, on?: boolean): Set<string> {
  const next = new Set(cells);
  const key = cellKey(day, hour);
  const turnOn = on ?? !next.has(key);
  if (turnOn) next.add(key);
  else next.delete(key);
  return next;
}

// The core of the app: a game fits when one free block covers it end to end.
// Blocks are stored merged (see cellsToBlocks), so a single-block check is
// enough. Must stay in sync with `game_fits_schedule` in the SQL migrations.
export function fitsSchedule(game: Pick<Game, "startsAt" | "durationMin">, blocks: AvailabilityBlock[]): boolean {
  const d = new Date(game.startsAt);
  const start = d.getHours() * 60 + d.getMinutes();
  const end = start + game.durationMin;
  return blocks.some((b) => b.day === d.getDay() && b.start <= start && b.end >= end);
}

export function formatMinutes(min: number, withMeridiem = true): string {
  const h24 = Math.floor(min / 60) % 24;
  const m = min % 60;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  const mer = h24 < 12 ? "am" : "pm";
  return `${h}${m ? `:${String(m).padStart(2, "0")}` : ""}${withMeridiem ? mer : ""}`;
}

export function formatRange(start: number, end: number): string {
  const sameMeridiem = start < 720 === end <= 720 && end < 1440;
  return `${formatMinutes(start, !sameMeridiem)}–${formatMinutes(end)}`;
}

export const weeklyFreeHours = (blocks: AvailabilityBlock[]) => Math.round(blocks.reduce((sum, b) => sum + (b.end - b.start), 0) / 60);

// Short label for the header pill: "Tue/Thu 4pm+" when every free day shares
// one window, otherwise total hours.
export function summarizeAvailability(blocks: AvailabilityBlock[]): string {
  if (blocks.length === 0) return "Set free time";
  const days = [...new Set(blocks.map((b) => b.day))];
  const first = blocks[0];
  const uniform = blocks.length === days.length && blocks.every((b) => b.start === first.start && b.end === first.end);
  if (uniform && days.length <= 4) {
    const dayLabel = GRID_DAYS.filter((d) => days.includes(d))
      .map((d) => DAY_SHORT[d])
      .join("/");
    const time = first.end >= 21 * 60 ? `${formatMinutes(first.start)}+` : formatRange(first.start, first.end);
    return `${dayLabel} ${time}`;
  }
  return `${weeklyFreeHours(blocks)} hrs / week`;
}
