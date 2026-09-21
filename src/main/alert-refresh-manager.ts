import type { AlertService } from "@backend/application/alert-service";
import type { LoadAggregationService } from "@backend/application/load-aggregation.service";
import type { AlertRefreshSettings, AlertRefreshStatus } from "@shared/types/alert-refresh-settings";
import type { LoadBoardSummary } from "@shared/types/load-board";

/** Runs only after the user explicitly enables it in Alerts. */
export class AlertRefreshManager {
  private timer?: NodeJS.Timeout;
  private refreshing = false;
  private status: AlertRefreshStatus = { isRefreshing: false };

  constructor(
    private readonly aggregationService: LoadAggregationService,
    private readonly alertService: AlertService,
    private readonly checkBoardHealth: () => Promise<LoadBoardSummary[]>
  ) {}

  configure(settings: AlertRefreshSettings): void {
    this.stop();
    if (!settings.enabled) return;
    this.timer = setInterval(() => void this.refresh(), settings.intervalMinutes * 60_000);
  }

  async refresh(): Promise<void> {
    if (this.refreshing) return;
    this.refreshing = true;
    this.status = { ...this.status, isRefreshing: true, lastStartedAt: new Date().toISOString(), lastError: undefined };
    try {
      const result = await this.aggregationService.search({ statuses: ["available"], sort: { field: "postedAt", direction: "desc" } });
      await this.alertService.evaluateLoads(result.loads);
      await this.alertService.evaluateBoardHealth(await this.checkBoardHealth());
      this.status = { ...this.status, lastCompletedAt: new Date().toISOString() };
    } catch (error) {
      // Individual adapters already report refresh failures in their own status.
      // A timer failure must never disrupt the desktop app.
      this.status = { ...this.status, lastError: error instanceof Error ? error.message : "Refresh failed" };
    } finally {
      this.refreshing = false;
      this.status = { ...this.status, isRefreshing: false };
    }
  }

  getStatus(): AlertRefreshStatus {
    return this.status;
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}
