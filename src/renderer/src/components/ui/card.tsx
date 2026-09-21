import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>): JSX.Element {
  return (
    <div
      className={cn("rounded-2xl border border-slate-200/90 bg-white shadow-panel", className)}
      {...props}
    />
  );
}
