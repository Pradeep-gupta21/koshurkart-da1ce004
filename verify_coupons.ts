// Mock localStorage for Node environment
(global as any).localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
};

// Mock Supabase environment variables
process.env.VITE_SUPABASE_URL = "https://example.supabase.co";
process.env.VITE_SUPABASE_ANON_KEY = "dummy_key";

async function verifyCoupons() {
  const { ToolRegistry } = await import("./src/ai/tools/registry");
  const { registerCommerceTools } = await import("./src/ai/tools/commerce");

  console.log("=== Verifying Coupons & Promotions Tools ===\n");
  const registry = new ToolRegistry();
  registerCommerceTools(registry);

  const getAvailableCouponsTool = registry.get("get_available_coupons");
  const applyCouponTool = registry.get("apply_coupon");
  const recommendBestCouponTool = registry.get("recommend_best_coupon");

  if (!getAvailableCouponsTool || !applyCouponTool || !recommendBestCouponTool) {
    console.error("❌ Failed to register one or more coupon tools.");
    process.exit(1);
  } else {
    console.log("✅ All 3 coupon tools registered successfully.\n");
  }

  // 1. Get Available Coupons
  console.log("--- Testing get_available_coupons ---");
  const availableResult = await getAvailableCouponsTool.execute({}, {} as any);
  console.log(JSON.stringify(availableResult, null, 2));
  console.log("✅ get_available_coupons executed successfully.\n");

  // 2. Apply Coupon (Valid)
  console.log("--- Testing apply_coupon (Valid - WELCOME10) ---");
  const applyValidResult = await applyCouponTool.execute({
    couponCode: "WELCOME10",
    cartTotal: 1500,
    cartCategories: ["pashmina"],
    cartVendors: [],
  }, {} as any);
  console.log(JSON.stringify(applyValidResult, null, 2));
  if ((applyValidResult as any).data?.eligible) {
    console.log("✅ apply_coupon validated successfully.\n");
  } else {
    console.error("❌ apply_coupon failed validation.");
  }

  // 3. Apply Coupon (Invalid - Below Min Purchase)
  console.log("--- Testing apply_coupon (Invalid - Below Min Purchase SAVE500) ---");
  const applyInvalidResult = await applyCouponTool.execute({
    couponCode: "SAVE500",
    cartTotal: 2500,
  }, {} as any);
  console.log(JSON.stringify(applyInvalidResult, null, 2));
  if (!(applyInvalidResult as any).data?.eligible) {
    console.log("✅ apply_coupon invalidation (min purchase) successful.\n");
  } else {
    console.error("❌ apply_coupon failed invalidation.");
  }

  // 4. Recommend Best Coupon
  console.log("--- Testing recommend_best_coupon ---");
  const recommendResult = await recommendBestCouponTool.execute({
    cartTotal: 5000,
    cartCategories: ["pashmina"],
    cartVendors: ["v_bashir"], // ARTISAN15: 15% (750), WELCOME10: 10% (500), SAVE500: (500), PASHMINA20: 20% (1000)
  }, {} as any);
  console.log(JSON.stringify(recommendResult, null, 2));
  if ((recommendResult as any).data?.coupon?.code === "PASHMINA20") {
    console.log("✅ recommend_best_coupon successfully recommended highest savings.\n");
  } else {
    console.error("❌ recommend_best_coupon failed to recommend highest savings.");
  }
}

verifyCoupons().catch(console.error);
