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

export interface Payment {
  id: string;
  userId: string;
  orderId: string;
  amount: number;
  paymentMethod: 'upi' | 'card' | 'netbanking' | 'wallet' | 'cod' | 'razorpay';
  paymentProvider: string | null;
  transactionId: string | null;
  paymentStatus: 'pending' | 'success' | 'failed' | 'refunded' | 'pending_verification';
  platformCommission: number;
  commissionPercentage: number;
  vendorEarnings: number;
  upiId: string | null;
  qrCodeUrl: string | null;
  paymentProof: string | null;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  razorpaySignature: string | null;
  createdAt: string;
}
