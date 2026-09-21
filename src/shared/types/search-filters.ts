import { z } from "zod";
import { loadBoardIdSchema } from "./load-board";
import { loadStatusSchema } from "./load";

export const locationFilterSchema = z.object({
  states: z.array(z.string().min(2).max(2)).optional(),
  cities: z.array(z.string().min(1)).optional(),
  postalCodes: z.array(z.string().min(3)).optional(),
  radiusMiles: z.number().int().positive().max(1_000).optional()
});

export type LocationFilter = z.infer<typeof locationFilterSchema>;

export const searchFiltersSchema = z.object({
  sources: z.array(loadBoardIdSchema).optional(),
  origin: locationFilterSchema.optional(),
  destination: locationFilterSchema.optional(),
  availableFrom: z.string().datetime().optional(),
  availableTo: z.string().datetime().optional(),
  minPriceCents: z.number().int().nonnegative().optional(),
  maxPriceCents: z.number().int().nonnegative().optional(),
  minRatePerMileCents: z.number().int().nonnegative().optional(),
  maxDistanceMiles: z.number().int().positive().optional(),
  vehicleCountMin: z.number().int().positive().max(20).optional(),
  vehicleCountMax: z.number().int().positive().max(20).optional(),
  vehicleTypes: z.array(z.string().min(1)).optional(),
  operability: z.enum(["all", "operable", "inoperable"]).optional(),
  trailerType: z.enum(["all", "open", "enclosed", "driveaway"]).optional(),
  postedWithinHours: z.number().int().positive().max(720).optional(),
  readyToShipWithinDays: z.number().int().nonnegative().max(90).optional(),
  centralDispatch: z
    .object({
      paymentTypes: z
        .array(z.enum(["LOAD_PAYMENTS", "COD_COP", "COD_COP_QUICKPAY_COMCHEK"]))
        .optional(),
      desiredDeliveryDate: z.string().date().optional(),
      vehicleYearMakeModel: z.string().max(100).optional(),
      shipperOrderIds: z.array(z.string().min(4)).optional(),
      shipperStatus: z.enum(["not-blocked", "all", "preferred"]).optional(),
      minimumRating: z.enum(["all", "1", "2", "3", "4"]).optional(),
      tagListingsPostedWithinHours: z.number().int().positive().max(24).optional(),
      showTaggedOnTop: z.boolean().optional()
    })
    .optional(),
  superDispatch: z
    .object({
      paymentMethods: z
        .array(
          z.enum([
            "cashiers_check",
            "check",
            "cash",
            "ach",
            "comchek",
            "superpay",
            "direct_deposit",
            "credit_card",
            "zelle",
            "venmo",
            "cashapp",
            "money_order",
            "other"
          ])
        )
        .optional(),
      carrierAction: z.enum(["all", "bookable", "requestable"]).optional(),
      verificationStatus: z.enum(["all", "approved"]).optional(),
      certificateRequirement: z.enum(["all", "required", "not-required"]).optional(),
      pickupVenueType: z.enum(["all", "dealer", "auction", "private", "other"]).optional(),
      deliveryVenueType: z.enum(["all", "dealer", "auction", "private", "other"]).optional(),
      searchAlongRoute: z.boolean().optional(),
      outOfRouteDistanceMiles: z.number().int().positive().max(250).optional(),
      shipperMode: z.enum(["include", "exclude"]).optional(),
      shipperNames: z.array(z.string().min(2).max(120)).max(20).optional()
    })
    .optional(),
  statuses: z.array(loadStatusSchema).optional(),
  sort: z
    .object({
      field: z.enum(["postedAt", "price", "distanceMiles"]),
      direction: z.enum(["asc", "desc"])
    })
    .optional()
});

export type SearchFilters = z.infer<typeof searchFiltersSchema>;
