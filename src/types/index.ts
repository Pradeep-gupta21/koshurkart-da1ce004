export interface Product {
  id: string;
  vendorId: string;
  vendorName: string;
  title: string;
  slug: string;
  description: string;
  images: string[];
  price: number;
  discountPrice?: number;
  stock: number;
  category: string;
  rating: number;
  reviewCount: number;
  isSponsored?: boolean;
  createdAt: string;
}

export interface Vendor {
  id: string;
  storeName: string;
  storeSlug: string;
  logo: string;
  description: string;
  rating: number;
  totalSales: number;
  verificationStatus: 'pending' | 'approved' | 'rejected';
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface Review {
  id: string;
  userId: string;
  userName: string;
  productId: string;
  rating: number;
  comment: string;
  isVerifiedPurchase: boolean;
  createdAt: string;
}

export interface Order {
  id: string;
  userId: string;
  items: {
    productId: string;
    vendorId: string;
    price: number;
    quantity: number;
    title: string;
    image: string;
  }[];
  totalAmount: number;
  paymentStatus: 'pending' | 'completed' | 'failed';
  orderStatus: 'processing' | 'shipped' | 'delivered' | 'cancelled';
  createdAt: string;
}
