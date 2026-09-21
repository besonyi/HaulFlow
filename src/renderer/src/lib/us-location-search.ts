import type { ZipCode } from "zipcodes";
import type { LocationSuggestion } from "@shared/types/location-search";

interface CityEntry {
  city: string;
  state: string;
  stateName: string;
  searchText: string;
  zipCount: number;
}

interface StateEntry {
  state: string;
  stateName: string;
  searchText: string;
}

let cityEntries: CityEntry[] | undefined;
let stateEntries: StateEntry[] | undefined;
let zipEntries: ZipCode[] | undefined;
let stateNames: Record<string, string> = {};
let locationIndexPromise: Promise<void> | undefined;

export async function findLocationSuggestions(
  rawQuery: string,
  stateHint?: string,
  limit = 8
): Promise<LocationSuggestion[]> {
  const query = normalize(rawQuery);
  if (query.length < 2) return [];
  await ensureLocationIndex();

  const normalizedState = stateHint?.trim().toUpperCase();
  if (/^\d+$/.test(query)) {
    return getZipEntries()
      .filter((entry) => entry.zip.startsWith(query))
      .slice(0, limit)
      .map((entry) => ({
        id: `zip-${entry.zip}`,
        provider: "local" as const,
        city: entry.city,
        state: entry.state,
        stateName: stateName(entry.state),
        postalCode: entry.zip,
        kind: "zip" as const,
        primaryText: `${entry.city}, ${entry.state}`,
        secondaryText: stateName(entry.state)
      }));
  }

  const matches = [
    ...getStateEntries().flatMap((entry) => {
      const score = stateScore(entry, query);
      return score === undefined ? [] : [{ entry, score, kind: "state" as const }];
    }),
    ...getCityEntries()
    .flatMap((entry) => {
      const score = locationScore(entry, query, normalizedState);
      return score === undefined ? [] : [{ entry, score, kind: "city" as const }];
    })
  ];

  return matches
    .sort(
      (left, right) =>
        left.score - right.score ||
        (right.kind === "city" ? right.entry.zipCount : 0) -
          (left.kind === "city" ? left.entry.zipCount : 0) ||
        left.entry.stateName.localeCompare(right.entry.stateName) ||
        left.entry.state.localeCompare(right.entry.state)
    )
    .slice(0, limit)
    .map(({ entry, kind }) => {
      if (kind === "city") {
        const city = entry as CityEntry;
        return {
          id: `city-${city.city}-${city.state}`,
          provider: "local" as const,
          city: city.city,
          state: city.state,
          stateName: city.stateName,
          kind: "city" as const,
          primaryText: `${city.city}, ${city.state}`,
          secondaryText: city.stateName,
          zipCount: city.zipCount
        };
      }

      const state = entry as StateEntry;
      return {
        id: `state-${state.state}`,
        provider: "local" as const,
        state: state.state,
        stateName: state.stateName,
        kind: "state" as const,
        primaryText: state.stateName,
        secondaryText: state.state
      };
    });
}

function getZipEntries(): ZipCode[] {
  return zipEntries ?? [];
}

function getCityEntries(): CityEntry[] {
  if (cityEntries) return cityEntries;

  const unique = new Map<string, CityEntry>();
  for (const entry of getZipEntries()) {
    const key = `${normalize(entry.city)}|${entry.state}`;
    const current = unique.get(key);
    if (current) {
      current.zipCount += 1;
      continue;
    }

    unique.set(key, {
      city: entry.city,
      state: entry.state,
      stateName: stateName(entry.state),
      searchText: normalize(`${entry.city} ${entry.state} ${stateName(entry.state)}`),
      zipCount: 1
    });
  }

  cityEntries = [...unique.values()];
  return cityEntries;
}

function getStateEntries(): StateEntry[] {
  if (stateEntries) return stateEntries;
  stateEntries = Object.entries(stateNames).map(([state, displayName]) => ({
    state,
    stateName: stateName(state),
    searchText: normalize(`${state} ${displayName}`)
  }));
  return stateEntries;
}

function locationScore(entry: CityEntry, query: string, stateHint?: string): number | undefined {
  const city = normalize(entry.city);
  const words = query.split(" ").filter(Boolean);
  let score: number | undefined;

  if (city === query) score = 0;
  else if (city.startsWith(query)) score = 10;
  else if (entry.searchText.startsWith(query)) score = 20;
  else if (words.every((word) => entry.searchText.includes(word))) score = 30;
  else if (city.includes(query)) score = 40;

  if (score === undefined) return undefined;
  if (stateHint && entry.state === stateHint) score -= 5;
  return score;
}

function stateScore(entry: StateEntry, query: string): number | undefined {
  const stateName = normalize(entry.stateName);
  if (entry.state.toLowerCase() === query || stateName === query) return 0;
  if (stateName.startsWith(query) || entry.state.toLowerCase().startsWith(query)) return 10;
  if (entry.searchText.includes(query)) return 20;
  return undefined;
}

function stateName(abbreviation: string): string {
  const name = stateNames[abbreviation] ?? abbreviation;
  return name
    .toLowerCase()
    .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

async function ensureLocationIndex(): Promise<void> {
  if (zipEntries) return;
  locationIndexPromise ??= import("zipcodes").then(({ codes, states }) => {
    zipEntries = Object.values(codes).filter(
      (entry) => entry.country === "US" && /^[A-Z]{2}$/.test(entry.state)
    );
    stateNames = states.abbr;
    stateEntries = undefined;
  });
  await locationIndexPromise;
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
