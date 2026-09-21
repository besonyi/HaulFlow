import { z } from "zod";
import { browserViewBoundsSchema } from "./load-board-browser";

export const routeMapLocationSchema = z.object({
  city: z.string().trim().min(1).max(120).optional(),
  state: z.string().trim().min(2).max(2).optional(),
  postalCode: z.string().trim().min(3).max(12).optional(),
  latitude: z.number().finite().optional(),
  longitude: z.number().finite().optional()
});

export const routeMapBrowserRequestSchema = z.object({
  origin: routeMapLocationSchema,
  destination: routeMapLocationSchema,
  bounds: browserViewBoundsSchema
});

export const routeMapBrowserActionSchema = z.enum(["back", "forward", "reload"]);

export type RouteMapBrowserAction = z.infer<typeof routeMapBrowserActionSchema>;
export type RouteMapBrowserRequest = z.infer<typeof routeMapBrowserRequestSchema>;

export interface RouteMapBrowserState {
  isLoading: boolean;
  fallback?: boolean;
  currentUrl?: string;
  canGoBack: boolean;
  canGoForward: boolean;
  error?: string;
}
