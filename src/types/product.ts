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
  status?: string;
  createdAt: string;
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
