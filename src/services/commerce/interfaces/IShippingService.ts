import { Result, CommerceError } from '../types/Result';
import { ShipmentEvent, ShippingStatus } from '@/types';

export interface IShippingService {
  getShipmentEvents(orderId: string): Promise<Result<ShipmentEvent[], CommerceError>>;
  addShipmentEvent(orderId: string, status: ShippingStatus, description: string, location?: string): Promise<Result<ShipmentEvent, CommerceError>>;
  updateShippingStatus(orderId: string, status: ShippingStatus, trackingId?: string, provider?: string): Promise<Result<boolean, CommerceError>>;
}
