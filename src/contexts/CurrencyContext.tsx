import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { currencyService, CurrencyCode, CURRENCIES } from "@/services/currencyService";

const CURRENCY_STORAGE_KEY = "preferred_currency";

interface CurrencyContextType {
  currency: CurrencyCode;
  country: string;
  isLoading: boolean;
  setCurrency: (code: CurrencyCode) => void;
  convertPrice: (amountUsd: number) => number;
  formatPrice: (amountUsd: number) => string;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export const CurrencyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currency, setCurrencyState] = useState<CurrencyCode>(() => {
    const saved = localStorage.getItem(CURRENCY_STORAGE_KEY);
    return (saved && saved in CURRENCIES) ? saved as CurrencyCode : 'USD';
  });
  const [country, setCountry] = useState('US');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem(CURRENCY_STORAGE_KEY);
    if (saved && saved in CURRENCIES) {
      setIsLoading(false);
      return;
    }
    currencyService.detectUserCurrency().then(({ country: c, currency: cur }) => {
      setCountry(c);
      setCurrencyState(cur);
      localStorage.setItem(CURRENCY_STORAGE_KEY, cur);
    }).finally(() => setIsLoading(false));
  }, []);

  const setCurrency = useCallback((code: CurrencyCode) => {
    setCurrencyState(code);
    localStorage.setItem(CURRENCY_STORAGE_KEY, code);
  }, []);

  const convertPrice = useCallback((amountUsd: number) => {
    return currencyService.convertPrice(amountUsd, 'USD', currency);
  }, [currency]);

  const formatPrice = useCallback((amountUsd: number) => {
    const converted = currencyService.convertPrice(amountUsd, 'USD', currency);
    return currencyService.formatPrice(converted, currency);
  }, [currency]);

  return (
    <CurrencyContext.Provider value={{ currency, country, isLoading, setCurrency, convertPrice, formatPrice }}>
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrency = () => {
  const context = useContext(CurrencyContext);
  if (!context) throw new Error("useCurrency must be used within CurrencyProvider");
  return context;
};
