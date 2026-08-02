import './mock.ts';
import { ToolRegistry, ToolExecutor } from './src/ai/tools';
import { registerCommerceTools } from './src/ai/tools/commerce';

async function verifyShipping() {
  console.log("=== Shipping & Delivery Intelligence Verification ===");

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
                status: 'shipped',
                shippingStatus: 'in_transit',
                shippingProvider: 'Delhivery',
                estimatedDelivery: '2026-08-05'
              }
            };
          }
          return { success: false, error: { message: "Order not found" } };
        },
        trackOrder: async (orderId: string) => {
          if (orderId === '123') {
            return {
              success: true,
              data: [
                { status: 'in_transit', description: 'Arrived at hub', provider: 'Delhivery' },
                { status: 'shipped', description: 'Package picked up', provider: 'Delhivery' }
              ]
            };
          }
          return { success: false, error: { message: "Order not found" } };
        }
      }
    }
  } as any;

  const executor = new ToolExecutor(registry, mockContext);

  console.log("\n1. Validating Registration");
  const optionsTool = registry.get('get_shipping_options');
  const estimateTool = registry.get('estimate_delivery');
  const trackTool = registry.get('track_shipment');

  console.log(`get_shipping_options registered: ${!!optionsTool}`);
  console.log(`estimate_delivery registered: ${!!estimateTool}`);
  console.log(`track_shipment registered: ${!!trackTool}`);

  console.log("\n2. Validating Routing & ETA Calculation (get_shipping_options)");
  const domesticResult = await executor.execute('get_shipping_options', { pincode: '110001' });
  console.log("Domestic options:", JSON.stringify(domesticResult.data, null, 2));
  
  const kashmirResult = await executor.execute('get_shipping_options', { pincode: '190001' });
  console.log("Kashmir options:", JSON.stringify(kashmirResult.data, null, 2));
  
  const intlResult = await executor.execute('get_shipping_options', { pincode: '90210', country: 'US' });
  console.log("International options:", JSON.stringify(intlResult.data, null, 2));

  console.log("\n3. Validating ETA Calculation (estimate_delivery)");
  const estimateResult = await executor.execute('estimate_delivery', { pincode: '190001', shippingMethod: 'express' });
  console.log("Estimate Delivery (Kashmir, Express):", JSON.stringify(estimateResult.data, null, 2));

  console.log("\n4. Validating Tracking Responses & Structured Output (track_shipment)");
  const trackResult = await executor.execute('track_shipment', { orderId: '123' });
  console.log("Track Shipment Result:", JSON.stringify(trackResult.data, null, 2));

  const invalidTrackResult = await executor.execute('track_shipment', { orderId: 'invalid' });
  console.log("Invalid Track Shipment Result:", JSON.stringify(invalidTrackResult, null, 2));
}

verifyShipping().catch(console.error);
