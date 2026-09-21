import { z } from "zod";
import { loadBoardIdSchema } from "./load-board";

export const alertRuleKindSchema = z.enum([
  "new-load",
  "minimum-price",
  "minimum-rate",
  "session-expired",
  "adapter-failure"
]);

export type AlertRuleKind = z.infer<typeof alertRuleKindSchema>;

export const alertRuleInputSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    kind: alertRuleKindSchema,
    enabled: z.boolean().default(true),
    sources: z.array(loadBoardIdSchema).max(3).optional(),
    minimumPriceCents: z.number().int().nonnegative().optional(),
    minimumRatePerMileCents: z.number().int().nonnegative().optional()
  })
  .superRefine((value, context) => {
    if (value.kind === "minimum-price" && value.minimumPriceCents === undefined) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["minimumPriceCents"], message: "Minimum price is required." });
    }
    if (value.kind === "minimum-rate" && value.minimumRatePerMileCents === undefined) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["minimumRatePerMileCents"], message: "Minimum rate is required." });
    }
  });

export type AlertRuleInput = z.input<typeof alertRuleInputSchema>;

export interface AlertRule {
  id: string;
  name: string;
  kind: AlertRuleKind;
  enabled: boolean;
  sources?: z.infer<typeof loadBoardIdSchema>[];
  minimumPriceCents?: number;
  minimumRatePerMileCents?: number;
  createdAt: string;
  updatedAt: string;
}
