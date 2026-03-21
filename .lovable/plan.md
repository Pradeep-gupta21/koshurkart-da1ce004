

## Admin Payment Verification Page — Implementation Plan

### Overview
Create an admin page to view, verify, and manage UPI payments pending verification. When admin approves/rejects, payment and order statuses sync, and vendor earnings update automatically (via existing `on_payment_success` trigger).

### 1. Create `src/pages/admin/AdminPayments.tsx`

Page showing all payments with focus on `pending_verification` status:

- **Filter tabs**: All / Pending Verification / Success / Failed
- **Payment table**: ID, order ID, amount, method, status, date, actions
- **For UPI payments**: show uploaded screenshot (payment_proof) in a dialog/modal
- **Action buttons**:
  - "Approve" → calls `paymentService.updatePaymentStatus(id, 'success')` + `orderService.updateOrderStatus(orderId, { payment_status: 'paid', order_status: 'confirmed' })`
  - "Reject" → calls `paymentService.updatePaymentStatus(id, 'failed')` + `orderService.updateOrderStatus(orderId, { payment_status: 'failed' })`
- Vendor earnings update automatically via the existing `on_payment_success` DB trigger when status becomes `success`
- Toast notifications on action completion

### 2. Update `src/pages/admin/AdminDashboard.tsx`

Add "Payments" nav item with a badge showing count of `pending_verification` payments.

### 3. Update `src/App.tsx`

Add `/admin/payments` route under the admin layout.

### Files
- **Create**: `src/pages/admin/AdminPayments.tsx`
- **Modify**: `src/pages/admin/AdminDashboard.tsx` — add nav item
- **Modify**: `src/App.tsx` — add route

No database changes needed — admin already has UPDATE access on payments via RLS, and the `on_payment_success` trigger handles vendor earnings.

