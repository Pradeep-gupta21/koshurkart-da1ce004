export interface RecentlyViewedItem {
  product: any;
  viewedAt: string;
  category: string;
  price: number;
  thumbnail: string;
}

const store: Record<string, RecentlyViewedItem[]> = {};

export const RecentlyViewedStore = {
  add: (customerId: string, product: any) => {
    if (!store[customerId]) {
      store[customerId] = [];
    }
    
    // Deduplicate by moving to top if it already exists
    store[customerId] = store[customerId].filter(item => item.product.id !== product.id);
    
    store[customerId].unshift({
      product: product,
      viewedAt: new Date().toISOString(),
      category: product.category || 'Unknown',
      price: product.price || 0,
      thumbnail: product.thumbnail || product.image || ''
    });

    if (store[customerId].length > 50) {
      store[customerId] = store[customerId].slice(0, 50);
    }
  },
  
  get: (customerId: string) => {
    return store[customerId] || [];
  },
  
  clear: (customerId: string) => {
    store[customerId] = [];
  }
};
