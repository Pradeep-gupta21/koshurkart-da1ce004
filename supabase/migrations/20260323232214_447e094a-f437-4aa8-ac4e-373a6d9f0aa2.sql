CREATE TRIGGER trigger_on_payment_success
  AFTER UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.on_payment_success();