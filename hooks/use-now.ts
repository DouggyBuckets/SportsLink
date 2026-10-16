import { useEffect, useState } from "react";

// Wall-clock time as state, so "has this started?" style checks stay pure
// during render and tick over on their own while a screen sits open.
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
