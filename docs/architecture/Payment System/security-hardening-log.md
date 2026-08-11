# Architecture & Security Updates

## 1. Payment/Order Status Vocabulary Resolution & Data Migration

The payment confirmation flow and all known readers/writers participating in payment confirmation were audited and aligned to a single, canonical status vocabulary. We also successfully managed the rollout compatibility concerns associated with historical deployments.

### The Core Issue Resolved
The core `create_payment_confirm` RPC was checking against and writing to a non-existent column (`status`) for both the `payments` and `orders` tables. Additionally, it assumed the payment state transitioned to `'confirmed'`, which directly contradicted the rest of the application ecosystem (which uses `'success'`). 
A secondary issue was found in `admin_process_payment`, which set `orders.payment_status` to `'completed'` instead of `'success'`.

### Completed Actions
- **Audited the Codebase:** Verified all uses of status checks across `create_payment_confirm`, `create_checkout_intent`, `admin_process_payment`, webhook handlers, and other payment Edge Functions. An audit report is preserved in [audit_report.md](audit_report.md).
- **Corrected `create_payment_confirm` RPC:** 
  - Modified [20260722202124_create_payment_confirm_rpc.sql](../../../supabase/migrations/20260722202124_create_payment_confirm_rpc.sql) to correctly reference the `.payment_status` column.
  - Replaced all instances of `status = 'confirmed'` checks with `payment_status = 'success'` for payments/orders.
  - Modified the idempotent replay capture and the response payload to correctly reflect `'success'` as the payment status.
- **Corrected `admin_process_payment` RPC:**
  - The previous changes to `admin_process_payment` set `orders.payment_status` to `'success'` instead of the obsolete `'completed'`.
- **Verified Readers and Writers:** Edge functions (e.g., `verify-razorpay-payment`, `razorpay-webhook`, `verify-upi-payment`) were audited. No modifications were needed to their business logic, as they correctly interact with `payment_status = 'success' | 'failed'`. 
- **Rollout Compatibility Data Migration:** 
  - Verified that `orders.payment_status` allows the legacy string `'completed'`.
  - Created [20260728153800_migrate_legacy_payment_status.sql](../../../supabase/migrations/20260728153800_migrate_legacy_payment_status.sql) to convert any legacy `orders.payment_status = 'completed'` rows to `'success'`. This idempotent data migration prevents `CONFLICT` rejections when `create_payment_confirm` is run against historical rows.

### Final Canonical Status Lifecycle
- **Payments:** `pending` → `success` | `failed`
- **Orders:** `orders.payment_status` (`pending` → `success` | `failed`), `orders.order_status` (`processing` → `confirmed` → `cancelled`)
- **Ledger:** `pending` → `confirmed` | `failed`

---

## 2. Secure `upsert_vendor_payment_setup_atomic`

We eliminated a privilege escalation vulnerability in the `upsert_vendor_payment_setup_atomic` RPC.

### Security Vulnerability
The RPC was created as a `SECURITY DEFINER` to allow atomic and privileged updates to a vendor's payment routing preferences. However, PostgreSQL implicitly grants `EXECUTE` privileges to `PUBLIC` by default. Since the function did not explicitly enforce ownership inside its SQL block (relying on the Edge Function layer to authorize), any authenticated or anonymous user executing the RPC directly could bypass Row Level Security (RLS) and overwrite another vendor's payment preferences.

### Remediation
- **Audited Call Sites:** Verified that the RPC is *exclusively* invoked server-side by the `vendor-setup-payment` Edge Function, using the `service_role` client. Zero direct client invocations exist.
- **Enforced Least Privilege:** Created the migration [20260728155500_secure_vendor_payment_rpc.sql](../../../supabase/migrations/20260728155500_secure_vendor_payment_rpc.sql) to strictly revoke PostgreSQL's default `PUBLIC`, `anon`, and `authenticated` execution rights for the exact function signature: `(uuid, text, text, text, text, text)`. 
- **Preserved Existing Architecture:** Maintained the existing structure where the Edge Function performs authentication and ownership checks, and then triggers the RPC via `service_role`. No business logic, validation logic, or atomicity parameters were modified.

---

## 3. Fix Backfill Migration CHECK Constraint Violation

We eliminated a deployment risk in the `vendor_payment_setup` migration where data backfill logic conflicted with inline table constraints.

### Vulnerability
The migration [20260714090000_vendor_payment_setup.sql](../../../supabase/migrations/20260714090000_vendor_payment_setup.sql) originally enforced inline `CHECK` constraints on table creation (`check_ifsc_requires_account`). It subsequently attempted to backfill legacy data using an `INSERT` statement that completely omitted the `account_number` column. If any legacy vendor had an IFSC code, this omission resulted in an immediate `NULL` constraint violation, crashing the deployment.

### Remediation
- **Constraint Sequencing:** Moved the `CHECK` constraints out of the `CREATE TABLE` definition and appended them as `ALTER TABLE ... ADD CONSTRAINT` statements at the very end of the migration script.
- **Data Normalization:** Updated the legacy backfill step to populate `account_number` from the historical `bank_account_number_masked` field before constraint validation.
- **Result:** Existing rows are normalized before constraint validation, ensuring the migration succeeds on both legacy and fresh deployments while producing the same final schema.

### Net Effect
These changes improve the security, deployment safety, and consistency of the payment architecture without altering the intended financial workflows, ledger behavior, or canonical RPC ownership model.
