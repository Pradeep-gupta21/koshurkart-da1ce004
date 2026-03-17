
-- Add dynamic pricing columns to products
ALTER TABLE products ADD COLUMN IF NOT EXISTS base_price numeric;
ALTER TABLE products ADD COLUMN IF NOT EXISTS dynamic_price numeric;
ALTER TABLE products ADD COLUMN IF NOT EXISTS demand_score numeric DEFAULT 0;

-- Backfill base_price from current price
UPDATE products SET base_price = price WHERE base_price IS NULL;

-- Create pricing_rules table
CREATE TABLE IF NOT EXISTS pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name text NOT NULL,
  high_demand_multiplier numeric NOT NULL DEFAULT 1.05,
  low_demand_multiplier numeric NOT NULL DEFAULT 0.95,
  low_stock_multiplier numeric NOT NULL DEFAULT 1.10,
  high_stock_multiplier numeric NOT NULL DEFAULT 0.90,
  max_increase_pct numeric NOT NULL DEFAULT 20,
  max_decrease_pct numeric NOT NULL DEFAULT 15,
  demand_threshold_high numeric NOT NULL DEFAULT 70,
  demand_threshold_low numeric NOT NULL DEFAULT 30,
  stock_threshold_high integer NOT NULL DEFAULT 100,
  stock_threshold_low integer NOT NULL DEFAULT 10,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- RLS for pricing_rules
ALTER TABLE pricing_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active pricing rules"
ON pricing_rules FOR SELECT TO public
USING (is_active = true);

CREATE POLICY "Admin manages pricing rules"
ON pricing_rules FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Insert default rule
INSERT INTO pricing_rules (rule_name) VALUES ('Default Pricing Rule');

-- Create calculate_dynamic_prices function
CREATE OR REPLACE FUNCTION calculate_dynamic_prices()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _rule record;
  _product record;
  _raw_score numeric;
  _max_raw numeric;
  _demand numeric;
  _multiplier numeric;
  _new_price numeric;
  _base numeric;
BEGIN
  -- Get active pricing rule
  SELECT * INTO _rule FROM pricing_rules WHERE is_active = true LIMIT 1;
  IF _rule IS NULL THEN RETURN; END IF;

  -- Backfill base_price where null
  UPDATE products SET base_price = price WHERE base_price IS NULL;

  -- Get max raw score for normalization
  SELECT COALESCE(MAX(
    (SELECT COUNT(*) FILTER (WHERE ae.event_type = 'product_view') * 1
     + COUNT(*) FILTER (WHERE ae.event_type = 'add_to_cart') * 3
     + COUNT(*) FILTER (WHERE ae.event_type = 'purchase') * 5
     FROM analytics_events ae
     WHERE ae.product_id = p.id AND ae.created_at > now() - interval '7 days')
  ), 1) INTO _max_raw
  FROM products p WHERE p.status = 'active';

  FOR _product IN
    SELECT p.id, p.base_price, p.price, p.stock, p.reserved_stock
    FROM products p WHERE p.status = 'active'
  LOOP
    _base := COALESCE(_product.base_price, _product.price);

    -- Calculate raw demand score
    SELECT
      COALESCE(SUM(CASE WHEN event_type = 'product_view' THEN 1
                        WHEN event_type = 'add_to_cart' THEN 3
                        WHEN event_type = 'purchase' THEN 5 ELSE 0 END), 0)
    INTO _raw_score
    FROM analytics_events
    WHERE product_id = _product.id AND created_at > now() - interval '7 days';

    -- Normalize to 0-100
    _demand := CASE WHEN _max_raw > 0 THEN (_raw_score / _max_raw) * 100 ELSE 0 END;

    -- Start with multiplier of 1
    _multiplier := 1.0;

    -- Demand factor
    IF _demand >= _rule.demand_threshold_high THEN
      _multiplier := _multiplier * _rule.high_demand_multiplier;
    ELSIF _demand <= _rule.demand_threshold_low THEN
      _multiplier := _multiplier * _rule.low_demand_multiplier;
    END IF;

    -- Stock factor
    DECLARE
      _available integer;
    BEGIN
      _available := _product.stock - COALESCE(_product.reserved_stock, 0);
      IF _available <= _rule.stock_threshold_low THEN
        _multiplier := _multiplier * _rule.low_stock_multiplier;
      ELSIF _available >= _rule.stock_threshold_high THEN
        _multiplier := _multiplier * _rule.high_stock_multiplier;
      END IF;
    END;

    -- Calculate new price clamped by max increase/decrease
    _new_price := _base * _multiplier;
    _new_price := LEAST(_new_price, _base * (1 + _rule.max_increase_pct / 100.0));
    _new_price := GREATEST(_new_price, _base * (1 - _rule.max_decrease_pct / 100.0));
    _new_price := ROUND(_new_price, 2);

    -- Update product
    UPDATE products
    SET demand_score = _demand,
        dynamic_price = _new_price
    WHERE id = _product.id;
  END LOOP;
END;
$$;
