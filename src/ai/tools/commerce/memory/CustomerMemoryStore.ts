export interface CustomerPreferences {
  favoriteCategories?: string[];
  favoriteArtisans?: string[];
  favoriteMaterials?: string[];
  favoriteColors?: string[];
  favoritePriceRange?: string;
  preferredPaymentMethod?: string;
  preferredDeliveryOption?: string;
  languagePreference?: string;
  shoppingGoals?: string[];
  budget?: string;
  interests?: string[];
  avoidedCategories?: string[];
  interactionHistory?: string[];
}

export class CustomerMemoryStore {
  private static instance: CustomerMemoryStore;
  private store: Map<string, CustomerPreferences> = new Map();

  private constructor() {}

  public static getInstance(): CustomerMemoryStore {
    if (!CustomerMemoryStore.instance) {
      CustomerMemoryStore.instance = new CustomerMemoryStore();
    }
    return CustomerMemoryStore.instance;
  }

  public async getPreferences(userId: string): Promise<CustomerPreferences> {
    return this.store.get(userId) || {};
  }

  public async savePreferences(userId: string, preferences: Partial<CustomerPreferences>): Promise<void> {
    const existing = await this.getPreferences(userId);
    
    const merged = { ...existing };
    for (const key of Object.keys(preferences) as Array<keyof CustomerPreferences>) {
      if (preferences[key] !== undefined) {
        merged[key] = preferences[key] as any;
      }
    }
    
    this.store.set(userId, merged);
  }

  public async forgetPreference(userId: string, key: keyof CustomerPreferences): Promise<void> {
    const existing = await this.getPreferences(userId);
    if (key in existing) {
      delete existing[key];
      this.store.set(userId, existing);
    }
  }

  public async addInteraction(userId: string, interaction: string): Promise<void> {
    const existing = await this.getPreferences(userId);
    const history = existing.interactionHistory || [];
    history.push(interaction);
    if (history.length > 100) {
      history.shift();
    }
    existing.interactionHistory = history;
    this.store.set(userId, existing);
  }
}

export const memoryStore = CustomerMemoryStore.getInstance();
