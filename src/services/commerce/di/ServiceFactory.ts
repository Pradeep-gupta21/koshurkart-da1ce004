import { Container } from './Container';
import { IProductService } from '../interfaces/IProductService';
import { ICartService } from '../interfaces/ICartService';
import { IWishlistService } from '../interfaces/IWishlistService';
import { IOrderService } from '../interfaces/IOrderService';
import { ICustomerService } from '../interfaces/ICustomerService';

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
}
