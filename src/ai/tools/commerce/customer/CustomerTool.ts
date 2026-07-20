import { BaseCommerceTool } from "../base-commerce.tool";
import type { CommerceToolContext } from "../types";
import { ok, err, ToolResult } from "../../types";

export type CustomerAction = "get_profile" | "update_profile" | "get_addresses" | "get_preferences";

export interface CustomerInput {
  action: CustomerAction;
  profileData?: Record<string, any>;
}

export interface CustomerOutput {
  profile?: any;
  addresses?: any[];
  preferences?: any;
  message?: string;
}

export class CustomerTool extends BaseCommerceTool<CustomerInput, CustomerOutput> {
  readonly name = "customer";
  readonly description = "Manage and retrieve customer information (profile, addresses, preferences).";
  
  readonly parameters: any = {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["get_profile", "update_profile", "get_addresses", "get_preferences"],
        description: "The customer action to perform.",
      },
      profileData: {
        type: "object",
        description: "The profile data to update. Required for update_profile action.",
        additionalProperties: true,
      },
    },
    required: ["action"],
  };

  protected validate(input: CustomerInput): string | null {
    if (!["get_profile", "update_profile", "get_addresses", "get_preferences"].includes(input.action)) {
      return "Invalid action. Must be 'get_profile', 'update_profile', 'get_addresses', or 'get_preferences'.";
    }

    if (input.action === "update_profile" && (!input.profileData || Object.keys(input.profileData).length === 0)) {
      return "profileData is required and cannot be empty for 'update_profile' action.";
    }

    return null; // Valid
  }

  protected async run(
    input: CustomerInput,
    context: CommerceToolContext
  ): Promise<ToolResult<CustomerOutput>> {
    const customerService = context.services?.customer;

    if (!customerService) {
      return err({
        code: "unavailable",
        message: "Customer service is not available in the current context.",
        retryable: true,
      });
    }

    try {
      let message = "";
      let profile: any;
      let addresses: any[] | undefined;
      let preferences: any;

      switch (input.action) {
        case "get_profile":
          profile = await customerService.getProfile();
          message = "Customer profile retrieved successfully.";
          return ok({ profile, message });

        case "update_profile":
          profile = await customerService.updateProfile(input.profileData!);
          message = "Customer profile updated successfully.";
          return ok({ profile, message });

        case "get_addresses":
          addresses = await customerService.getAddresses();
          message = "Customer addresses retrieved successfully.";
          return ok({ addresses, message });

        case "get_preferences":
          preferences = await customerService.getPreferences();
          message = "Customer preferences retrieved successfully.";
          return ok({ preferences, message });
      }
    } catch (e) {
      return err({
        code: "execution_error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
