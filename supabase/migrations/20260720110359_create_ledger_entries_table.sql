CREATE TYPE ledger_entry_type AS ENUM (
  'credit',
  'debit',
  'reservation',
  'refund',
  'reversal',
  'payout',
  'adjustment'
);

CREATE TYPE ledger_entry_status AS ENUM (
  'pending',
  'confirmed',
  'failed'
);

CREATE TABLE ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID REFERENCES vendors(id),
  order_id UUID REFERENCES orders(id),
  order_item_id UUID REFERENCES order_items(id),
  payout_id UUID REFERENCES payouts(id),
  type ledger_entry_type NOT NULL,
  status ledger_entry_status NOT NULL,
  amount_paise BIGINT NOT NULL,
  operation_key TEXT NOT NULL,
  razorpay_reference_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  notes TEXT,
  UNIQUE (operation_key, type)
);

CREATE INDEX ledger_entries_vendor_id_created_at_idx
ON ledger_entries (vendor_id, created_at);

CREATE INDEX ledger_entries_status_created_at_idx
ON ledger_entries (status, created_at);