
CREATE TABLE IF NOT EXISTS public.wishlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_wishlist_user ON public.wishlist_items(user_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_product ON public.wishlist_items(product_id);

GRANT SELECT, INSERT, DELETE ON public.wishlist_items TO authenticated;
GRANT ALL ON public.wishlist_items TO service_role;

ALTER TABLE public.wishlist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own wishlist"
  ON public.wishlist_items FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can add to their own wishlist"
  ON public.wishlist_items FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove from their own wishlist"
  ON public.wishlist_items FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
