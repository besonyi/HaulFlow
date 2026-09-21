import { z } from "zod";
import { loadStatusSchema, type Load } from "./load";
import { loadBoardIdSchema } from "./load-board";

// A saved load is a normalized snapshot from a provider response.  We keep the
// original record rather than trying to recreate it from display fields later.
const locationSchema = z.object({
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  latitude: z.number().finite().optional(),
  longitude: z.number().finite().optional(),
  metroArea: z.string().optional()
}).passthrough();

const stopSchema = z.object({
  location: locationSchema,
  availableFrom: z.string().optional(),
  availableTo: z.string().optional(),
  locationType: z.string().optional()
}).passthrough();

const vehicleSchema = z.object({}).passthrough();

export const loadSnapshotSchema = z.object({
  id: z.string().min(1),
  source: loadBoardIdSchema,
  externalId: z.string().min(1),
  pickup: stopSchema,
  delivery: stopSchema,
  vehicles: z.array(vehicleSchema),
  trailerType: z.enum(["open", "enclosed", "driveaway"]).optional(),
  price: z.object({ amountCents: z.number().int(), currency: z.literal("USD") }).optional(),
  distanceMiles: z.number().finite().nonnegative().optional(),
  ratePerMileCents: z.number().int().optional(),
  postedAt: z.string().optional(),
  updatedAt: z.string().min(1),
  sourceUrl: z.string().optional(),
  status: loadStatusSchema,
  duplicateSources: z.array(loadBoardIdSchema).optional(),
  isSample: z.boolean().optional()
}).passthrough();

export const savedLoadInputSchema = z.object({ load: loadSnapshotSchema });

export interface SavedLoad {
  /** The normalized provider load ID is stable across saving and reopening. */
  id: string;
  load: Load;
  createdAt: string;
  updatedAt: string;
}

/** The renderer can only submit a normalized Load produced by this application. */
export interface SavedLoadInput {
  load: Load;
}
