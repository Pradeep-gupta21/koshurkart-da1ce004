import type { ToolRegistry } from "../registry";
import { DelegateTaskTool } from "./delegate.tool";
import { DispatchJobTool } from "./dispatch_job.tool";

export { DelegateTaskTool } from "./delegate.tool";
export { DispatchJobTool } from "./dispatch_job.tool";
export type { AgentTaskPayload, DispatchJobInput } from "./dispatch_job.tool";

/**
 * Creates an array of all system-level tools.
 */
export function createSystemTools() {
  return [
    new DelegateTaskTool(),
    new DispatchJobTool(),
  ];
}

/**
 * Convenience method to register all system tools into a registry.
 */
export function registerSystemTools(registry: ToolRegistry): ToolRegistry {
  registry.registerMany(createSystemTools());
  return registry;
}
