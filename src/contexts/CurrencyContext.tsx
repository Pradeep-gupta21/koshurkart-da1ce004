import React, { createContext, useContext, useCallback } from "react";
import { currencyService, CurrencyCode } from "@/services/currencyService";

interface CurrencyContextType {
  currency: CurrencyCode;
  country: string;
  isLoading: boolean;
  setCurrency: (code: CurrencyCode) => void;
  convertPrice: (amount: number) => number;
  formatPrice: (amount: number) => string;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export const CurrencyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // INR is the only supported currency. Prices are stored in rupees end-to-end.
  const currency: CurrencyCode = 'INR';
  const country = 'IN';
  const isLoading = false;

  const setCurrency = useCallback((_code: CurrencyCode) => {
    // No-op: INR is the only supported currency.
  }, []);

  const convertPrice = useCallback((amount: number) => amount, []);

  const formatPrice = useCallback((amount: number) => {
    return currencyService.formatPrice(amount, 'INR');
  }, []);

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
