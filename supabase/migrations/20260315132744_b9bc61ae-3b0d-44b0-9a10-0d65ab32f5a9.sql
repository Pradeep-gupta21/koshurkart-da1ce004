
-- Allow admins to update payouts (approve/reject)
CREATE POLICY "Admin updates payouts"
  ON public.payouts FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
