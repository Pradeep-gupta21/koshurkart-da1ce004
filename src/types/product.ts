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
  reservedStock: number;
  lowStockThreshold: number;
  category: string;
  rating: number;
  reviewCount: number;
  isSponsored?: boolean;
  status?: string;
  createdAt: string;
  salesCount: number;
  viewCount: number;
  trendingScore: number;
  tags?: string[];
}

export interface Review {
  id: string;
  userId: string;
  userName: string;
  productId: string;
  rating: number;
  comment: string;
  isVerifiedPurchase: boolean;
  isSuspicious: boolean;
  flaggedReason: string | null;
  moderationStatus: 'pending' | 'approved' | 'rejected';
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
  trustScore: number;
  deliveryRate: number;
  cancellationRate: number;
  returnRate: number;
  reviewRating: number;
  isVerified: boolean;
}
