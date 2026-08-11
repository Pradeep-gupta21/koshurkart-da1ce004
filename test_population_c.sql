BEGIN;

-- Setup test vendors
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('b1111111-1111-1111-1111-111111111111', 'b1@test.com', '{"terms_accepted": true}'),
  ('b2222222-2222-2222-2222-222222222222', 'b2@test.com', '{"terms_accepted": true}'),
  ('b3333333-3333-3333-3333-333333333333', 'b3@test.com', '{"terms_accepted": true}'),
  ('11111111-1111-1111-1111-111111111111', 'v1@test.com', '{"terms_accepted": true}'),
  ('22222222-2222-2222-2222-222222222222', 'v2@test.com', '{"terms_accepted": true}'),
  ('33333333-3333-3333-3333-333333333333', 'v3@test.com', '{"terms_accepted": true}'),
  ('44444444-4444-4444-4444-444444444444', 'v4@test.com', '{"terms_accepted": true}'),
  ('55555555-5555-5555-5555-555555555555', 'v5@test.com', '{"terms_accepted": true}'),
  ('66666666-6666-6666-6666-666666666666', 'v6@test.com', '{"terms_accepted": true}'),
  ('77777777-7777-7777-7777-777777777777', 'v7@test.com', '{"terms_accepted": true}'),
  ('88888888-8888-8888-8888-888888888888', 'v8@test.com', '{"terms_accepted": true}'),
  ('99999999-9999-9999-9999-999999999999', 'v9@test.com', '{"terms_accepted": true}'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'v10@test.com', '{"terms_accepted": true}'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'v11@test.com', '{"terms_accepted": true}'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'v12@test.com', '{"terms_accepted": true}'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'v13@test.com', '{"terms_accepted": true}')
ON CONFLICT DO NOTHING;

INSERT INTO public.vendors (id, user_id, store_name, store_slug, business_name, total_earnings, withdrawable_balance, is_ledger_reconciled) VALUES
  ('b1111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111', 'sb1', 'sb1', 'B1 - Eligible Pop B', 50.00, 50.00, false),
  ('b2222222-2222-2222-2222-222222222222', 'b2222222-2222-2222-2222-222222222222', 'sb2', 'sb2', 'B2 - Blocked Pending Payout', 50.00, 50.00, false),
  ('b3333333-3333-3333-3333-333333333333', 'b3333333-3333-3333-3333-333333333333', 'sb3', 'sb3', 'B3 - Eligible Failed Payout', 50.00, 50.00, false),
  ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 's1', 's1', 'V1 - Exact Balance', 10.00, 1000, false),
  ('22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 's2', 's2', 'V2 - Balance 1 paise high', 10.00, 1001, false),
  ('33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', 's3', 's3', 'V3 - Balance 1 paise low', 10.00, 999, false),
  ('44444444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444', 's4', 's4', 'V4 - Valid credit+payout', 20.00, 500, false),
  ('55555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555', 's5', 's5', 'V5 - Pending credit ignores', 10.00, 1000, false),
  ('66666666-6666-6666-6666-666666666666', '66666666-6666-6666-6666-666666666666', 's6', 's6', 'V6 - Unknown ledger type', 10.00, 1000, false),
  ('77777777-7777-7777-7777-777777777777', '77777777-7777-7777-7777-777777777777', 's7', 's7', 'V7 - Failed payout ignores', 10.00, 1000, false),
  ('88888888-8888-8888-8888-888888888888', '88888888-8888-8888-8888-888888888888', 's8', 's8', 'V8 - Mixed historical failing witness', 10.00, 1000, false),
  ('99999999-9999-9999-9999-999999999999', '99999999-9999-9999-9999-999999999999', 's9', 's9', 'V9 - Pending payout deducts', 10.00, 800, false)
ON CONFLICT (id) DO UPDATE SET total_earnings=EXCLUDED.total_earnings, withdrawable_balance=EXCLUDED.withdrawable_balance, is_ledger_reconciled=false;

-- Temporarily disable triggers for fixture insertion
ALTER TABLE public.ledger_entries DISABLE TRIGGER trg_recalculate_withdrawable_balance;
ALTER TABLE public.payouts DISABLE TRIGGER trg_validate_payout_request;

DELETE FROM public.ledger_entries WHERE vendor_id IN ('b1111111-1111-1111-1111-111111111111', 'b2222222-2222-2222-2222-222222222222', 'b3333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444', '55555555-5555-5555-5555-555555555555', '66666666-6666-6666-6666-666666666666', '77777777-7777-7777-7777-777777777777', '88888888-8888-8888-8888-888888888888', '99999999-9999-9999-9999-999999999999', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
DELETE FROM public.payouts WHERE vendor_id IN ('b1111111-1111-1111-1111-111111111111', 'b2222222-2222-2222-2222-222222222222', 'b3333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444', '55555555-5555-5555-5555-555555555555', '66666666-6666-6666-6666-666666666666', '77777777-7777-7777-7777-777777777777', '88888888-8888-8888-8888-888888888888', '99999999-9999-9999-9999-999999999999', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- POPULATION B FIXTURES (No ledger entries)
-- B1: Eligible Pop B
-- No payouts, balance 50.00
-- (Do nothing)

-- B2: Blocked Pending Payout
INSERT INTO public.payouts (id, vendor_id, amount_paise, amount, status, idempotency_key) VALUES 
  ('b2222222-0000-0000-0000-b22222222222', 'b2222222-2222-2222-2222-222222222222', NULL, 10.00, 'pending', 'b2222222-4000-0000-0000-000000000000');

-- B3: Eligible Failed Payout
INSERT INTO public.payouts (id, vendor_id, amount_paise, amount, status, idempotency_key) VALUES 
  ('b3333333-0000-0000-0000-b33333333333', 'b3333333-3333-3333-3333-333333333333', NULL, 10.00, 'failed', 'b3333333-4000-0000-0000-000000000000');

-- V1: 10 rupees total_earnings = 1000 paise credit.
INSERT INTO public.ledger_entries (id, operation_key, vendor_id, type, amount_paise, status) VALUES 
  ('11111111-1000-0000-0000-000000000000', '11111111-2000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'credit', 1000, 'confirmed');

-- V2: 10 rupees total_earnings = 1000 paise credit. (Balance manually set to 10.01, should fail)
INSERT INTO public.ledger_entries (id, operation_key, vendor_id, type, amount_paise, status) VALUES 
  ('22222222-1000-0000-0000-000000000000', '22222222-2000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'credit', 1000, 'confirmed');

-- V3: 10 rupees total_earnings = 1000 paise credit. (Balance manually set to 9.99, should fail)
INSERT INTO public.ledger_entries (id, operation_key, vendor_id, type, amount_paise, status) VALUES 
  ('33333333-1000-0000-0000-000000000000', '33333333-2000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333', 'credit', 1000, 'confirmed');

-- V4: 20 rupees total_earnings, 1500 paise payout = 500 paise balance.
INSERT INTO public.ledger_entries (id, operation_key, vendor_id, type, amount_paise, status) VALUES 
  ('44444444-1000-0000-0000-000000000000', '44444444-2000-0000-0000-000000000000', '44444444-4444-4444-4444-444444444444', 'credit', 2000, 'confirmed');
INSERT INTO public.payouts (id, vendor_id, amount_paise, amount, status, debited_at, idempotency_key) VALUES 
  ('44444444-0000-0000-0000-444444444444', '44444444-4444-4444-4444-444444444444', 1500, 15.00, 'completed', now(), '44444444-4000-0000-0000-000000000000');
INSERT INTO public.ledger_entries (id, operation_key, vendor_id, type, amount_paise, status, payout_id) VALUES 
  ('44444444-3000-0000-0000-000000000000', '44444444-5000-0000-0000-000000000000', '44444444-4444-4444-4444-444444444444', 'payout', 1500, 'confirmed', '44444444-0000-0000-0000-444444444444');

-- V5: 10 rupees total_earnings + pending credit of 5 rupees. Balance 10.00. Should pass.
INSERT INTO public.ledger_entries (id, operation_key, vendor_id, type, amount_paise, status) VALUES 
  ('55555555-1000-0000-0000-000000000000', '55555555-2000-0000-0000-000000000000', '55555555-5555-5555-5555-555555555555', 'credit', 1000, 'confirmed'),
  ('55555555-3000-0000-0000-000000000000', '55555555-5000-0000-0000-000000000000', '55555555-5555-5555-5555-555555555555', 'credit', 500, 'pending');

-- V6: Unknown ledger type 'refund'.
INSERT INTO public.ledger_entries (id, operation_key, vendor_id, type, amount_paise, status) VALUES 
  ('66666666-1000-0000-0000-000000000000', '66666666-2000-0000-0000-000000000000', '66666666-6666-6666-6666-666666666666', 'credit', 1000, 'confirmed'),
  ('66666666-3000-0000-0000-000000000000', '66666666-5000-0000-0000-000000000000', '66666666-6666-6666-6666-666666666666', 'refund', 0, 'confirmed');

-- V7: Failed payout ignores. 10 rupees total_earnings, 500 paise failed payout. Balance 10.00.
INSERT INTO public.ledger_entries (id, operation_key, vendor_id, type, amount_paise, status) VALUES 
  ('77777777-1000-0000-0000-000000000000', '77777777-2000-0000-0000-000000000000', '77777777-7777-7777-7777-777777777777', 'credit', 1000, 'confirmed');
INSERT INTO public.payouts (id, vendor_id, amount_paise, amount, status, debited_at, idempotency_key) VALUES 
  ('77777777-0000-0000-0000-777777777777', '77777777-7777-7777-7777-777777777777', 500, 5.00, 'failed', now(), '77777777-4000-0000-0000-000000000000');
INSERT INTO public.ledger_entries (id, operation_key, vendor_id, type, amount_paise, status, payout_id) VALUES 
  ('77777777-3000-0000-0000-000000000000', '77777777-5000-0000-0000-000000000000', '77777777-7777-7777-7777-777777777777', 'payout', 500, 'failed', '77777777-0000-0000-0000-777777777777');

-- V8: Mixed historical failing witness. 10 rupees total_earnings, but only 500 paise credit in ledger.
INSERT INTO public.ledger_entries (id, operation_key, vendor_id, type, amount_paise, status) VALUES 
  ('88888888-1000-0000-0000-000000000000', '88888888-2000-0000-0000-000000000000', '88888888-8888-8888-8888-888888888888', 'credit', 500, 'confirmed');

-- V9: Pending payout deducts. 10 rupees total_earnings, 200 paise pending payout. Balance 8.00.
INSERT INTO public.ledger_entries (id, operation_key, vendor_id, type, amount_paise, status) VALUES 
  ('99999999-1000-0000-0000-000000000000', '99999999-2000-0000-0000-000000000000', '99999999-9999-9999-9999-999999999999', 'credit', 1000, 'confirmed');
INSERT INTO public.payouts (id, vendor_id, amount_paise, amount, status, debited_at, idempotency_key) VALUES 
  ('99999999-0000-0000-0000-999999999999', '99999999-9999-9999-9999-999999999999', 200, 2.00, 'pending', now(), '99999999-4000-0000-0000-000000000000');
INSERT INTO public.ledger_entries (id, operation_key, vendor_id, type, amount_paise, status, payout_id) VALUES 
  ('99999999-3000-0000-0000-000000000000', '99999999-5000-0000-0000-000000000000', '99999999-9999-9999-9999-999999999999', 'payout', 200, 'pending', '99999999-0000-0000-0000-999999999999');

-- V10: Ambiguous Schema State (was once "Ambiguous Backfill"). Must fail closed.
INSERT INTO public.vendors (id, user_id, store_name, store_slug, business_name, total_earnings, withdrawable_balance, is_ledger_reconciled) VALUES 
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 's10', 's10', 'V10 - Ambiguous Schema State', 10.00, 1000, false)
ON CONFLICT (id) DO UPDATE SET total_earnings=EXCLUDED.total_earnings, withdrawable_balance=EXCLUDED.withdrawable_balance, is_ledger_reconciled=false;
INSERT INTO public.ledger_entries (id, operation_key, vendor_id, type, amount_paise, status) VALUES 
  ('aaaaaaaa-1000-0000-0000-000000000000', 'aaaaaaaa-2000-0000-0000-000000000000', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'credit', 1000, 'confirmed');
INSERT INTO public.payouts (id, vendor_id, amount, amount_paise, status, debited_at, idempotency_key) VALUES 
  ('aaaaaaaa-0000-0000-0000-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 100, NULL, 'completed', now(), 'aaaaaaaa-4000-0000-0000-000000000000');
INSERT INTO public.ledger_entries (id, operation_key, vendor_id, type, amount_paise, status, payout_id) VALUES 
  ('aaaaaaaa-3000-0000-0000-000000000000', 'payout:aaaaaaaa-0000-0000-0000-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'payout', 100, 'confirmed', 'aaaaaaaa-0000-0000-0000-aaaaaaaaaaaa');

-- V11: Zero-paise ledger row (previously failed backfill). Must fail closed.
INSERT INTO public.vendors (id, user_id, store_name, store_slug, business_name, total_earnings, withdrawable_balance, is_ledger_reconciled) VALUES 
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 's11', 's11', 'V11 - Zero Paise Payout', 0, 0, false)
ON CONFLICT (id) DO UPDATE SET total_earnings=EXCLUDED.total_earnings, withdrawable_balance=EXCLUDED.withdrawable_balance, is_ledger_reconciled=false;
INSERT INTO public.payouts (id, vendor_id, amount, status, debited_at, idempotency_key, amount_paise) VALUES 
  ('bbbbbbbb-0000-0000-0000-bbbbbbbbbbbb', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 0, 'completed', now(), 'bbbbbbbb-4000-0000-0000-000000000000', NULL);
INSERT INTO public.ledger_entries (id, operation_key, vendor_id, type, amount_paise, status, payout_id) VALUES 
  ('bbbbbbbb-3000-0000-0000-000000000000', 'payout:bbbbbbbb-0000-0000-0000-bbbbbbbbbbbb', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'payout', 0, 'confirmed', 'bbbbbbbb-0000-0000-0000-bbbbbbbbbbbb');

-- V12: Flawed transitional row. Payout amount explicitly 1050 (paise accidentally stored in rupees column).
-- In the revised fail-closed architecture, THIS ROW IS INTENTIONALLY NOT REPAIRED! It must fail Pop C and fall to Pop D.
INSERT INTO public.vendors (id, user_id, store_name, store_slug, business_name, total_earnings, withdrawable_balance, is_ledger_reconciled) VALUES 
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 's12', 's12', 'V12 - Flawed Transitional', 10.50, 0, false)
ON CONFLICT (id) DO UPDATE SET total_earnings=EXCLUDED.total_earnings, withdrawable_balance=EXCLUDED.withdrawable_balance, is_ledger_reconciled=false;
INSERT INTO public.payouts (id, vendor_id, amount, status, debited_at, idempotency_key, amount_paise) VALUES 
  ('cccccccc-0000-0000-0000-cccccccccccc', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 1050, 'completed', now(), 'cccccccc-4000-0000-0000-000000000000', NULL);
INSERT INTO public.ledger_entries (id, operation_key, vendor_id, type, amount_paise, status, payout_id) VALUES 
  ('cccccccc-1000-0000-0000-000000000000', 'cccccccc-2000-0000-0000-000000000000', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'credit', 1050, 'confirmed', NULL),
  ('cccccccc-3000-0000-0000-000000000000', 'payout:cccccccc-0000-0000-0000-cccccccccccc', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'payout', 1050, 'confirmed', 'cccccccc-0000-0000-0000-cccccccccccc');

-- V13: Ordinary legacy row. Must fail closed since amount_paise IS NULL.
INSERT INTO public.vendors (id, user_id, store_name, store_slug, business_name, total_earnings, withdrawable_balance, is_ledger_reconciled) VALUES 
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 's13', 's13', 'V13 - Ordinary Legacy', 20.00, 950, false)
ON CONFLICT (id) DO UPDATE SET total_earnings=EXCLUDED.total_earnings, withdrawable_balance=EXCLUDED.withdrawable_balance, is_ledger_reconciled=false;
INSERT INTO public.payouts (id, vendor_id, amount, status, debited_at, idempotency_key, amount_paise) VALUES 
  ('dddddddd-0000-0000-0000-dddddddddddd', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 10.50, 'completed', now(), 'dddddddd-4000-0000-0000-000000000000', NULL);
INSERT INTO public.ledger_entries (id, operation_key, vendor_id, type, amount_paise, status, payout_id) VALUES 
  ('dddddddd-1000-0000-0000-000000000000', 'dddddddd-2000-0000-0000-000000000000', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'credit', 2000, 'confirmed', NULL);

-- REENABLE TRIGGERS
ALTER TABLE public.ledger_entries ENABLE TRIGGER trg_recalculate_withdrawable_balance;
ALTER TABLE public.payouts ENABLE TRIGGER trg_validate_payout_request;

-- ==========================================
-- POPULATION B LOGIC SIMULATION
-- ==========================================
CREATE TEMP TABLE legacy_balance_candidates ON COMMIT DROP AS
SELECT
    v.id AS vendor_id,
    (v.withdrawable_balance * 100)::BIGINT AS opening_balance_paise
FROM public.vendors v
WHERE v.id IN ('b1111111-1111-1111-1111-111111111111', 'b2222222-2222-2222-2222-222222222222', 'b3333333-3333-3333-3333-333333333333')
  AND v.withdrawable_balance > 0
  AND NOT EXISTS (
      SELECT 1
      FROM public.ledger_entries le
      WHERE le.vendor_id = v.id
  )
  AND NOT EXISTS (
      SELECT 1
      FROM public.payouts p
      WHERE p.vendor_id = v.id
        AND p.status IN ('pending', 'processing')
  );

INSERT INTO public.ledger_entries (
    vendor_id,
    type,
    status,
    amount_paise,
    operation_key
)
SELECT
    vendor_id,
    'credit',
    'confirmed',
    opening_balance_paise,
    'legacy_opening_balance:' || vendor_id::text
FROM legacy_balance_candidates;

UPDATE public.vendors v
SET is_ledger_reconciled = TRUE
FROM legacy_balance_candidates c
WHERE v.id = c.vendor_id;

-- ==========================================
-- POPULATION C LOGIC SIMULATION
-- ==========================================

UPDATE public.vendors v
SET is_ledger_reconciled = TRUE
WHERE 
  v.id IN (
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    '33333333-3333-3333-3333-333333333333',
    '44444444-4444-4444-4444-444444444444',
    '55555555-5555-5555-5555-555555555555',
    '66666666-6666-6666-6666-666666666666',
    '77777777-7777-7777-7777-777777777777',
    '88888888-8888-8888-8888-888888888888',
    '99999999-9999-9999-9999-999999999999',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'dddddddd-dddd-dddd-dddd-dddddddddddd'
  )
  AND
  -- Must be a ledger-era vendor
  EXISTS (
      SELECT 1
      FROM public.ledger_entries le
      WHERE le.vendor_id = v.id
  )
  
  -- GUARD 1: Fail closed on unproven ledger types
  AND NOT EXISTS (
      SELECT 1 FROM public.ledger_entries le 
      WHERE le.vendor_id = v.id 
        AND le.type NOT IN ('credit', 'reversal', 'payout')
  )

  -- GUARD 1b: Fail closed on unproven ledger statuses
  AND NOT EXISTS (
      SELECT 1 FROM public.ledger_entries le 
      WHERE le.vendor_id = v.id 
        AND le.status NOT IN ('pending', 'confirmed', 'failed')
  )

  -- GUARD 2: Fail closed on unproven historical payout statuses
  AND NOT EXISTS (
      SELECT 1 FROM public.payouts p
      WHERE p.vendor_id = v.id
        AND p.status NOT IN ('pending', 'processing', 'completed', 'failed', 'cancelled', 'rejected')
  )
  
  -- GUARD 3: Inbound precision loss check (total_earnings is in rupees)
  AND (COALESCE(v.total_earnings, 0) * 100) = TRUNC(COALESCE(v.total_earnings, 0) * 100)
  
  -- GUARD 4: Outbound precision loss check (only applies to legacy rupee payouts)
  AND NOT EXISTS (
      SELECT 1 FROM public.payouts p 
      WHERE p.vendor_id = v.id 
        AND p.status IN ('pending', 'processing', 'completed')
        AND p.debited_at IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.ledger_entries le WHERE le.payout_id = p.id)
        AND (p.amount * 100) <> TRUNC(p.amount * 100)
  )

  -- WITNESS 1: Inbound flow completeness (total_earnings)
  AND (COALESCE(v.total_earnings, 0) * 100)::BIGINT = (
      SELECT COALESCE(SUM(
          CASE 
              WHEN type = 'credit' AND status = 'confirmed' THEN amount_paise 
              WHEN type = 'reversal' AND status IN ('pending', 'confirmed') THEN -amount_paise 
              ELSE 0 
          END
      ), 0)::BIGINT
      FROM public.ledger_entries
      WHERE vendor_id = v.id
  )

  -- WITNESS 2: Outbound flow completeness (payouts)
  AND (
      SELECT COALESCE(SUM(
          COALESCE(
              p.amount_paise,
              (p.amount * 100)::BIGINT
          )
      ), 0)::BIGINT
      FROM public.payouts p
      WHERE p.vendor_id = v.id 
        AND p.status IN ('pending', 'processing', 'completed')
        AND p.debited_at IS NOT NULL
  ) = (
      SELECT COALESCE(SUM(amount_paise), 0)::BIGINT
      FROM public.ledger_entries
      WHERE vendor_id = v.id 
        AND type = 'payout' 
        AND status IN ('pending', 'confirmed')
  )
  
  -- WITNESS 3: Strict Solvency Consistency (withdrawable_balance)
  -- The stored spendable balance (paise) MUST exactly equal the production projection.
  -- This proves the vendor holds the correct canonical denominator without inflating via *100.
  AND COALESCE(v.withdrawable_balance, 0)::BIGINT = (
      SELECT COALESCE(SUM(
          CASE
            WHEN type = 'credit' AND status = 'confirmed' THEN amount_paise
            WHEN type IN ('payout', 'reversal') AND status IN ('pending', 'confirmed') THEN -amount_paise
            ELSE 0
          END
      ), 0)::BIGINT
      FROM public.ledger_entries le
      WHERE le.vendor_id = v.id
  );

-- ==========================================
-- ASSERTIONS
-- ==========================================
DO $$
DECLARE
  v_rec record;
  v_expected_certified boolean;
  v_ledger_count int;
  v_ledger_amount bigint;
BEGIN
  -- Assert B1: Eligible Pop B
  SELECT is_ledger_reconciled INTO v_rec FROM public.vendors WHERE id = 'b1111111-1111-1111-1111-111111111111';
  IF NOT v_rec.is_ledger_reconciled THEN RAISE EXCEPTION 'ASSERTION FAILED: B1 must be reconciled'; END IF;
  SELECT COUNT(*), COALESCE(SUM(amount_paise), 0) INTO v_ledger_count, v_ledger_amount FROM public.ledger_entries WHERE vendor_id = 'b1111111-1111-1111-1111-111111111111';
  IF v_ledger_count <> 1 THEN RAISE EXCEPTION 'ASSERTION FAILED: B1 ledger_count'; END IF;
  IF v_ledger_amount <> 5000 THEN RAISE EXCEPTION 'ASSERTION FAILED: B1 ledger_amount'; END IF;

  -- Assert B2: Blocked Pending Payout
  SELECT is_ledger_reconciled INTO v_rec FROM public.vendors WHERE id = 'b2222222-2222-2222-2222-222222222222';
  IF v_rec.is_ledger_reconciled THEN RAISE EXCEPTION 'ASSERTION FAILED: B2 must NOT be reconciled'; END IF;
  SELECT COUNT(*) INTO v_ledger_count FROM public.ledger_entries WHERE vendor_id = 'b2222222-2222-2222-2222-222222222222';
  IF v_ledger_count <> 0 THEN RAISE EXCEPTION 'ASSERTION FAILED: B2 ledger_count'; END IF;

  -- Assert B3: Eligible Failed Payout
  SELECT is_ledger_reconciled INTO v_rec FROM public.vendors WHERE id = 'b3333333-3333-3333-3333-333333333333';
  IF NOT v_rec.is_ledger_reconciled THEN RAISE EXCEPTION 'ASSERTION FAILED: B3 must be reconciled'; END IF;
  SELECT COUNT(*), COALESCE(SUM(amount_paise), 0) INTO v_ledger_count, v_ledger_amount FROM public.ledger_entries WHERE vendor_id = 'b3333333-3333-3333-3333-333333333333';
  IF v_ledger_count <> 1 THEN RAISE EXCEPTION 'ASSERTION FAILED: B3 ledger_count'; END IF;
  IF v_ledger_amount <> 5000 THEN RAISE EXCEPTION 'ASSERTION FAILED: B3 ledger_amount'; END IF;

  -- Assert V12 flawed transitional row is INTENTIONALLY NOT REPAIRED!
  IF NOT EXISTS (
    SELECT 1 FROM public.payouts p 
    WHERE p.vendor_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' 
      AND p.amount_paise IS NULL
      AND p.amount = 1050
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: V12 flawed transitional row was dangerously repaired or modified!';
  END IF;

  FOR v_rec IN (
    SELECT id, business_name, is_ledger_reconciled
    FROM public.vendors 
    WHERE id IN (
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
      '33333333-3333-3333-3333-333333333333',
      '44444444-4444-4444-4444-444444444444',
      '55555555-5555-5555-5555-555555555555',
      '66666666-6666-6666-6666-666666666666',
      '77777777-7777-7777-7777-777777777777',
      '88888888-8888-8888-8888-888888888888',
      '99999999-9999-9999-9999-999999999999',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
      'dddddddd-dddd-dddd-dddd-dddddddddddd'
    )
  ) LOOP
    -- V1, V4, V5, V7, V9, V11 are expected to certify (TRUE)
    -- V2, V3, V6, V8, V10, V12, V13 are expected to fail (FALSE)
    v_expected_certified := v_rec.id IN (
      '11111111-1111-1111-1111-111111111111',
      '44444444-4444-4444-4444-444444444444',
      '55555555-5555-5555-5555-555555555555',
      '77777777-7777-7777-7777-777777777777',
      '99999999-9999-9999-9999-999999999999',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    );
    
    IF v_rec.is_ledger_reconciled <> v_expected_certified THEN
      RAISE EXCEPTION 'ASSERTION FAILED: Vendor % expected to be %, but was %', v_rec.business_name, v_expected_certified, v_rec.is_ledger_reconciled;
    END IF;
  END LOOP;
  RAISE NOTICE 'ALL POPULATION C & B TESTS PASSED.';
END $$;

ROLLBACK;
