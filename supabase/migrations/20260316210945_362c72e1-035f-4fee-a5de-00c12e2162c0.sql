
-- Add inventory columns to products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS reserved_stock integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS low_stock_threshold integer NOT NULL DEFAULT 5;

-- Atomic reserve stock function
CREATE OR REPLACE FUNCTION public.reserve_stock(p_product_id uuid, p_quantity integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  available integer;
BEGIN
  SELECT stock - reserved_stock INTO available
  FROM products WHERE id = p_product_id FOR UPDATE;

  IF available IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  IF available < p_quantity THEN
    RAISE EXCEPTION 'Insufficient stock. Only % available.', available;
  END IF;

  UPDATE products
  SET reserved_stock = reserved_stock + p_quantity
  WHERE id = p_product_id;
END;
$$;

-- Confirm stock after successful payment
CREATE OR REPLACE FUNCTION public.confirm_stock(p_product_id uuid, p_quantity integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE products
  SET stock = stock - p_quantity,
      reserved_stock = reserved_stock - p_quantity
  WHERE id = p_product_id;
END;
$$;

-- Release reserved stock on failure/timeout
CREATE OR REPLACE FUNCTION public.release_stock(p_product_id uuid, p_quantity integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE products
  SET reserved_stock = GREATEST(reserved_stock - p_quantity, 0)
  WHERE id = p_product_id;
END;
$$;
