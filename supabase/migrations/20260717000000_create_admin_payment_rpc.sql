-- =============================================================================
-- Migration: Create Admin Payment RPC
-- Wraps payment updates and audit logging into a single atomic transaction.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_process_payment(
  p_payment_id uuid,
  p_admin_id uuid,
  p_action text,
  p_transaction_id text DEFAULT NULL,
  p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_payment record;
  v_order_id uuid;
  v_new_status text;
  v_result jsonb;
  v_item record;
BEGIN
  -- 1. Verify payment exists and lock it
  SELECT id, order_id, payment_method, payment_status 
  INTO v_payment 
  FROM public.payments 
  WHERE id = p_payment_id 
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found';
  END IF;

  IF v_payment.payment_status NOT IN ('pending', 'pending_verification') THEN
    RAISE EXCEPTION 'Payment is not in a pending state. Current state: %', v_payment.payment_status;
  END IF;

  v_order_id := v_payment.order_id;

  -- 2. Process action
  IF p_action = 'approve' THEN
    v_new_status := 'success';
    
    -- Update Payment
    UPDATE public.payments 
    SET payment_status = v_new_status,
        transaction_id = COALESCE(p_transaction_id, transaction_id)
    WHERE id = p_payment_id;
    
    -- Update Order
    UPDATE public.orders 
    SET payment_status = 'paid', order_status = 'confirmed' 
    WHERE id = v_order_id;

    -- Audit Log
    PERFORM public.log_payment_event(
      p_payment_id,
      'admin_manual_approve',
      'Payment manually approved by admin',
      jsonb_build_object(
        'actor', p_admin_id,
        'transaction_id', p_transaction_id,
        'note', p_note,
        'previous_status', v_payment.payment_status
      )
    );

    v_result := jsonb_build_object('success', true, 'action', 'approved');

  ELSIF p_action = 'reject' THEN
    v_new_status := 'failed';
    
    -- Update Payment
    UPDATE public.payments 
    SET payment_status = v_new_status
    WHERE id = p_payment_id;
    
    -- Update Order
    UPDATE public.orders 
    SET payment_status = 'failed', order_status = 'cancelled' 
    WHERE id = v_order_id;

    -- Release reserved stock for each line item
    FOR v_item IN SELECT product_id, quantity FROM public.order_items WHERE order_id = v_order_id LOOP
      IF v_item.product_id IS NOT NULL THEN
        PERFORM public.release_stock(v_item.product_id, v_item.quantity);
      END IF;
    END LOOP;

    -- Audit Log
    PERFORM public.log_payment_event(
      p_payment_id,
      'admin_manual_reject',
      'Payment manually rejected by admin',
      jsonb_build_object(
        'actor', p_admin_id,
        'note', p_note,
        'previous_status', v_payment.payment_status
      )
    );

    v_result := jsonb_build_object('success', true, 'action', 'rejected');

  ELSE
    RAISE EXCEPTION 'Invalid action: %', p_action;
  END IF;

  RETURN v_result;
END;
$$;
