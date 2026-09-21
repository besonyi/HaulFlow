import { z } from "zod";

export const alertRefreshSettingsSchema = z.object({
  enabled: z.boolean(),
  intervalMinutes: z.union([z.literal(0.5), z.literal(1), z.literal(5), z.literal(10), z.literal(15), z.literal(30)])
});

export type AlertRefreshSettings = z.infer<typeof alertRefreshSettingsSchema>;

export const defaultAlertRefreshSettings: AlertRefreshSettings = { enabled: false, intervalMinutes: 15 };

export interface AlertRefreshStatus {
  isRefreshing: boolean;
  lastStartedAt?: string;
  lastCompletedAt?: string;
  lastError?: string;
}
