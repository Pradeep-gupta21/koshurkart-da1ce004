

## Improve Checkout Payment Method UI

### What changes
Replace the current plain radio-button list of 6 payment methods with 3 clean, modern card-based options: **UPI QR**, **Razorpay**, and **Cash on Delivery**. Remove the unused card/netbanking/wallet options (those are already covered inside Razorpay's modal).

### Design
Each payment method rendered as a selectable card with:
- Large icon in a colored circle
- Method name + short description
- Subtle border highlight + background tint when selected
- Check indicator on the selected card

```text
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  (QR icon)      │  │  (Credit icon)  │  │  (Banknote)     │
│  Pay using UPI  │  │  Pay via        │  │  Cash on        │
│  Scan QR code   │  │  Razorpay       │  │  Delivery       │
│  to pay         │  │  Card, UPI,     │  │  Pay when you   │
│                 │  │  Netbanking...  │  │  receive order  │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

### File to modify
- `src/pages/CheckoutPage.tsx` — lines 19-26 (payment methods array) and lines 496-543 (payment method UI section)

### Implementation details
1. Reduce `PAYMENT_METHODS` to 3 entries: `upi`, `razorpay`, `cod` — each with a label, description, and icon
2. Replace the `RadioGroup` with a grid of clickable cards using existing `cn()` utility for conditional styling
3. Selected card gets `border-primary bg-primary/5 ring-2 ring-primary/20`; unselected gets `border-border hover:border-primary/30`
4. Each card shows icon in a colored circle, title, and a one-line description
5. Remove the card number form fields (lines 513-528) since that method is removed
6. Keep the existing UPI and Razorpay info hints below the cards
7. Default payment method changed to `upi`

