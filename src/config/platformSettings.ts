export const platformSettings = {
  commissionEnabled: false,
  commissionPercentage: 0, // Set to e.g. 10 when enabling
};

export function calculateCommission(amount: number) {
  if (!platformSettings.commissionEnabled) {
    return { commission: 0, vendorEarnings: amount };
  }
  const commission = amount * (platformSettings.commissionPercentage / 100);
  return { commission, vendorEarnings: amount - commission };
}
