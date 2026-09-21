import { z } from "zod";
import { loadBoardIdSchema } from "./load-board";

export const browserViewBoundsSchema = z.object({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  width: z.number().int().min(320),
  height: z.number().int().min(240)
});

export const loadBoardBrowserRequestSchema = z.object({
  boardId: loadBoardIdSchema,
  bounds: browserViewBoundsSchema
});

export const loadBoardBrowserActionSchema = z.object({
  boardId: loadBoardIdSchema,
  action: z.enum(["back", "forward", "reload", "home"])
});
