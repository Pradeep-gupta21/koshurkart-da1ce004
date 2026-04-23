// INR-only currency service. Single source of truth: rupees end-to-end.
export type CurrencyCode = 'INR';

export interface CurrencyInfo {
  code: CurrencyCode;
  symbol: string;
  flag: string;
  name: string;
  locale: string;
}

export const CURRENCIES: Record<CurrencyCode, CurrencyInfo> = {
  INR: { code: 'INR', symbol: '₹', flag: '🇮🇳', name: 'Indian Rupee', locale: 'en-IN' },
};

export const currencyService = {
  // Identity — kept for API compatibility; INR is the only unit.
  convertPrice(amount: number, _from: CurrencyCode = 'INR', _to: CurrencyCode = 'INR'): number {
    return amount;
  },

  formatPrice(amount: number, _currency: CurrencyCode = 'INR'): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  },

  async detectUserCurrency(): Promise<{ country: string; currency: CurrencyCode }> {
    return { country: 'IN', currency: 'INR' };
  },

  getCurrencySymbol(_currency: CurrencyCode = 'INR'): string {
    return '₹';
  },

  getSupportedCurrencies(): CurrencyInfo[] {
    return Object.values(CURRENCIES);
  },

  getRate(_currency: CurrencyCode = 'INR'): number {
    return 1;
  },
};
