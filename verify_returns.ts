import './mock.ts';
import { ToolRegistry, ToolExecutor } from './src/ai/tools';
import { registerCommerceTools } from './src/ai/tools/commerce';

async function verifyReturns() {
  console.log("=== Returns & Refund Intelligence Verification ===");

  const registry = new ToolRegistry();
  registerCommerceTools(registry);

  // Provide mock services for verification
  const mockContext = {
    audience: 'customer',
    services: {
      order: {
        getOrder: async (orderId: string) => {
          if (orderId === '123') {
            return {
              success: true,
              data: {
                id: '123',
                status: 'delivered',
                items: [
                  { id: 'prod1', price: 50, quantity: 2 }
                ]
              }
            };
          }
          return { success: false, error: { message: "Order not found" } };
        }
      }
    }
  } as any;

  const executor = new ToolExecutor(registry, mockContext);

  console.log("\n1. Validating Registration");
  const policyTool = registry.get('get_return_policy');
  const createTool = registry.get('create_return_request');
  const trackTool = registry.get('track_return');
  const estimateTool = registry.get('estimate_refund');

  console.log(`get_return_policy registered: ${!!policyTool}`);
  console.log(`create_return_request registered: ${!!createTool}`);
  console.log(`track_return registered: ${!!trackTool}`);
  console.log(`estimate_refund registered: ${!!estimateTool}`);

  console.log("\n2. Validating Return Policy (get_return_policy)");
  const policyResult = await executor.execute('get_return_policy', {});
  console.log("Return Policy:", JSON.stringify(policyResult.data, null, 2));
  
  console.log("\n3. Validating Return Creation (create_return_request)");
  const createResult = await executor.execute('create_return_request', { 
    orderId: '123', 
    productId: 'prod1', 
    quantity: 1, 
    reason: 'Defective' 
  });
  console.log("Create Return:", JSON.stringify(createResult.data, null, 2));

  console.log("\n4. Validating Error Handling - Invalid Order (create_return_request)");
  const invalidCreateResult = await executor.execute('create_return_request', { 
    orderId: '999', 
    productId: 'prod1', 
    quantity: 1, 
    reason: 'Defective' 
  });
  console.log("Invalid Order Create:", JSON.stringify(invalidCreateResult, null, 2));

  console.log("\n5. Validating Return Tracking (track_return)");
  const trackResult = await executor.execute('track_return', { returnId: 'RTN-123456' });
  console.log("Track Return:", JSON.stringify(trackResult.data, null, 2));

  console.log("\n6. Validating Refund Estimation (estimate_refund)");
  const estimateResult = await executor.execute('estimate_refund', { orderId: '123', productId: 'prod1', quantity: 1 });
  console.log("Estimate Refund:", JSON.stringify(estimateResult.data, null, 2));
}

verifyReturns().catch(console.error);
