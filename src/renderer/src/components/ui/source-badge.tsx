/* eslint-disable react-refresh/only-export-components */
import type { LoadBoardId } from "@shared/types/load-board";
import { cn } from "@/lib/utils";

const labels: Record<LoadBoardId, string> = {
  "central-dispatch": "CD",
  "super-dispatch": "SD",
  "ship-cars": "SC"
};

const names: Record<LoadBoardId, string> = {
  "central-dispatch": "Central Dispatch",
  "super-dispatch": "Super Dispatch",
  "ship-cars": "Ship.Cars"
};

const tones: Record<LoadBoardId, string> = {
  "central-dispatch": "border-violet-400/30 bg-violet-400/10 text-violet-200",
  "super-dispatch": "border-cyan-400/30 bg-cyan-400/10 text-cyan-200",
  "ship-cars": "border-amber-400/30 bg-amber-400/10 text-amber-200"
};

export function sourceLabel(source: LoadBoardId): string {
  return names[source];
}

export function SourceBadge({ source, compact = false, className }: { source: LoadBoardId; compact?: boolean; className?: string }): JSX.Element {
  return (
    <span title={names[source]} className={cn("inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold tracking-[0.12em]", tones[source], className)}>
      {compact ? labels[source] : names[source]}
    </span>
  );
}

export function SourceBadges({ source, duplicates = [] }: { source: LoadBoardId; duplicates?: LoadBoardId[] }): JSX.Element {
  return (
    <span className="flex flex-wrap gap-1">
      {[...new Set([source, ...duplicates])].map((id) => <SourceBadge key={id} source={id} compact />)}
    </span>
  );
}
