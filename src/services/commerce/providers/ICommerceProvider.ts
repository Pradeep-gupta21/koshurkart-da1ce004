import { IProductService } from '../interfaces/IProductService';
import { ICartService } from '../interfaces/ICartService';
import { IWishlistService } from '../interfaces/IWishlistService';
import { IOrderService } from '../interfaces/IOrderService';
import { ICustomerService } from '../interfaces/ICustomerService';
import { IInventoryService } from '../interfaces/IInventoryService';
import { IReviewService } from '../interfaces/IReviewService';

export interface ICommerceProvider {
  get name(): string;
  initialize(): Promise<void>;
  getProductService(): IProductService;
  getCartService(): ICartService;
  getWishlistService(): IWishlistService;
  getOrderService(): IOrderService;
  getCustomerService(): ICustomerService;
  getInventoryService(): IInventoryService;
  getReviewService(): IReviewService;
}
