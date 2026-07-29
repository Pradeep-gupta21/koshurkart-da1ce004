import { ToolRegistry } from "./src/ai/tools/registry";
import { CommerceToolRegistrar } from "./src/ai/tools/commerce/registration/CommerceToolRegistrar";

const registry = new ToolRegistry();
CommerceToolRegistrar.register(registry);

const defs = registry.toDefinitions("customer");
console.log("Total tools for customer:", defs.length);
console.log("Tools:");
for (const d of defs) {
  console.log("- " + d.name);
}
