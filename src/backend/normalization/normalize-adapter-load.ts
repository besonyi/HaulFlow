import type { Load } from "@shared/types/load";
import type { AdapterLoadCandidate } from "../adapters/load-board-adapter";

/** Converts a provider candidate into the stable app-wide Load shape. */
export function normalizeAdapterLoad(candidate: AdapterLoadCandidate): Load {
  const ratePerMileCents =
    candidate.price && candidate.distanceMiles && candidate.distanceMiles > 0
      ? Math.round(candidate.price.amountCents / candidate.distanceMiles)
      : undefined;

  return {
    id: `${candidate.source}:${candidate.externalId}`,
    source: candidate.source,
    externalId: candidate.externalId,
    pickup: candidate.pickup,
    delivery: candidate.delivery,
    vehicles: candidate.vehicles,
    trailerType: candidate.trailerType,
    price: candidate.price,
    distanceMiles: candidate.distanceMiles,
    ratePerMileCents,
    postedAt: candidate.postedAt,
    updatedAt: candidate.rawUpdatedAt ?? new Date().toISOString(),
    sourceUrl: candidate.sourceUrl,
    status: candidate.status ?? "available",
    details: candidate.details
  };
}
