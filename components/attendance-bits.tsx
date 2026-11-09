import { Badge } from "@/components/ui/bits";
import { MARK_CREDIT } from "@/lib/reliability";
import { AttendanceMark } from "@/lib/types";

// What a mark is worth toward the score, shown while marking.
export function MarkCreditBadge({ mark }: { mark: AttendanceMark }) {
  if (mark === "present") return <Badge label="+ full credit" tone="success" />;
  if (mark === "no_show") return <Badge label="counts as a miss" tone="danger" />;
  return <Badge label={`${MARK_CREDIT[mark] * 100}% credit`} tone="warning" />;
}

// How a player was marked, on rosters and in past games.
export function MarkBadge({ mark }: { mark: AttendanceMark }) {
  if (mark === "present") return <Badge label="Showed up" tone="success" icon="checkmark" />;
  if (mark === "late") return <Badge label="Late" tone="warning" />;
  if (mark === "left_early") return <Badge label="Left early" tone="warning" />;
  return <Badge label="No-show" tone="danger" />;
}
