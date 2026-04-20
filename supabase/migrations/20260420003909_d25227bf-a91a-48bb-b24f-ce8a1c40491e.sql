
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  icon text CHECK (icon IS NULL OR char_length(icon) <= 40),
  route text CHECK (route IS NULL OR char_length(route) <= 200),
  parent_id uuid REFERENCES public.menu_items(id) ON DELETE CASCADE,
  role_access public.app_role[] NOT NULL DEFAULT '{}',
  order_index integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  section text NOT NULL DEFAULT 'shop' CHECK (section IN ('shop', 'dashboard')),
  badge_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_menu_items_section_parent_order
  ON public.menu_items (section, parent_id, order_index);
CREATE INDEX idx_menu_items_is_active ON public.menu_items (is_active);

ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active menu items"
  ON public.menu_items FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admin manages menu items"
  ON public.menu_items FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_menu_items_updated_at
  BEFORE UPDATE ON public.menu_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.menu_items (title, icon, route, section, order_index, role_access) VALUES
  ('Today''s Deals', 'tag', '/search?sort=discount', 'shop', 10, '{}'),
  ('New Arrivals', 'sparkles', '/search?sort=newest', 'shop', 20, '{}'),
  ('Best Sellers', 'trophy', '/search?sort=popularity', 'shop', 30, '{}'),
  ('Trending Now', 'flame', '/search?sort=trending', 'shop', 40, '{}');
