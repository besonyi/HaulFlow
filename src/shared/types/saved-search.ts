import { z } from "zod";
import { searchFiltersSchema, type SearchFilters } from "./search-filters";

export const savedSearchInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  filters: searchFiltersSchema
});

export interface SavedSearch {
  id: string;
  name: string;
  filters: SearchFilters;
  createdAt: string;
  updatedAt: string;
}

export type SavedSearchInput = z.infer<typeof savedSearchInputSchema>;
