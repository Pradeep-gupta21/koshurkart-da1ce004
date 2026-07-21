import { ToolRegistry } from '../../registry';
import { ProductSearchTool } from '../product/ProductSearchTool';
import { GetProductTool } from '../product/GetProductTool';
import { GetFeaturedProductsTool } from '../product/GetFeaturedProductsTool';
import { GetLatestProductsTool } from '../product/GetLatestProductsTool';
import { SearchCategoriesTool } from '../product/SearchCategoriesTool';
import { SearchVendorsTool } from '../product/SearchVendorsTool';
import { GetVendorTool } from '../product/GetVendorTool';
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
      new GetProductTool() as unknown as AnyTool,
      new GetFeaturedProductsTool() as unknown as AnyTool,
      new GetLatestProductsTool() as unknown as AnyTool,
      new SearchCategoriesTool() as unknown as AnyTool,
      new SearchVendorsTool() as unknown as AnyTool,
      new GetVendorTool() as unknown as AnyTool,
      new CartTool() as unknown as AnyTool,
      new WishlistTool() as unknown as AnyTool,
      new OrderTool() as unknown as AnyTool,
      new CustomerTool() as unknown as AnyTool,
    ];

    registry.registerMany(tools);
  }
}
