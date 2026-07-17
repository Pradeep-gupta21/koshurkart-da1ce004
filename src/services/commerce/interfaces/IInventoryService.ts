import { Result, CommerceError } from '../types/Result';

export interface IInventoryService {
  getStockLevel(productId: string): Promise<Result<{ stock: number; reserved_stock: number }, CommerceError>>;
  checkStockAvailability(productId: string, quantity: number): Promise<Result<boolean, CommerceError>>;
  reserveInventory(productId: string, quantity: number): Promise<Result<any, CommerceError>>;
  releaseReservedInventory(productId: string, quantity: number): Promise<Result<any, CommerceError>>;
  updateStock(productId: string, newStock: number): Promise<Result<any, CommerceError>>;
}
