import { BaseCommerceTool } from "../base-commerce.tool";
import type { CommerceToolContext } from "../types";
import { ok, ToolResult } from "../../types";

export interface TrackReturnInput {
  returnId: string;
}

export interface TrackReturnOutput {
  returnId: string;
  status: string;
  currentStage: string;
  refundStatus: string;
  pickupStatus: string;
  expectedCompletion: string;
  message: string;
}

export class TrackReturnTool extends BaseCommerceTool<TrackReturnInput, TrackReturnOutput> {
  readonly name = "track_return";
  readonly description = "Track the status of an existing return request.";

  readonly audiences = ["admin", "customer"] as const;

  readonly parameters: any = {
    type: "object",
    properties: {
      returnId: {
        type: "string",
        description: "The ID of the return request to track.",
      },
    },
    required: ["returnId"],
  };

  protected validate(input: TrackReturnInput): string | null {
    if (!input.returnId) return "returnId is required.";
    return null;
  }

  protected async run(
    input: TrackReturnInput,
    context: CommerceToolContext
  ): Promise<ToolResult<TrackReturnOutput>> {
    // Simulating tracking logic since we are providing intelligence on top of mocked data.
    const expectedCompletion = new Date();
    expectedCompletion.setDate(expectedCompletion.getDate() + 5);

    return ok({
      returnId: input.returnId,
      status: "In Progress",
      currentStage: "Awaiting Pickup",
      refundStatus: "Pending Item Receipt",
      pickupStatus: "Scheduled",
      expectedCompletion: expectedCompletion.toISOString(),
      message: `Return ${input.returnId} is currently awaiting pickup.`,
    });
  }
}
