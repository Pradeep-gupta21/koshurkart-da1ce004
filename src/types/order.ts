export interface CartItem {
  product: import('./product').Product;
  quantity: number;
}

export interface OrderItem {
  productId: string;
  vendorId: string;
  price: number;
  quantity: number;
  title: string;
  image: string;
}

export type ShippingStatus = 'pending' | 'shipped' | 'in_transit' | 'out_for_delivery' | 'delivered';

export interface ShipmentEvent {
  id: string;
  orderId: string;
  status: ShippingStatus;
  description: string;
  location: string | null;
  createdAt: string;
}

export interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  totalAmount: number;
  paymentStatus: 'pending' | 'completed' | 'failed';
  orderStatus: 'processing' | 'shipped' | 'delivered' | 'cancelled';
  shippingProvider: string | null;
  trackingId: string | null;
  shippingStatus: ShippingStatus;
  estimatedDelivery: string | null;
  courierApiConfig: Record<string, unknown>;
  createdAt: string;
}
