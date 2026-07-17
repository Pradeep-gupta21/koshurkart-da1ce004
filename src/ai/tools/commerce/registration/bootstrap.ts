import { ToolRegistry } from '../../registry';
import { CommerceToolRegistrar } from './CommerceToolRegistrar';

/**
 * Bootstraps the tool registry by injecting all commerce tools.
 * Provides a clean entry point for application initialization.
 */
export function bootstrapCommerceTools(registry: ToolRegistry): void {
  CommerceToolRegistrar.register(registry);
}
