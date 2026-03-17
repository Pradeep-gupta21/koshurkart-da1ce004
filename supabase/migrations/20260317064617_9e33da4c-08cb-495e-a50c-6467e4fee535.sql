
-- Add shipping columns to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS shipping_provider TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tracking_id TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS shipping_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS estimated_delivery DATE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS courier_api_config JSONB DEFAULT '{}';

-- Create shipment_events table
CREATE TABLE public.shipment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  description TEXT DEFAULT '',
  location TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on shipment_events
ALTER TABLE public.shipment_events ENABLE ROW LEVEL SECURITY;

-- RLS: Users can view their own order events
CREATE POLICY "Users view own shipment events" ON public.shipment_events
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders WHERE orders.id = shipment_events.order_id AND orders.user_id = auth.uid()
  ));

-- RLS: Vendors can view shipment events for orders with their items
CREATE POLICY "Vendors view shipment events" ON public.shipment_events
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.order_items oi
    JOIN public.vendors v ON v.id = oi.vendor_id
    WHERE oi.order_id = shipment_events.order_id AND v.user_id = auth.uid()
  ));

-- RLS: Admins can view all shipment events
CREATE POLICY "Admins view all shipment events" ON public.shipment_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Trigger function: auto-log shipment events and sync order_status
CREATE OR REPLACE FUNCTION public.on_shipping_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.shipping_status IS DISTINCT FROM NEW.shipping_status THEN
    -- Log the event
    INSERT INTO shipment_events (order_id, status, description)
    VALUES (NEW.id, NEW.shipping_status,
      CASE NEW.shipping_status
        WHEN 'pending' THEN 'Order is being prepared'
        WHEN 'shipped' THEN 'Package has been shipped'
        WHEN 'in_transit' THEN 'Package is in transit'
        WHEN 'out_for_delivery' THEN 'Package is out for delivery'
        WHEN 'delivered' THEN 'Package has been delivered'
        ELSE 'Status updated to ' || NEW.shipping_status
      END
    );

    -- Sync order_status
    IF NEW.shipping_status = 'shipped' AND OLD.order_status = 'processing' THEN
      NEW.order_status := 'shipped';
    ELSIF NEW.shipping_status = 'delivered' THEN
      NEW.order_status := 'delivered';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Attach trigger
CREATE TRIGGER trg_shipping_status_change
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.on_shipping_status_change();

-- Insert initial "pending" event for existing orders
INSERT INTO public.shipment_events (order_id, status, description)
SELECT id, 'pending', 'Order is being prepared'
FROM public.orders
WHERE NOT EXISTS (
  SELECT 1 FROM public.shipment_events se WHERE se.order_id = orders.id
);
