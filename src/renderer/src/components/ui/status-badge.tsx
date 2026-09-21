import { cn } from "@/lib/utils";

type Tone = "neutral" | "success" | "warning" | "info";

const tones: Record<Tone, string> = {
  neutral: "bg-white/[0.06] text-slate-300 ring-white/10",
  success: "bg-emerald-400/10 text-emerald-300 ring-emerald-400/25",
  warning: "bg-amber-400/10 text-amber-200 ring-amber-400/25",
  info: "bg-cyan-400/10 text-cyan-200 ring-cyan-400/25"
};

export function StatusBadge({
  children,
  tone = "neutral",
  className
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}): JSX.Element {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
        tones[tone],
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-75" />
      {children}
    </span>
  );
}
