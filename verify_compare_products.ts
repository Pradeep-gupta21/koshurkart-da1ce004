import * as fs from "fs";
const envStr = fs.readFileSync(".env", "utf-8");
for (const line of envStr.split("\n")) {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim();
}

// Polyfill import.meta.env for tsx
(globalThis as any).import = { meta: { env: process.env } };
(global as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
(globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

async function verifyCompareProducts() {
  console.log("=== Verifying Compare Products Capability ===\n");

  const { CommerceToolRegistrar } = await import('./src/ai/tools/commerce/registration/CommerceToolRegistrar');
  const { ToolRegistry } = await import('./src/ai/tools/registry');
  const { CompareProductsTool } = await import('./src/ai/tools/commerce/product/CompareProductsTool');
  const { CUSTOMER_SYSTEM_PROMPT } = await import('./src/ai/prompts/customer.system');

  // 1. Verify Registration
  const registry = new ToolRegistry();
  CommerceToolRegistrar.register(registry);
  const tool = registry.get("compare_products");
  
  if (!tool) {
    console.error("❌ compare_products tool is not registered.");
    process.exit(1);
  } else {
    console.log("✅ compare_products tool is registered successfully.");
  }

  // 2. Verify Prompt Routing
  const promptText = CUSTOMER_SYSTEM_PROMPT.toString();
  const requiredPhrases = [
    "Compare these two shawls",
    "Which walnut carving is better?",
    "Compare saffron products",
    "Which carpet should I buy?",
    "Compare these products"
  ];
  let allPhrasesFound = true;
  for (const phrase of requiredPhrases) {
    if (!promptText.includes(phrase)) {
      console.error(`❌ Prompt is missing phrase: "${phrase}"`);
      allPhrasesFound = false;
    }
  }
  if (allPhrasesFound) {
    console.log("✅ Prompt includes all required compare_products routing phrases.");
  }

  // Mock Context for execution
  const mockContext: any = {
    services: {
      product: {}
    }
  };

  const compareTool = new CompareProductsTool();

  // 3. Verify Validation Logic
  console.log("\n--- Testing Validation ---");
  const errNoInput = compareTool.execute({} as any, mockContext);
  if ((await errNoInput).ok === false) {
    console.log("✅ Handled empty input correctly.");
  }

  const errOneId = compareTool.execute({ productIds: ["prod-1"] } as any, mockContext);
  if ((await errOneId).ok === false) {
    console.log("✅ Handled single product ID correctly (requires >= 2).");
  }

  const errOneName = compareTool.execute({ productNames: ["Pashmina"] } as any, mockContext);
  if ((await errOneName).ok === false) {
    console.log("✅ Handled single product name correctly (requires >= 2).");
  }

  // 4. Test execution logic with a general query
  console.log("\n--- Testing Execution (Query) ---");
  const resQuery = await compareTool.execute({ query: "saffron" } as any, mockContext);
  if (resQuery.ok) {
    console.log(`✅ Execution succeeded for general query "saffron".`);
    console.log(`Returned ${resQuery.data.products.length} products.`);
    if (resQuery.data.products.length >= 2) {
      console.log("✅ Compared at least 2 products.");
    }
    if (resQuery.data.recommendation) {
      console.log(`✅ Recommendation generated: ${resQuery.data.recommendation}`);
    } else {
      console.error("❌ Recommendation generation failed.");
    }
    
    if (resQuery.data.products.length > 0) {
      const p = resQuery.data.products[0];
      if ('title' in p && 'price' in p && 'rating' in p) {
        console.log("✅ Products contain structured attributes.");
      }
    }
  } else {
    console.error("❌ Execution failed for general query:", resQuery.error.message);
  }

  console.log("\n=== Verification Complete ===");
}

verifyCompareProducts().catch(console.error);
