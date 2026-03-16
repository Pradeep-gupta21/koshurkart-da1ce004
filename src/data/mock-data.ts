import { Product, Vendor, Review } from "@/types";

const productImages = [
  "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600",
  "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600",
  "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=600",
  "https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=600",
  "https://images.unsplash.com/photo-1560343090-f0409e92791a?w=600",
  "https://images.unsplash.com/photo-1491553895911-0055eca6402d?w=600",
  "https://images.unsplash.com/photo-1585386959984-a4155224a1ad?w=600",
  "https://images.unsplash.com/photo-1524592094714-0f0654e20314?w=600",
  "https://images.unsplash.com/photo-1546868871-af0de0ae72be?w=600",
  "https://images.unsplash.com/photo-1583394838336-acd977736f90?w=600",
  "https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=600",
  "https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?w=600",
];

const categories = ["Electronics", "Fashion", "Home & Living", "Sports", "Beauty", "Books"];

export const mockProducts: Product[] = Array.from({ length: 24 }, (_, i) => ({
  reservedStock: 0,
  lowStockThreshold: 5,
  id: `prod-${i + 1}`,
  vendorId: `vendor-${(i % 6) + 1}`,
  vendorName: [`TechNova`, `StyleHouse`, `HomeBliss`, `SportEdge`, `GlowUp`, `ReadMore`][i % 6],
  title: [
    "Premium Wireless Headphones", "Classic Leather Watch", "Smart Fitness Tracker",
    "Designer Sunglasses", "Running Shoes Pro", "Organic Face Serum",
    "Bluetooth Speaker Mini", "Cotton Crew Socks Set", "Ceramic Plant Pot",
    "Studio Monitor Headphones", "Gold Chain Bracelet", "Yoga Mat Premium",
    "Portable Charger 20K", "Linen Blend Shirt", "Scented Candle Set",
    "Mechanical Keyboard", "Silk Sleep Mask", "Resistance Bands Kit",
    "USB-C Hub Adapter", "Canvas Tote Bag", "Essential Oil Diffuser",
    "Noise Cancelling Earbuds", "Denim Jacket Classic", "Indoor Herb Garden Kit"
  ][i],
  slug: `product-${i + 1}`,
  description: "Premium quality product crafted with attention to detail. Designed for modern living with durability and style in mind.",
  images: [productImages[i % productImages.length]],
  price: Math.round((19.99 + Math.random() * 180) * 100) / 100,
  discountPrice: i % 3 === 0 ? Math.round((14.99 + Math.random() * 100) * 100) / 100 : undefined,
  stock: Math.floor(Math.random() * 100) + 5,
  category: categories[i % categories.length],
  rating: Math.round((3.5 + Math.random() * 1.5) * 10) / 10,
  reviewCount: Math.floor(Math.random() * 500) + 10,
  isSponsored: i < 4,
  createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
}));

export const mockVendors: Vendor[] = [
  { id: "vendor-1", storeName: "TechNova", storeSlug: "technova", logo: "https://images.unsplash.com/photo-1633409361618-c73427e4e206?w=100", description: "Cutting-edge electronics and accessories", rating: 4.8, totalSales: 12500, verificationStatus: "approved" },
  { id: "vendor-2", storeName: "StyleHouse", storeSlug: "stylehouse", logo: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=100", description: "Trendy fashion for the modern lifestyle", rating: 4.6, totalSales: 8900, verificationStatus: "approved" },
  { id: "vendor-3", storeName: "HomeBliss", storeSlug: "homebliss", logo: "https://images.unsplash.com/photo-1556228453-efd6c1ff04f6?w=100", description: "Transform your living spaces", rating: 4.7, totalSales: 6700, verificationStatus: "approved" },
  { id: "vendor-4", storeName: "SportEdge", storeSlug: "sportedge", logo: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=100", description: "Performance gear for athletes", rating: 4.5, totalSales: 5400, verificationStatus: "approved" },
  { id: "vendor-5", storeName: "GlowUp", storeSlug: "glowup", logo: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=100", description: "Natural beauty essentials", rating: 4.9, totalSales: 7800, verificationStatus: "approved" },
  { id: "vendor-6", storeName: "ReadMore", storeSlug: "readmore", logo: "https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?w=100", description: "Curated books and stationery", rating: 4.4, totalSales: 3200, verificationStatus: "approved" },
];

export const mockReviews: Review[] = [
  { id: "rev-1", userId: "user-1", userName: "Alex M.", productId: "prod-1", rating: 5, comment: "Absolutely incredible sound quality. Best purchase I've made this year!", isVerifiedPurchase: true, createdAt: "2026-03-10T10:00:00Z" },
  { id: "rev-2", userId: "user-2", userName: "Sarah K.", productId: "prod-1", rating: 4, comment: "Great headphones, comfortable for long use. Battery life could be better.", isVerifiedPurchase: true, createdAt: "2026-03-08T14:30:00Z" },
  { id: "rev-3", userId: "user-3", userName: "James R.", productId: "prod-1", rating: 5, comment: "Premium build quality. The noise cancellation is top-notch.", isVerifiedPurchase: false, createdAt: "2026-03-05T09:15:00Z" },
  { id: "rev-4", userId: "user-4", userName: "Emily C.", productId: "prod-2", rating: 4, comment: "Beautiful watch, looks exactly like the photos. Very happy with it.", isVerifiedPurchase: true, createdAt: "2026-03-12T16:45:00Z" },
];
