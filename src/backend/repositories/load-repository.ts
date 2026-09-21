import type { Load } from "@shared/types/load";
import type { SearchFilters } from "@shared/types/search-filters";

export interface LoadRepository {
  search(filters: SearchFilters): Promise<Load[]>;
}
