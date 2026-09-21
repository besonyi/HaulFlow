import { MapPin, Search } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { LocationSelection, LocationSuggestion } from "@shared/types/location-search";
import { desktopApi } from "@/api/client";
import { findLocationSuggestions } from "@/lib/us-location-search";

interface LocationAutocompleteProps {
  label: string;
  value: string;
  stateHint?: string;
  placeholder: string;
  onValueChange: (value: string) => void;
  onSelect: (selection: LocationSelection) => void;
}

const inputClass =
  "h-10 w-full rounded-md border border-white/10 bg-[#0c0e12] px-3 pl-9 pr-9 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/10";

export function LocationAutocomplete({
  label,
  value,
  stateHint,
  placeholder,
  onValueChange,
  onSelect
}: LocationAutocompleteProps): JSX.Element {
  const inputId = useId();
  const listId = `${inputId}-suggestions`;
  const rootRef = useRef<HTMLDivElement>(null);
  const sessionTokenRef = useRef(crypto.randomUUID());
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const suggestionGroups = groupSuggestions(suggestions);

  useEffect(() => {
    let cancelled = false;
    const query = value.trim();
    if (!isOpen || query.length < 2) {
      setSuggestions([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        let matches: LocationSuggestion[] = [];
        try {
          const googleResult = await desktopApi.locations.autocomplete({
            input: query,
            sessionToken: sessionTokenRef.current
          });
          matches = googleResult.suggestions;
        } catch {
          // The local directory below keeps the field usable if Google is unavailable.
        }

        if (!matches.length) matches = await findLocationSuggestions(query, stateHint);
        if (cancelled) return;
        setSuggestions(matches);
        setActiveIndex(0);
        setIsSearching(false);
      })();
    }, 80);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isOpen, stateHint, value]);

  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent): void {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, []);

  async function selectSuggestion(suggestion: LocationSuggestion): Promise<void> {
    setIsSearching(true);
    try {
      let selection: LocationSelection;
      try {
        selection =
          suggestion.provider === "google" && suggestion.placeId
            ? await desktopApi.locations.resolve({
                placeId: suggestion.placeId,
                sessionToken: sessionTokenRef.current
              })
            : localSelection(suggestion);
      } catch {
        const localMatches = await findLocationSuggestions(value, stateHint);
        const fallback = localMatches[0];
        if (!fallback) {
          setSuggestions([]);
          return;
        }
        selection = localSelection(fallback);
      }
      onSelect(selection);
      setIsOpen(false);
      setSuggestions([]);
      setActiveIndex(0);
      sessionTokenRef.current = crypto.randomUUID();
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <div ref={rootRef} className="relative grid gap-1.5 text-xs font-semibold text-slate-400">
      <label htmlFor={inputId}>{label}</label>
      <span className="relative">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          id={inputId}
          value={value}
          onChange={(event) => {
            if (event.target.value.trim().length < 2 && value.trim().length >= 2) {
              sessionTokenRef.current = crypto.randomUUID();
            }
            onValueChange(event.target.value);
            setSuggestions([]);
            setActiveIndex(0);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={(event) => {
            if (!suggestions.length) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setIsOpen(true);
              setActiveIndex((current) => (current + 1) % suggestions.length);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setIsOpen(true);
              setActiveIndex((current) =>
                current === 0 ? suggestions.length - 1 : current - 1
              );
            } else if (event.key === "Enter" && isOpen) {
              event.preventDefault();
              void selectSuggestion(suggestions[activeIndex]);
            } else if (event.key === "Escape") {
              setIsOpen(false);
            }
          }}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen && suggestions.length > 0}
          aria-controls={listId}
          aria-activedescendant={
            isOpen && suggestions[activeIndex]
              ? `${listId}-${suggestions[activeIndex].id}`
              : undefined
          }
          className={inputClass}
        />
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-300" />
      </span>

      {isOpen && suggestions.length ? (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 top-full z-50 mt-1 max-h-80 w-[360px] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-white/10 bg-[#171a20] p-1.5 shadow-xl shadow-black/40"
        >
          {suggestionGroups.map((group) => (
            <div key={group.kind}>
              <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                {suggestionGroupLabel(group.kind)}
              </div>
              {group.items.map(({ suggestion, index }) => (
                <button
                  id={`${listId}-${suggestion.id}`}
                  key={suggestion.id}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => void selectSuggestion(suggestion)}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition ${
                    index === activeIndex
                      ? "bg-cyan-400/10 text-cyan-100"
                      : "text-slate-300 hover:bg-white/[0.06]"
                  }`}
                >
                  <span>
                    <span className="block text-sm font-semibold">{suggestion.primaryText}</span>
                    <span className="mt-0.5 block text-[11px] font-normal text-slate-500">
                      {suggestion.secondaryText}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-md bg-white/[0.07] px-2 py-1 text-[11px] font-semibold text-slate-400">
                    {suggestionBadge(suggestion)}
                  </span>
                </button>
              ))}
            </div>
          ))}
          <div className="border-t border-white/10 px-3 py-2 text-[10px] font-medium text-slate-500">
            {suggestions.some((suggestion) => suggestion.provider === "google")
              ? "Google Maps"
              : "Local U.S. city and ZIP directory"}
          </div>
        </div>
      ) : null}

      {isOpen && value.trim().length >= 2 && !suggestions.length && !isSearching ? (
        <div className="absolute left-0 top-full z-50 mt-1 w-[360px] max-w-[calc(100vw-2rem)] rounded-lg border border-white/10 bg-[#171a20] px-4 py-3 text-sm font-medium text-slate-400 shadow-xl shadow-black/40">
          No matching U.S. city, ZIP code, or state.
        </div>
      ) : null}
    </div>
  );
}

function localSelection(suggestion: LocationSuggestion): LocationSelection {
  return {
    provider: "local",
    ...(suggestion.city ? { city: suggestion.city } : {}),
    ...(suggestion.state ? { state: suggestion.state } : {}),
    ...(suggestion.stateName ? { stateName: suggestion.stateName } : {}),
    ...(suggestion.postalCode ? { postalCode: suggestion.postalCode } : {})
  };
}

function suggestionBadge(suggestion: LocationSuggestion): string {
  if (suggestion.kind === "state") return "State";
  if (suggestion.postalCode) return suggestion.postalCode;
  if (suggestion.provider === "google") {
    return { city: "City", zip: "ZIP", state: "State" }[suggestion.kind];
  }
  return `${suggestion.zipCount ?? 1} ZIP${suggestion.zipCount === 1 ? "" : "s"}`;
}

function groupSuggestions(
  suggestions: LocationSuggestion[]
): Array<{ kind: LocationSuggestion["kind"]; items: Array<{ suggestion: LocationSuggestion; index: number }> }> {
  const grouped = new Map<
    LocationSuggestion["kind"],
    Array<{ suggestion: LocationSuggestion; index: number }>
  >();
  suggestions.forEach((suggestion, index) => {
    const items = grouped.get(suggestion.kind) ?? [];
    items.push({ suggestion, index });
    grouped.set(suggestion.kind, items);
  });
  return [...grouped].map(([kind, items]) => ({ kind, items }));
}

function suggestionGroupLabel(kind: LocationSuggestion["kind"]): string {
  return { city: "Cities", zip: "ZIP codes", state: "States" }[kind];
}
