import { BaseTool } from "../base.tool";
import type { CommerceServices } from "./types";

/**
 * KoshurKart — BaseCommerceTool
 * =================================================================
 * Abstract base class for all Commerce tools.
 * It strictly binds the tool's dependencies to the `CommerceServices`
 * injection bag, ensuring database/API agnosticism.
 */
export abstract class BaseCommerceTool<
  TInput = Record<string, unknown>,
  TOutput = unknown,
> extends BaseTool<TInput, TOutput, CommerceServices> {
  // Shared commerce-specific validation or authorization logic
  // (e.g. enforcing authentication context for modifying actions)
  // can be added here in the future.
}
