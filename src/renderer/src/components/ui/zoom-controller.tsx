import { Minus, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { desktopApi } from "@/api/client";

const storageKey = "car-hauler-ui-zoom";
const minimumZoom = 0.8;
const maximumZoom = 1.3;
const zoomStep = 0.1;

function clampZoom(value: number): number {
  return Math.min(maximumZoom, Math.max(minimumZoom, Math.round(value * 10) / 10));
}

export function ZoomController(): JSX.Element {
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);

  function applyZoom(nextValue: number): void {
    const nextZoom = clampZoom(nextValue);
    zoomRef.current = nextZoom;
    setZoom(nextZoom);
    localStorage.setItem(storageKey, String(nextZoom));
    desktopApi.ui.setZoomFactor(nextZoom);
  }

  useEffect(() => {
    const stored = Number(localStorage.getItem(storageKey));
    if (Number.isFinite(stored) && stored > 0) applyZoom(stored);

    function handleWheel(event: WheelEvent): void {
      if (!event.ctrlKey) return;
      event.preventDefault();
      applyZoom(zoomRef.current + (event.deltaY < 0 ? zoomStep : -zoomStep));
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (!event.ctrlKey) return;
      if (event.key === "0") {
        event.preventDefault();
        applyZoom(1);
      }
    }

    window.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("wheel", handleWheel);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const percentage = Math.round(zoom * 100);
  return (
    <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 text-slate-500 shadow-sm" title="Ctrl + mouse wheel changes interface scale. Ctrl + 0 resets it.">
      <button
        type="button"
        className="inline-flex h-6 w-6 items-center justify-center rounded-md transition hover:bg-white hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-40"
        onClick={() => applyZoom(zoom - zoomStep)}
        disabled={zoom <= minimumZoom}
        aria-label="Decrease interface scale"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className="min-w-10 rounded px-1 text-[11px] font-bold tabular-nums text-slate-600 transition hover:bg-white hover:text-sky-700"
        onClick={() => applyZoom(1)}
        aria-label="Reset interface scale"
      >
        {percentage}%
      </button>
      <button
        type="button"
        className="inline-flex h-6 w-6 items-center justify-center rounded-md transition hover:bg-white hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-40"
        onClick={() => applyZoom(zoom + zoomStep)}
        disabled={zoom >= maximumZoom}
        aria-label="Increase interface scale"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
