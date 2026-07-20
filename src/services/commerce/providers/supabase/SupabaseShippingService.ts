import { IShippingService } from '../../interfaces/IShippingService';
import { Result, CommerceError } from '../../types/Result';
import { ShipmentEvent, ShippingStatus } from '@/types/order';
import { supabase } from '../../../../integrations/supabase/client';

export class SupabaseShippingService implements IShippingService {
  async getShipmentEvents(orderId: string): Promise<Result<ShipmentEvent[], CommerceError>> {
    try {
      const { data, error } = await supabase
        .from('shipment_events')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false });

      if (error) {
        return {
          success: false,
          error: { code: 'database_error', message: error.message }
        };
      }

      return {
        success: true,
        data: data.map(this.mapToShipmentEvent)
      };
    } catch (err: any) {
      return {
        success: false,
        error: { code: 'unknown_error', message: err.message || 'An unknown error occurred' }
      };
    }
  }

  async addShipmentEvent(orderId: string, status: ShippingStatus, description: string, location?: string): Promise<Result<ShipmentEvent, CommerceError>> {
    try {
      const { data, error } = await supabase
        .from('shipment_events')
        .insert({
          order_id: orderId,
          status,
          description,
          location
        })
        .select('*')
        .single();

      if (error) {
        return {
          success: false,
          error: { code: 'database_error', message: error.message }
        };
      }

      return {
        success: true,
        data: this.mapToShipmentEvent(data)
      };
    } catch (err: any) {
      return {
        success: false,
        error: { code: 'unknown_error', message: err.message || 'An unknown error occurred' }
      };
    }
  }

  async updateShippingStatus(orderId: string, status: ShippingStatus, trackingId?: string, provider?: string): Promise<Result<boolean, CommerceError>> {
    try {
      const updateData: any = { shipping_status: status };
      if (trackingId !== undefined) updateData.tracking_id = trackingId;
      if (provider !== undefined) updateData.shipping_provider = provider;

      const { error } = await supabase
        .from('orders')
        .update(updateData)
        .eq('id', orderId);

      if (error) {
        return {
          success: false,
          error: { code: 'database_error', message: error.message }
        };
      }

      return {
        success: true,
        data: true
      };
    } catch (err: any) {
      return {
        success: false,
        error: { code: 'unknown_error', message: err.message || 'An unknown error occurred' }
      };
    }
  }

  private mapToShipmentEvent(data: any): ShipmentEvent {
    return {
      id: data.id,
      orderId: data.order_id,
      status: data.status,
      description: data.description,
      location: data.location,
      createdAt: data.created_at
    };
  }
}
