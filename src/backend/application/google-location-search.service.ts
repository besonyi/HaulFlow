import type {
  LocationAutocompleteRequest,
  LocationAutocompleteResult,
  LocationResolveRequest,
  LocationSearchStatus,
  LocationSelection,
  LocationSuggestion,
  LocationSuggestionKind
} from "@shared/types/location-search";

const autocompleteUrl = "https://places.googleapis.com/v1/places:autocomplete";
const supportedPredictionTypes = new Set([
  "locality",
  "postal_code",
  "postal_town",
  "administrative_area_level_1",
  "sublocality",
  "sublocality_level_1"
]);

export class GoogleLocationSearchService {
  private readonly apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();

  getStatus(): LocationSearchStatus {
    return this.apiKey
      ? {
          provider: "google",
          googleConfigured: true,
          message: "Google Places suggestions are enabled."
        }
      : {
          provider: "local",
          googleConfigured: false,
          message: "Local U.S. city and ZIP suggestions are active."
        };
  }

  async autocomplete(request: LocationAutocompleteRequest): Promise<LocationAutocompleteResult> {
    if (!this.apiKey) return { provider: "unavailable", suggestions: [] };

    const payload = await this.requestJson(autocompleteUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": this.apiKey,
        "X-Goog-FieldMask": [
          "suggestions.placePrediction.placeId",
          "suggestions.placePrediction.text",
          "suggestions.placePrediction.structuredFormat",
          "suggestions.placePrediction.types"
        ].join(",")
      },
      body: JSON.stringify({
        input: request.input,
        sessionToken: request.sessionToken,
        includedRegionCodes: ["us"],
        includedPrimaryTypes: ["(regions)"],
        languageCode: "en",
        regionCode: "us"
      })
    });

    const root = asRecord(payload);
    const suggestions = Array.isArray(root?.suggestions) ? root.suggestions : [];
    return {
      provider: "google",
      suggestions: suggestions.flatMap(mapGoogleSuggestion).slice(0, 8)
    };
  }

  async resolve(request: LocationResolveRequest): Promise<LocationSelection> {
    if (!this.apiKey) throw new Error("Google Places is not configured.");

    const url = new URL(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(request.placeId)}`
    );
    url.searchParams.set("sessionToken", request.sessionToken);
    url.searchParams.set("languageCode", "en");
    url.searchParams.set("regionCode", "us");

    const payload = await this.requestJson(url.toString(), {
      method: "GET",
      headers: {
        "X-Goog-Api-Key": this.apiKey,
        "X-Goog-FieldMask": "addressComponents,displayName,formattedAddress,types"
      }
    });
    return mapGoogleSelection(payload);
  }

  private async requestJson(url: string, init: RequestInit): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Google Places returned HTTP ${response.status}.`);
      }
      return (await response.json()) as unknown;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Google Places timed out.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function mapGoogleSuggestion(value: unknown): LocationSuggestion[] {
  const suggestion = asRecord(value);
  const prediction = asRecord(suggestion?.placePrediction);
  const placeId = stringValue(prediction?.placeId);
  const types = stringArray(prediction?.types);
  if (!placeId || !types.some((type) => supportedPredictionTypes.has(type))) return [];

  const structured = asRecord(prediction?.structuredFormat);
  const mainText = stringValue(asRecord(structured?.mainText)?.text);
  const secondaryText = stringValue(asRecord(structured?.secondaryText)?.text) ?? "United States";
  const fullText = stringValue(asRecord(prediction?.text)?.text);
  const primaryText = mainText ?? fullText;
  if (!primaryText) return [];

  return [
    {
      id: `google-${placeId}`,
      provider: "google",
      kind: predictionKind(types),
      primaryText,
      secondaryText,
      placeId
    }
  ];
}

function mapGoogleSelection(value: unknown): LocationSelection {
  const root = asRecord(value);
  const components = Array.isArray(root?.addressComponents) ? root.addressComponents : [];
  const findComponent = (...types: string[]): Record<string, unknown> | undefined =>
    components
      .map(asRecord)
      .find((component) => stringArray(component?.types).some((type) => types.includes(type)));

  const cityComponent = findComponent(
    "locality",
    "postal_town",
    "sublocality_level_1",
    "sublocality"
  );
  const stateComponent = findComponent("administrative_area_level_1");
  const postalComponent = findComponent("postal_code");
  const city = stringValue(cityComponent?.longText);
  const state = stringValue(stateComponent?.shortText)?.toUpperCase();
  const stateName = stringValue(stateComponent?.longText);
  const postalCode = stringValue(postalComponent?.longText);

  if (!city && !state && !postalCode) {
    throw new Error("Google Places did not return a usable city, state, or ZIP code.");
  }

  return {
    provider: "google",
    ...(city ? { city } : {}),
    ...(state ? { state } : {}),
    ...(stateName ? { stateName } : {}),
    ...(postalCode ? { postalCode } : {}),
    ...(stringValue(root?.formattedAddress)
      ? { formattedAddress: stringValue(root?.formattedAddress) }
      : {})
  };
}

function predictionKind(types: string[]): LocationSuggestionKind {
  if (types.includes("postal_code")) return "zip";
  if (types.includes("administrative_area_level_1")) return "state";
  return "city";
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}
