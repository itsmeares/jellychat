export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

const avatarHues = [[345, 25], [205, 40], [265, 30], [150, 30], [30, 30], [180, 30]];

export function avatarStyle(seed: string): { background: string } {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const [hue] = avatarHues[hash % avatarHues.length];
  return { background: `linear-gradient(135deg,hsl(${hue} 85% 78%),hsl(${(hue + 20) % 360} 70% 62%))` };
}

export function clock(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function ticksToClock(ticks: number | null): string {
  if (ticks === null) return "";
  const total = Math.max(0, Math.floor(ticks / 10_000_000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
