export type CouponType = 'percentage' | 'fixed' | 'free_shipping';

export interface Coupon {
  code: string;
  description: string;
  type: CouponType;
  value: number; // percentage (e.g., 10 for 10%) or fixed amount (e.g., 500 for ₹500), 0 for free shipping
  minPurchase: number;
  expiryDate: string; // ISO string
  categoryRestriction: string | null;
  vendorRestriction: string | null;
  isAvailable: boolean;
}

export const COUPONS: Coupon[] = [
  {
    code: 'WELCOME10',
    description: '10% off your first order (min purchase ₹1000)',
    type: 'percentage',
    value: 10,
    minPurchase: 1000,
    expiryDate: '2027-12-31T23:59:59Z',
    categoryRestriction: null,
    vendorRestriction: null,
    isAvailable: true,
  },
  {
    code: 'SAVE500',
    description: 'Flat ₹500 off on orders above ₹3000',
    type: 'fixed',
    value: 500,
    minPurchase: 3000,
    expiryDate: '2027-12-31T23:59:59Z',
    categoryRestriction: null,
    vendorRestriction: null,
    isAvailable: true,
  },
  {
    code: 'PASHMINA20',
    description: '20% off on all Pashmina products',
    type: 'percentage',
    value: 20,
    minPurchase: 0,
    expiryDate: '2027-12-31T23:59:59Z',
    categoryRestriction: 'pashmina',
    vendorRestriction: null,
    isAvailable: true,
  },
  {
    code: 'FREESHIP',
    description: 'Free shipping on orders over ₹2000',
    type: 'free_shipping',
    value: 0,
    minPurchase: 2000,
    expiryDate: '2027-12-31T23:59:59Z',
    categoryRestriction: null,
    vendorRestriction: null,
    isAvailable: true,
  },
  {
    code: 'ARTISAN15',
    description: '15% off products from Artisan "Bashir Ahmad"',
    type: 'percentage',
    value: 15,
    minPurchase: 0,
    expiryDate: '2027-12-31T23:59:59Z',
    categoryRestriction: null,
    vendorRestriction: 'v_bashir',
    isAvailable: true,
  },
  {
    code: 'EXPIRED_CODE',
    description: 'This code has expired',
    type: 'fixed',
    value: 200,
    minPurchase: 0,
    expiryDate: '2023-01-01T00:00:00Z',
    categoryRestriction: null,
    vendorRestriction: null,
    isAvailable: true, // It's available in DB but expired
  },
  {
    code: 'INACTIVE50',
    description: 'Inactive coupon',
    type: 'percentage',
    value: 50,
    minPurchase: 0,
    expiryDate: '2027-12-31T23:59:59Z',
    categoryRestriction: null,
    vendorRestriction: null,
    isAvailable: false,
  },
];
