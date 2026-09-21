import { z } from "zod";
import { loadBoardIdSchema, type LoadBoardId } from "./load-board";

export const loadStatuses = ["available", "assigned", "expired"] as const;
export const loadStatusSchema = z.enum(loadStatuses);

export type LoadStatus = z.infer<typeof loadStatusSchema>;

export interface Location {
  city?: string;
  state?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  metroArea?: string;
}

export interface Stop {
  location: Location;
  availableFrom?: string;
  availableTo?: string;
  locationType?: string;
}

export interface VehicleDimensions {
  lengthInches?: number;
  widthInches?: number;
  heightInches?: number;
}

export interface Vehicle {
  year?: number;
  make?: string;
  model?: string;
  vin?: string;
  operable?: boolean;
  vehicleType?: string;
  quantity?: number;
  color?: string;
  lotNumber?: string;
  weightPounds?: number;
  dimensions?: VehicleDimensions;
  issues?: string[];
  additionalInfo?: string;
}

export interface LoadCompany {
  name?: string;
  contactName?: string;
  phone?: string;
  email?: string;
  hours?: string;
  timeZone?: string;
  tier?: string;
  rating?: number;
  ratingCount?: number;
  overallRating?: number;
  overallRatingCount?: number;
  preferred?: boolean;
  verificationStatus?: string;
  movedVehiclesCount?: number;
}

export interface LoadPaymentDetails {
  codAmountCents?: number;
  codMethod?: string;
  codLocation?: string;
  balanceAmountCents?: number;
  balancePaymentTime?: string;
  balancePaymentMethod?: string;
  processingMethod?: string;
  method?: string;
  terms?: string;
}

export interface LoadCarrierAccess {
  canBook?: boolean;
  canRequest?: boolean;
  certificateRequired?: boolean;
  achPaymentRequired?: boolean;
}

export interface LoadDetails {
  company?: LoadCompany;
  payment?: LoadPaymentDetails;
  shipperOrderId?: string;
  expiresAt?: string;
  desiredDeliveryDate?: string;
  additionalInfo?: string;
  preDispatchNotes?: string;
  requiresInspection?: boolean;
  twicRequired?: boolean;
  pickupDateType?: string;
  deliveryDateType?: string;
  pickupBusinessHoursType?: string;
  deliveryBusinessHoursType?: string;
  carrierAccess?: LoadCarrierAccess;
}

export interface Money {
  /** Integer cents to keep currency calculations precise across IPC and storage. */
  amountCents: number;
  currency: "USD";
}

export interface Load {
  /** Stable ID composed from the source and its provider-side identifier. */
  id: string;
  source: LoadBoardId;
  externalId: string;
  pickup: Stop;
  delivery: Stop;
  vehicles: Vehicle[];
  trailerType?: "open" | "enclosed" | "driveaway";
  price?: Money;
  distanceMiles?: number;
  ratePerMileCents?: number;
  postedAt?: string;
  updatedAt: string;
  sourceUrl?: string;
  status: LoadStatus;
  details?: LoadDetails;
  /** Other boards where the same strongly matched opportunity was found. */
  duplicateSources?: LoadBoardId[];
  /** Marks records intentionally seeded for the Phase 1 UI. */
  isSample?: boolean;
}

export const loadSourceSchema = loadBoardIdSchema;
export type LoadSource = LoadBoardId;
