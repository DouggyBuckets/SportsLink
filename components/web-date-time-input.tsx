import { useAppTheme } from "@/components/theme";
import { fonts, typeScale } from "@/constants/theme";

// The native date/time picker renders nothing on web, so the post form uses
// the browser's own date and time inputs there. Web only: never render this
// on iOS or Android.
type Props = { mode: "date" | "time"; value: Date; min?: Date; onChange: (d: Date) => void };

const pad = (n: number) => String(n).padStart(2, "0");
const dateValue = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeValue = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

export function WebDateTimeInput({ mode, value, min, onChange }: Props) {
  const { colors, scheme } = useAppTheme();
  return (
    <input
      type={mode}
      value={mode === "date" ? dateValue(value) : timeValue(value)}
      min={mode === "date" && min ? dateValue(min) : undefined}
      step={mode === "time" ? 300 : undefined}
      onChange={(e) => {
        if (!e.target.value) return;
        // Keep the other half (time or date) of the current value.
        const next = new Date(value);
        if (mode === "date") {
          const [y, m, d] = e.target.value.split("-").map(Number);
          next.setFullYear(y, m - 1, d);
        } else {
          const [h, min] = e.target.value.split(":").map(Number);
          next.setHours(h, min, 0, 0);
        }
        onChange(next);
      }}
      style={{
        fontFamily: fonts.bodyMedium,
        fontSize: typeScale.body,
        color: colors.text,
        backgroundColor: colors.fill,
        colorScheme: scheme,
        border: "none",
        borderRadius: 8,
        padding: "7px 12px",
      }}
    />
  );
}
