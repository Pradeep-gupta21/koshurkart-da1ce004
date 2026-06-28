CREATE OR REPLACE FUNCTION public.check_serviceability(_pincode text, _product_ids uuid[])
RETURNS TABLE(product_id uuid, deliverable boolean, eta_days integer, surcharge_pct numeric, cod boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _pin RECORD;
  _default_eta integer := 7;
  _default_surcharge numeric := 0;
  _default_cod boolean := true;
BEGIN
  -- Validate pincode shape early
  IF _pincode IS NULL OR _pincode !~ '^\d{6}$' THEN
    RETURN QUERY SELECT pid, false, NULL::INTEGER, 0::NUMERIC, false
      FROM unnest(_product_ids) pid;
    RETURN;
  END IF;

  -- Optional shipping cost / ETA / COD metadata. Absence is NOT a blocker.
  SELECT * INTO _pin
    FROM serviceable_pincodes
    WHERE pincode = _pincode AND is_active = true;

  RETURN QUERY
  SELECT
    p.id,
    -- Deliverability is driven ENTIRELY by vendor rules.
    -- No rules => deliverable everywhere by default.
    COALESCE(vs.deliverable, true) AS deliverable,
    COALESCE(vs.delivery_days_override,
             _pin.base_delivery_days,
             _default_eta) AS eta_days,
    COALESCE(_pin.surcharge_pct, _default_surcharge) AS surcharge_pct,
    COALESCE(_pin.cod_available, _default_cod) AS cod
  FROM products p
  LEFT JOIN LATERAL (
    SELECT
      bool_or(
        vs2.ships AND (
          vs2.pincode_pattern = '*'                      -- Worldwide
          OR vs2.pincode_pattern = _pincode              -- Exact 6-digit
          OR (vs2.pincode_pattern LIKE '%\%' ESCAPE '\'  -- SQL LIKE patterns ("18%", "19%")
              AND _pincode LIKE vs2.pincode_pattern)
        )
      ) AS deliverable,
      MIN(vs2.delivery_days_override) AS delivery_days_override
    FROM vendor_serviceability vs2
    WHERE vs2.vendor_id = p.vendor_id
  ) vs ON true
  WHERE p.id = ANY(_product_ids);
END;
$function$;