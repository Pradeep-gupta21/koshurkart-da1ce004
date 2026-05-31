import { useEffect } from "react";
import { Link } from "react-router-dom";
import { RotateCcw } from "lucide-react";

const SUPPORT_EMAIL = "support@koshurkart.com";
const LAST_UPDATED = "May 31, 2026";

const sections = [
  {
    id: "introduction",
    title: "1. Introduction",
    body: (
      <p>
        At <strong>Koshur Kart</strong>, customer satisfaction is at the heart
        of everything we do. This Refund &amp; Return Policy governs returns,
        replacements, and refunds for products purchased through our
        marketplace, and applies to all buyers and participating vendors.
      </p>
    ),
  },
  {
    id: "return-eligibility",
    title: "2. Return Eligibility",
    body: (
      <>
        <p>Products may be eligible for return if they are:</p>
        <ul>
          <li>Delivered damaged</li>
          <li>Delivered defective or not functioning as described</li>
          <li>The wrong item received</li>
          <li>Missing items from a multi-product order</li>
        </ul>
        <p>
          Return requests must generally be raised within{" "}
          <strong>7 days of delivery</strong>, unless a different window is
          explicitly stated by the vendor on the product page.
        </p>
      </>
    ),
  },
  {
    id: "non-returnable",
    title: "3. Non-Returnable Items",
    body: (
      <>
        <p>The following items are typically not eligible for return:</p>
        <ul>
          <li>Perishable goods (food, saffron, fresh produce)</li>
          <li>Personalized or customized products</li>
          <li>Digital products and downloadable content</li>
          <li>Items clearly marked as "non-returnable" on the listing</li>
          <li>Innerwear, intimate items, and consumables once opened</li>
        </ul>
      </>
    ),
  },
  {
    id: "return-process",
    title: "4. Return Request Process",
    body: (
      <>
        <p>To request a return:</p>
        <ol>
          <li>Open your order from the <Link to="/profile" className="text-accent hover:underline">Orders</Link> section.</li>
          <li>Click <strong>"Request Return"</strong> on the relevant item.</li>
          <li>Select a reason from the provided list.</li>
          <li>Upload supporting images or a short video if required (highly recommended for damaged or wrong-item claims).</li>
          <li>Submit the request and await confirmation.</li>
        </ol>
      </>
    ),
  },
  {
    id: "approval",
    title: "5. Return Approval",
    body: (
      <p>
        Every return request is reviewed by the vendor and, where necessary,
        the Koshur Kart team. We may request additional information or
        evidence to validate the claim. Approval, pickup arrangement, and
        return shipping instructions will be shared once the request is
        accepted.
      </p>
    ),
  },
  {
    id: "refund-process",
    title: "6. Refund Process",
    body: (
      <p>
        Once your return is approved and the product is received and verified
        by the vendor, the refund will be initiated automatically. Refunds are
        issued to the <strong>original payment method</strong> whenever
        possible. For Cash on Delivery orders, refunds are credited to a UPI
        ID or bank account you provide.
      </p>
    ),
  },
  {
    id: "refund-timelines",
    title: "7. Refund Timelines",
    body: (
      <>
        <p>Typical processing times after refund initiation:</p>
        <ul>
          <li><strong>UPI:</strong> 3–7 business days</li>
          <li><strong>Credit / Debit Cards:</strong> 5–10 business days</li>
          <li><strong>Net Banking / Wallets:</strong> 3–7 business days</li>
          <li><strong>Cash on Delivery:</strong> 5–7 business days to UPI / bank</li>
        </ul>
        <p className="text-xs opacity-80">
          These timelines are estimates only. Actual credit times may vary
          depending on your bank or payment provider.
        </p>
      </>
    ),
  },
  {
    id: "replacement",
    title: "8. Replacement Policy",
    body: (
      <p>
        Where applicable, eligible products may be replaced instead of refunded
        — subject to vendor policy, product availability, and serviceability
        in your delivery area.
      </p>
    ),
  },
  {
    id: "cancellation",
    title: "9. Cancellation Policy",
    body: (
      <>
        <p>You may cancel an order any time <strong>before it is shipped</strong>, free of charge.</p>
        <p>Once an order has been shipped:</p>
        <ul>
          <li>Cancellation may no longer be available.</li>
          <li>The standard return process will apply once the package is delivered.</li>
        </ul>
      </>
    ),
  },
  {
    id: "fraud-prevention",
    title: "10. Fraud Prevention",
    body: (
      <p>
        Koshur Kart reserves the right to reject refund or return claims that
        are fraudulent, abusive, or violate our marketplace policies. Repeated
        misuse may result in account suspension.
      </p>
    ),
  },
  {
    id: "vendor-responsibility",
    title: "11. Vendor Responsibility",
    body: (
      <p>
        Vendors are contractually responsible for honoring approved returns,
        replacements, and refunds in accordance with Koshur Kart's marketplace
        policies. Persistent failure to do so may result in penalties or
        removal from the platform.
      </p>
    ),
  },
  {
    id: "contact",
    title: "12. Contact Support",
    body: (
      <p>
        Need help with a return or refund? Reach our support team at{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent hover:underline font-medium">
          {SUPPORT_EMAIL}
        </a>{" "}
        and include your order ID for faster assistance.
      </p>
    ),
  },
];

const RefundReturnPolicyPage = () => {
  useEffect(() => {
    const prev = document.title;
    document.title = "Refund & Return Policy — Koshur Kart";
    return () => {
      document.title = prev;
    };
  }, []);

  return (
    <>
      <div className="bg-muted/30 border-b border-border">
        <div className="container mx-auto px-4 py-10 md:py-14 max-w-5xl">
          <div className="flex items-center gap-3 text-accent mb-3">
            <RotateCcw className="h-5 w-5" />
            <span className="text-xs font-semibold tracking-widest uppercase">Legal</span>
          </div>
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-foreground">
            Refund &amp; Return Policy
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Last updated: {LAST_UPDATED}
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-10 md:py-14 max-w-5xl">
        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-10">
          <aside className="hidden lg:block">
            <nav className="sticky top-24 space-y-1 text-sm">
              <p className="font-semibold text-foreground mb-3 text-xs uppercase tracking-wider">
                On this page
              </p>
              {sections.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="block py-1.5 text-muted-foreground hover:text-accent transition-colors"
                >
                  {s.title}
                </a>
              ))}
            </nav>
          </aside>

          <article className="min-w-0">
            <div className="rounded-xl border border-border bg-card p-6 md:p-10 shadow-sm">
              <p className="text-base text-muted-foreground leading-relaxed mb-8">
                Please read this policy carefully. By placing an order on
                Koshur Kart, you agree to the terms outlined below for
                returns, replacements, refunds, and cancellations.
              </p>

              <div className="space-y-10">
                {sections.map((s) => (
                  <section key={s.id} id={s.id} className="scroll-mt-24">
                    <h2 className="font-serif text-xl md:text-2xl font-semibold text-foreground mb-4">
                      {s.title}
                    </h2>
                    <div className="prose prose-sm md:prose-base max-w-none text-muted-foreground leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-2 [&_p]:mb-3 [&_strong]:text-foreground">
                      {s.body}
                    </div>
                  </section>
                ))}
              </div>

              <div className="mt-12 pt-6 border-t border-border text-sm text-muted-foreground">
                See also our{" "}
                <Link to="/terms-and-conditions" className="text-accent hover:underline font-medium">
                  Terms &amp; Conditions
                </Link>{" "}
                for the broader marketplace rules.
              </div>
            </div>
          </article>
        </div>
      </div>
    </>
  );
};

export default RefundReturnPolicyPage;
