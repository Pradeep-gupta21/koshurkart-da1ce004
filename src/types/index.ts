// Barrel re-export all types
export type { UserProfile, AppRole } from './user';
export type { Product, Review, Vendor } from './product';
export type { CartItem, Order, OrderItem } from './order';
export type { AdCampaign, AdPlacement } from './ads';

// Keep backward-compatible CartItem (re-exported above)
