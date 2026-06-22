ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS videos text[] NOT NULL DEFAULT '{}';

-- Length guard for title
CREATE OR REPLACE FUNCTION public.validate_review_title()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.title IS NOT NULL AND length(NEW.title) > 150 THEN
    RAISE EXCEPTION 'Review title must be 150 characters or less';
  END IF;
  IF NEW.videos IS NOT NULL AND array_length(NEW.videos, 1) > 2 THEN
    RAISE EXCEPTION 'A review can include at most 2 videos';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reviews_validate_title ON public.reviews;
CREATE TRIGGER reviews_validate_title
BEFORE INSERT OR UPDATE ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.validate_review_title();