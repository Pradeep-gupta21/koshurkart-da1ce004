import { ToolRegistry } from '../../registry';
import { ProductSearchTool } from '../product/ProductSearchTool';
import { CartTool } from '../cart/CartTool';
import { WishlistTool } from '../wishlist/WishlistTool';
import { OrderTool } from '../order/OrderTool';
import { CustomerTool } from '../customer/CustomerTool';
import { AnyTool } from '../../types';

export class CommerceToolRegistrar {
  /**
   * Automatically registers all commerce tools into the provided ToolRegistry.
   */
  static register(registry: ToolRegistry): void {
    const tools: AnyTool[] = [
      new ProductSearchTool() as unknown as AnyTool,
      new CartTool() as unknown as AnyTool,
      new WishlistTool() as unknown as AnyTool,
      new OrderTool() as unknown as AnyTool,
      new CustomerTool() as unknown as AnyTool,
    ];

    registry.registerMany(tools);
  }
}
