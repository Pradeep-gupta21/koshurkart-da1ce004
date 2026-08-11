/**
 * Commission Module Unit Tests
 *
 * These tests intentionally lock down current Phase 2 behavior (fixed 5% commission)
 * so future configurable commission implementations can be introduced without
 * breaking deterministic arithmetic.
 */

import {
  getVendorCommissionPercentage,
  calculateVendorEarnings,
  calculatePlatformCommission
} from './commission';

describe('Commission Module API Surface', () => {
  it('exports core functions correctly', () => {
    expect(typeof getVendorCommissionPercentage).toBe('function');
    expect(typeof calculateVendorEarnings).toBe('function');
    expect(typeof calculatePlatformCommission).toBe('function');
  });
});

describe('1. Commission Lookup & Mixed Vendor Regression', () => {
  it('always returns 5% and explicitly ignores all parameters', () => {
    // Proving Phase 2 lockdown behavior
    expect(getVendorCommissionPercentage(undefined as any)).toBe(5);
    expect(getVendorCommissionPercentage({} as any)).toBe(5);
    expect(getVendorCommissionPercentage(null, null)).toBe(5);
    expect(getVendorCommissionPercentage({ commission: 99 }, { total: 99999999 })).toBe(5);
    expect(getVendorCommissionPercentage({ id: 'vendor_1' }, { id: 'order_1' })).toBe(5);
  });

  it('calculates identical earnings across different vendor objects', () => {
    const vendors = [{ id: 'vendor_A' }, { id: 'vendor_B' }, { id: 'vendor_C' }];
    const orderAmount = 1000;

    const results = vendors.map(vendor => {
      const rate = getVendorCommissionPercentage(vendor);
      return calculateVendorEarnings(orderAmount, rate);
    });

    expect(results[0]).toBe(950);
    expect(results[0]).toBe(results[1]);
    expect(results[1]).toBe(results[2]);
  });
});

describe('Financial Calculations', () => {
  const calculationCases = [
    // Basic boundaries & 5% standard
    { amount: 0, rate: 5, expectedVendor: 0, expectedPlatform: 0 },
    { amount: 1, rate: 5, expectedVendor: 0, expectedPlatform: 1 },
    { amount: 100, rate: 5, expectedVendor: 95, expectedPlatform: 5 },
    { amount: 1000, rate: 5, expectedVendor: 950, expectedPlatform: 50 },
    { amount: 999999, rate: 5, expectedVendor: 949999, expectedPlatform: 50000 },
    
    // Exact BigInt integer division rounding edge cases (@ 5%)
    { amount: 99, rate: 5, expectedVendor: 94, expectedPlatform: 5 },
    { amount: 199, rate: 5, expectedVendor: 189, expectedPlatform: 10 },
    { amount: 999, rate: 5, expectedVendor: 949, expectedPlatform: 50 },
    { amount: 1001, rate: 5, expectedVendor: 950, expectedPlatform: 51 },
    { amount: 10001, rate: 5, expectedVendor: 9500, expectedPlatform: 501 },
    
    // Varying rates & extreme financial edges
    { amount: 100, rate: 0, expectedVendor: 100, expectedPlatform: 0 },
    { amount: 100, rate: 100, expectedVendor: 0, expectedPlatform: 100 },
    { amount: 1000, rate: 7.5, expectedVendor: 925, expectedPlatform: 75 },
    { amount: 1000, rate: 10, expectedVendor: 900, expectedPlatform: 100 },
    { amount: 10000, rate: 99.99, expectedVendor: 1, expectedPlatform: 9999 },
    
    // 101 paise rounding regressions across all rates
    { amount: 101, rate: 0, expectedVendor: 101, expectedPlatform: 0 },
    { amount: 101, rate: 5, expectedVendor: 95, expectedPlatform: 6 },
    { amount: 101, rate: 7.5, expectedVendor: 93, expectedPlatform: 8 },
    { amount: 101, rate: 10, expectedVendor: 90, expectedPlatform: 11 },
    { amount: 101, rate: 100, expectedVendor: 0, expectedPlatform: 101 }
  ];

  it.each(calculationCases)(
    'calculates amount: $amount @ $rate% -> vendor: $expectedVendor, platform: $expectedPlatform',
    ({ amount, rate, expectedVendor, expectedPlatform }) => {
      const vendorEarnings = calculateVendorEarnings(amount, rate);
      // Fixed: Passing actual module output (vendorEarnings) rather than the test fixture (expectedVendor)
      const platformCommission = calculatePlatformCommission(amount, vendorEarnings);

      // Explicit API regression check
      expect(typeof vendorEarnings).toBe('number');
      expect(typeof platformCommission).toBe('number');

      expect(vendorEarnings).toBe(expectedVendor);
      expect(platformCommission).toBe(expectedPlatform);
      
      // The Golden Invariant
      expect(vendorEarnings + platformCommission).toBe(amount);
      
      // Safe Integer Validation
      expect(Number.isSafeInteger(vendorEarnings)).toBe(true);
      expect(Number.isSafeInteger(platformCommission)).toBe(true);
    }
  );

  it('returns 0 platform commission when vendor earnings exactly equal order amount', () => {
    // Explicit guard against future >= operator regressions
    expect(calculatePlatformCommission(1000, 1000)).toBe(0);
  });

  it('maintains exact BigInt precision at Number.MAX_SAFE_INTEGER - 1', () => {
    const maxSafeMinusOne = Number.MAX_SAFE_INTEGER - 1;
    const vendorEarnings = calculateVendorEarnings(maxSafeMinusOne, 5);
    const platformCommission = calculatePlatformCommission(maxSafeMinusOne, vendorEarnings);

    const expectedVendorBigInt = (BigInt(maxSafeMinusOne) * 9500n) / 10000n;
    const expectedVendor = Number(expectedVendorBigInt);

    expect(vendorEarnings).toBe(expectedVendor);
    expect(vendorEarnings + platformCommission).toBe(maxSafeMinusOne);
  });

  it('maintains exact BigInt precision at Number.MAX_SAFE_INTEGER', () => {
    const maxSafe = Number.MAX_SAFE_INTEGER;
    const vendorEarnings = calculateVendorEarnings(maxSafe, 5);
    const platformCommission = calculatePlatformCommission(maxSafe, vendorEarnings);

    const expectedVendorBigInt = (BigInt(maxSafe) * 9500n) / 10000n;
    const expectedVendor = Number(expectedVendorBigInt);

    expect(vendorEarnings).toBe(expectedVendor);
    expect(vendorEarnings + platformCommission).toBe(maxSafe);
  });
});

describe('Randomized Property Invariants', () => {
  it('maintains strict financial invariants across 500 randomized scenarios', () => {
    for (let i = 0; i < 500; i++) {
      // Random amount up to MAX_SAFE_INTEGER
      const amount = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
      // Random rate between 0 and 100, up to 2 decimal places
      const rate = Math.floor(Math.random() * 10001) / 100;

      const vendorEarnings = calculateVendorEarnings(amount, rate);
      const platformCommission = calculatePlatformCommission(amount, vendorEarnings);

      expect(vendorEarnings).toBeLessThanOrEqual(amount);
      expect(platformCommission).toBeGreaterThanOrEqual(0);
      expect(vendorEarnings + platformCommission).toBe(amount);
    }
  });
});

describe('Invalid Paise Values & Scientific Notation Regressions', () => {
  it('throws on negative order amounts and earnings', () => {
    expect(() => calculateVendorEarnings(-1, 5)).toThrow('cannot be negative');
    expect(() => calculatePlatformCommission(-1, 0)).toThrow('cannot be negative');
    expect(() => calculatePlatformCommission(100, -1)).toThrow('cannot be negative');
  });

  it('throws when vendor earnings exceed order amount', () => {
    expect(() => calculatePlatformCommission(100, 101)).toThrow('cannot exceed the total order amount');
  });

  it('throws on unsafe integer values for both order amount and vendor earnings', () => {
    const unsafe = Number.MAX_SAFE_INTEGER + 1;
    expect(() => calculateVendorEarnings(unsafe, 5)).toThrow('safe integers');
    expect(() => calculatePlatformCommission(unsafe, 0)).toThrow('safe integers');
    expect(() => calculatePlatformCommission(1000, unsafe)).toThrow('safe integers');
  });

  it('throws on non-integer order amounts', () => {
    expect(() => calculateVendorEarnings(100.5, 5)).toThrow('safe integers');
    expect(() => calculatePlatformCommission(100.5, 0)).toThrow('safe integers');
  });

  it('handles JS scientific notation parsing correctly before validation', () => {
    // 1e2 evaluates to 100 (valid integer paise)
    expect(() => calculateVendorEarnings(1e2, 5)).not.toThrow();
    // 1e-1 evaluates to 0.1 (invalid non-integer paise)
    expect(() => calculateVendorEarnings(1e-1, 5)).toThrow('safe integers');
  });
});

describe('Invalid Commission Percentages', () => {
  it('throws on NaN and Infinity', () => {
    expect(() => calculateVendorEarnings(100, NaN)).toThrow('finite number');
    expect(() => calculateVendorEarnings(100, Infinity)).toThrow('finite number');
    expect(() => calculateVendorEarnings(100, -Infinity)).toThrow('finite number');
  });

  it('throws on percentages outside 0-100 bounds', () => {
    expect(() => calculateVendorEarnings(100, -5)).toThrow('between 0 and 100');
    expect(() => calculateVendorEarnings(100, 101)).toThrow('between 0 and 100');
  });

  it('validates scientific notation commission rates strictly by decimal count', () => {
    // 5e-1 is 0.5 (valid, 1 decimal place)
    expect(() => calculateVendorEarnings(100, 5e-1)).not.toThrow();
    // 5e-3 is 0.005 (invalid, > 2 decimal places)
    expect(() => calculateVendorEarnings(100, 5e-3)).toThrow('more than two decimal places');
    // 5e-8 is 0.00000005 (invalid, > 2 decimal places)
    expect(() => calculateVendorEarnings(100, 5e-8)).toThrow('more than two decimal places');
  });

  it('throws on standard percentages with more than two decimal places', () => {
    expect(() => calculateVendorEarnings(100, 5.123)).toThrow('more than two decimal places');
    expect(() => calculateVendorEarnings(100, 10.999)).toThrow('more than two decimal places');
  });
});

describe('Deterministic Arithmetic', () => {
  it('produces identical results across multiple executions', () => {
    const orderAmount = 1234567;
    const commissionRate = 5;
    const initialVendorEarnings = calculateVendorEarnings(orderAmount, commissionRate);
    const initialPlatformCommission = calculatePlatformCommission(orderAmount, initialVendorEarnings);

    for (let i = 0; i < 10; i++) {
      const loopVendorEarnings = calculateVendorEarnings(orderAmount, commissionRate);
      const loopPlatformCommission = calculatePlatformCommission(orderAmount, loopVendorEarnings);

      expect(loopVendorEarnings).toBe(initialVendorEarnings);
      expect(loopPlatformCommission).toBe(initialPlatformCommission);
    }
  });
});