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

export interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  totalAmount: number;
  paymentStatus: 'pending' | 'completed' | 'failed';
  orderStatus: 'processing' | 'shipped' | 'delivered' | 'cancelled';
  createdAt: string;
}
