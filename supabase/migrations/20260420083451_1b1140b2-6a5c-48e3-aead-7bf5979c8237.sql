-- 1. user_locations
CREATE TABLE public.user_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Home',
  pincode TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT,
  country TEXT NOT NULL DEFAULT 'IN',
  lat NUMERIC,
  lng NUMERIC,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_user_locations_user ON public.user_locations(user_id);
ALTER TABLE public.user_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own locations" ON public.user_locations
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own locations" ON public.user_locations
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own locations" ON public.user_locations
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own locations" ON public.user_locations
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all locations" ON public.user_locations
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- 2. serviceable_pincodes
CREATE TABLE public.serviceable_pincodes (
  pincode TEXT PRIMARY KEY,
  city TEXT NOT NULL,
  state TEXT,
  country TEXT NOT NULL DEFAULT 'IN',
  region_zone TEXT NOT NULL DEFAULT 'tier2',
  cod_available BOOLEAN NOT NULL DEFAULT true,
  base_delivery_days INTEGER NOT NULL DEFAULT 5,
  surcharge_pct NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pincodes_city ON public.serviceable_pincodes(city);
ALTER TABLE public.serviceable_pincodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone views active pincodes" ON public.serviceable_pincodes
  FOR SELECT USING (is_active = true);
CREATE POLICY "Admins manage pincodes" ON public.serviceable_pincodes
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 3. vendor_serviceability
CREATE TABLE public.vendor_serviceability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  pincode_pattern TEXT NOT NULL,
  ships BOOLEAN NOT NULL DEFAULT true,
  delivery_days_override INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_vendor_serv_vendor ON public.vendor_serviceability(vendor_id);
ALTER TABLE public.vendor_serviceability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone views serviceability rules" ON public.vendor_serviceability
  FOR SELECT USING (true);
CREATE POLICY "Vendor manages own serviceability" ON public.vendor_serviceability
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM vendors v WHERE v.id = vendor_serviceability.vendor_id AND v.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM vendors v WHERE v.id = vendor_serviceability.vendor_id AND v.user_id = auth.uid()));
CREATE POLICY "Admin manages all serviceability" ON public.vendor_serviceability
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 4. profiles default_pincode
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS default_pincode TEXT;

-- 5. Ensure single default per user
CREATE OR REPLACE FUNCTION public.enforce_single_default_location()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_default THEN
    UPDATE public.user_locations SET is_default = false
    WHERE user_id = NEW.user_id AND id <> NEW.id AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_single_default_location
  AFTER INSERT OR UPDATE OF is_default ON public.user_locations
  FOR EACH ROW WHEN (NEW.is_default = true)
  EXECUTE FUNCTION public.enforce_single_default_location();

-- 6. RPC check_serviceability
CREATE OR REPLACE FUNCTION public.check_serviceability(_pincode TEXT, _product_ids UUID[])
RETURNS TABLE(
  product_id UUID,
  deliverable BOOLEAN,
  eta_days INTEGER,
  surcharge_pct NUMERIC,
  cod BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _pin RECORD;
BEGIN
  SELECT * INTO _pin FROM serviceable_pincodes WHERE pincode = _pincode AND is_active = true;
  IF _pin IS NULL THEN
    RETURN QUERY SELECT pid, false, NULL::INTEGER, 0::NUMERIC, false FROM unnest(_product_ids) pid;
    RETURN;
  END IF;
  RETURN QUERY
  SELECT
    p.id,
    COALESCE(vs.ships, true) AS deliverable,
    COALESCE(vs.delivery_days_override, _pin.base_delivery_days) AS eta_days,
    _pin.surcharge_pct,
    _pin.cod_available
  FROM products p
  LEFT JOIN LATERAL (
    SELECT ships, delivery_days_override
    FROM vendor_serviceability vs2
    WHERE vs2.vendor_id = p.vendor_id AND _pincode LIKE vs2.pincode_pattern
    LIMIT 1
  ) vs ON true
  WHERE p.id = ANY(_product_ids);
END;
$$;

-- 7. Seed pincodes (India)
INSERT INTO public.serviceable_pincodes (pincode, city, state, country, region_zone, cod_available, base_delivery_days, surcharge_pct) VALUES
('110001','New Delhi','Delhi','IN','metro',true,2,0),
('110020','New Delhi','Delhi','IN','metro',true,2,0),
('400001','Mumbai','Maharashtra','IN','metro',true,2,0),
('400050','Mumbai','Maharashtra','IN','metro',true,2,0),
('560001','Bengaluru','Karnataka','IN','metro',true,2,0),
('560034','Bengaluru','Karnataka','IN','metro',true,2,0),
('600001','Chennai','Tamil Nadu','IN','metro',true,3,0),
('700001','Kolkata','West Bengal','IN','metro',true,3,0),
('500001','Hyderabad','Telangana','IN','metro',true,3,0),
('411001','Pune','Maharashtra','IN','metro',true,3,0),
('380001','Ahmedabad','Gujarat','IN','tier1',true,4,2),
('302001','Jaipur','Rajasthan','IN','tier1',true,4,2),
('226001','Lucknow','Uttar Pradesh','IN','tier1',true,4,2),
('160001','Chandigarh','Chandigarh','IN','tier1',true,4,2),
('800001','Patna','Bihar','IN','tier1',true,5,3),
('682001','Kochi','Kerala','IN','tier1',true,4,2),
('641001','Coimbatore','Tamil Nadu','IN','tier1',true,4,2),
('462001','Bhopal','Madhya Pradesh','IN','tier1',true,5,3),
('751001','Bhubaneswar','Odisha','IN','tier1',true,5,3),
('781001','Guwahati','Assam','IN','tier2',true,6,5),
('143001','Amritsar','Punjab','IN','tier2',true,5,4),
('248001','Dehradun','Uttarakhand','IN','tier2',true,5,4),
('171001','Shimla','Himachal Pradesh','IN','tier2',true,6,5),
('190001','Srinagar','J&K','IN','remote',false,8,8),
('744101','Port Blair','Andaman','IN','remote',false,10,12),
('682551','Lakshadweep','Lakshadweep','IN','remote',false,12,15),
('795001','Imphal','Manipur','IN','remote',true,8,8),
('796001','Aizawl','Mizoram','IN','remote',true,8,8),
('737101','Gangtok','Sikkim','IN','tier2',true,6,5),
('110030','New Delhi','Delhi','IN','metro',true,2,0)
ON CONFLICT (pincode) DO NOTHING;