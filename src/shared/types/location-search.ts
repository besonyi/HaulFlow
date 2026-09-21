import { z } from "zod";

export const locationAutocompleteRequestSchema = z.object({
  input: z.string().trim().min(2).max(120),
  sessionToken: z.string().uuid()
});

export const locationResolveRequestSchema = z.object({
  placeId: z.string().trim().min(1).max(300),
  sessionToken: z.string().uuid()
});

export type LocationSuggestionKind = "city" | "zip" | "state";

export interface LocationSuggestion {
  id: string;
  provider: "google" | "local";
  kind: LocationSuggestionKind;
  primaryText: string;
  secondaryText: string;
  placeId?: string;
  city?: string;
  state?: string;
  stateName?: string;
  postalCode?: string;
  zipCount?: number;
}

export interface LocationSelection {
  provider: "google" | "local";
  city?: string;
  state?: string;
  stateName?: string;
  postalCode?: string;
  formattedAddress?: string;
}

export interface LocationAutocompleteResult {
  provider: "google" | "unavailable";
  suggestions: LocationSuggestion[];
}

export interface LocationSearchStatus {
  provider: "google" | "local";
  googleConfigured: boolean;
  message: string;
}

export type LocationAutocompleteRequest = z.infer<typeof locationAutocompleteRequestSchema>;
export type LocationResolveRequest = z.infer<typeof locationResolveRequestSchema>;
