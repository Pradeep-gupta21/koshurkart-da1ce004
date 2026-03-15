export interface AdCampaign {
  id: string;
  vendorId: string;
  productId: string;
  placement: string;
  status: string;
  budget: number;
  dailyLimit: number | null;
  impressions: number;
  clicks: number;
  startDate: string;
  endDate: string | null;
  createdAt: string;
}

export interface AdPlacement {
  id: string;
  placementName: string;
  pricePerClick: number | null;
  pricePerImpression: number | null;
  isActive: boolean;
}
