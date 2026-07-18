import { Container } from './Container';
import { IProductService } from '../interfaces/IProductService';
import { ICartService } from '../interfaces/ICartService';
import { IWishlistService } from '../interfaces/IWishlistService';
import { IOrderService } from '../interfaces/IOrderService';
import { ICustomerService } from '../interfaces/ICustomerService';
import { IInventoryService } from '../interfaces/IInventoryService';
import { IReviewService } from '../interfaces/IReviewService';
import { ISearchService } from '../interfaces/ISearchService';
import { IRecommendationService } from '../interfaces/IRecommendationService';
import { IPaymentService } from '../interfaces/IPaymentService';

export class ServiceFactory {
  static getProductService(): IProductService {
    return Container.resolve<IProductService>('ProductService');
  }

  static getCartService(): ICartService {
    return Container.resolve<ICartService>('CartService');
  }

  static getWishlistService(): IWishlistService {
    return Container.resolve<IWishlistService>('WishlistService');
  }

  static getOrderService(): IOrderService {
    return Container.resolve<IOrderService>('OrderService');
  }

  static getCustomerService(): ICustomerService {
    return Container.resolve<ICustomerService>('CustomerService');
  }

  static getInventoryService(): IInventoryService {
    return Container.resolve<IInventoryService>('InventoryService');
  }

  static getReviewService(): IReviewService {
    return Container.resolve<IReviewService>('ReviewService');
  }

  static getSearchService(): ISearchService {
    return Container.resolve<ISearchService>('SearchService');
  }

  static getRecommendationService(): IRecommendationService {
    return Container.resolve<IRecommendationService>('RecommendationService');
  }

  static getPaymentService(): IPaymentService {
    return Container.resolve<IPaymentService>('PaymentService');
  }
}
