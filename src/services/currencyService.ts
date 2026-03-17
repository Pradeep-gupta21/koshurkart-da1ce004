export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'CAD' | 'AUD' | 'JPY' | 'INR' | 'BRL' | 'NGN';

export interface CurrencyInfo {
  code: CurrencyCode;
  symbol: string;
  flag: string;
  name: string;
  locale: string;
}

export const CURRENCIES: Record<CurrencyCode, CurrencyInfo> = {
  USD: { code: 'USD', symbol: '$', flag: '🇺🇸', name: 'US Dollar', locale: 'en-US' },
  EUR: { code: 'EUR', symbol: '€', flag: '🇪🇺', name: 'Euro', locale: 'de-DE' },
  GBP: { code: 'GBP', symbol: '£', flag: '🇬🇧', name: 'British Pound', locale: 'en-GB' },
  CAD: { code: 'CAD', symbol: 'CA$', flag: '🇨🇦', name: 'Canadian Dollar', locale: 'en-CA' },
  AUD: { code: 'AUD', symbol: 'A$', flag: '🇦🇺', name: 'Australian Dollar', locale: 'en-AU' },
  JPY: { code: 'JPY', symbol: '¥', flag: '🇯🇵', name: 'Japanese Yen', locale: 'ja-JP' },
  INR: { code: 'INR', symbol: '₹', flag: '🇮🇳', name: 'Indian Rupee', locale: 'en-IN' },
  BRL: { code: 'BRL', symbol: 'R$', flag: '🇧🇷', name: 'Brazilian Real', locale: 'pt-BR' },
  NGN: { code: 'NGN', symbol: '₦', flag: '🇳🇬', name: 'Nigerian Naira', locale: 'en-NG' },
};

// Static exchange rates with USD as base (easy to swap for live API later)
const EXCHANGE_RATES: Record<CurrencyCode, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  CAD: 1.36,
  AUD: 1.53,
  JPY: 149.5,
  INR: 83.1,
  BRL: 4.97,
  NGN: 1550,
};

const COUNTRY_TO_CURRENCY: Record<string, CurrencyCode> = {
  US: 'USD', UM: 'USD', PR: 'USD', GU: 'USD', VI: 'USD',
  GB: 'GBP', UK: 'GBP',
  DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR', NL: 'EUR', BE: 'EUR', AT: 'EUR', PT: 'EUR', IE: 'EUR', FI: 'EUR', GR: 'EUR',
  CA: 'CAD',
  AU: 'AUD', NZ: 'AUD',
  JP: 'JPY',
  IN: 'INR',
  BR: 'BRL',
  NG: 'NGN',
};

export const currencyService = {
  convertPrice(amount: number, from: CurrencyCode, to: CurrencyCode): number {
    if (from === to) return amount;
    const inUsd = amount / EXCHANGE_RATES[from];
    return inUsd * EXCHANGE_RATES[to];
  },

  formatPrice(amount: number, currency: CurrencyCode): string {
    const info = CURRENCIES[currency];
    return new Intl.NumberFormat(info.locale, {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: currency === 'JPY' ? 0 : 2,
      maximumFractionDigits: currency === 'JPY' ? 0 : 2,
    }).format(amount);
  },

  async detectUserCurrency(): Promise<{ country: string; currency: CurrencyCode }> {
    try {
      const res = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(3000) });
      if (!res.ok) throw new Error('Geo API failed');
      const data = await res.json();
      const country = (data.country_code || 'US').toUpperCase();
      const currency = COUNTRY_TO_CURRENCY[country] || 'USD';
      return { country, currency };
    } catch {
      return { country: 'US', currency: 'USD' };
    }
  },

  getCurrencySymbol(currency: CurrencyCode): string {
    return CURRENCIES[currency]?.symbol ?? '$';
  },

  getSupportedCurrencies(): CurrencyInfo[] {
    return Object.values(CURRENCIES);
  },

  getRate(currency: CurrencyCode): number {
    return EXCHANGE_RATES[currency] ?? 1;
  },
};
