import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { ScrollText } from "lucide-react";

const SUPPORT_EMAIL = "support@koshurkart.com";
const LAST_UPDATED = "May 31, 2026";

const sections = [
  {
    id: "introduction",
    title: "1. Introduction",
    body: (
      <>
        <p>
          Welcome to <strong>Koshur Kart</strong>, a multi-vendor marketplace
          connecting buyers with trusted sellers across the valley and beyond.
        </p>
        <p>
          By accessing or using our website, mobile experience, or any related
          services (collectively, the "Platform"), you agree to be bound by
          these Terms &amp; Conditions and our Privacy Policy. If you do not
          agree, please do not use the Platform.
        </p>
      </>
    ),
  },
  {
    id: "user-accounts",
    title: "2. User Accounts",
    body: (
      <ul>
        <li>You are responsible for maintaining the confidentiality of your account credentials and for all activities under your account.</li>
        <li>You must provide accurate, current, and complete information during registration and keep it up to date.</li>
        <li>Notify us immediately of any unauthorized access or suspected security breach at <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent hover:underline">{SUPPORT_EMAIL}</a>.</li>
      </ul>
    ),
  },
  {
    id: "orders-payments",
    title: "3. Orders & Payments",
    body: (
      <ul>
        <li>All orders are subject to product availability and vendor confirmation.</li>
        <li>Payments must be completed in full before an order is processed, except where Cash on Delivery is explicitly offered.</li>
        <li>Koshur Kart reserves the right to cancel, hold, or refund any order suspected of fraud, abuse, or policy violation.</li>
      </ul>
    ),
  },
  {
    id: "vendor-responsibilities",
    title: "4. Vendor Responsibilities",
    body: (
      <ul>
        <li>Vendors must provide accurate product information, including descriptions, images, pricing, and stock availability.</li>
        <li>Vendors are responsible for the quality, packaging, and timely fulfillment of every order they accept.</li>
        <li>Any fraudulent, misleading, or abusive activity may result in immediate suspension or permanent removal from the Platform.</li>
      </ul>
    ),
  },
  {
    id: "pricing-availability",
    title: "5. Pricing & Availability",
    body: (
      <ul>
        <li>Prices, promotions, and discounts may change at any time without prior notice.</li>
        <li>Product availability is not guaranteed until your order has been confirmed and payment captured.</li>
      </ul>
    ),
  },
  {
    id: "returns-refunds",
    title: "6. Returns & Refunds",
    body: (
      <ul>
        <li>Returns and refunds are governed by Koshur Kart's refund policy and the vendor's published return terms.</li>
        <li>Eligibility, timelines, and resolution are determined according to platform rules and applicable law.</li>
      </ul>
    ),
  },
  {
    id: "prohibited-activities",
    title: "7. Prohibited Activities",
    body: (
      <ul>
        <li>Fraudulent transactions, chargeback abuse, or money laundering.</li>
        <li>Posting fake reviews, manipulating ratings, or coordinating inauthentic behavior.</li>
        <li>Unauthorized access attempts, scraping, reverse engineering, or interference with platform security.</li>
        <li>Any other misuse that harms users, vendors, or the integrity of the marketplace.</li>
      </ul>
    ),
  },
  {
    id: "intellectual-property",
    title: "8. Intellectual Property",
    body: (
      <p>
        All Koshur Kart branding, logos, content, software, and underlying
        technology remain the exclusive property of Koshur Kart and its
        licensors. You may not copy, distribute, or create derivative works
        without prior written permission.
      </p>
    ),
  },
  {
    id: "limitation-of-liability",
    title: "9. Limitation of Liability",
    body: (
      <p>
        To the maximum extent permitted by law, Koshur Kart shall not be liable
        for any indirect, incidental, special, or consequential damages arising
        from your use of, or inability to use, the marketplace, including loss
        of profits, data, or goodwill.
      </p>
    ),
  },
  {
    id: "account-suspension",
    title: "10. Account Suspension",
    body: (
      <p>
        Koshur Kart reserves the right to suspend, restrict, or terminate any
        account that violates these Terms, our policies, or applicable laws,
        with or without prior notice.
      </p>
    ),
  },
  {
    id: "changes-to-terms",
    title: "11. Changes to Terms",
    body: (
      <p>
        We may update these Terms from time to time. Material changes will be
        communicated through the Platform. Continued use after changes
        constitutes acceptance of the revised Terms.
      </p>
    ),
  },
  {
    id: "contact",
    title: "12. Contact Information",
    body: (
      <p>
        Questions about these Terms? Reach our support team at{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent hover:underline font-medium">
          {SUPPORT_EMAIL}
        </a>
        .
      </p>
    ),
  },
];

const TermsAndConditionsPage = () => {
  return (
    <>
      <Helmet>
        <title>Terms & Conditions — Koshur Kart</title>
        <meta
          name="description"
          content="Read the Terms & Conditions for using Koshur Kart — accounts, orders, payments, vendor responsibilities, returns, and more."
        />
        <link rel="canonical" href="/terms-and-conditions" />
      </Helmet>

      <div className="bg-muted/30 border-b border-border">
        <div className="container mx-auto px-4 py-10 md:py-14 max-w-5xl">
          <div className="flex items-center gap-3 text-accent mb-3">
            <ScrollText className="h-5 w-5" />
            <span className="text-xs font-semibold tracking-widest uppercase">Legal</span>
          </div>
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-foreground">
            Terms &amp; Conditions
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
                These Terms &amp; Conditions ("Terms") govern your access to and
                use of Koshur Kart. Please read them carefully before using the
                Platform.
              </p>

              <div className="space-y-10">
                {sections.map((s) => (
                  <section key={s.id} id={s.id} className="scroll-mt-24">
                    <h2 className="font-serif text-xl md:text-2xl font-semibold text-foreground mb-4">
                      {s.title}
                    </h2>
                    <div className="prose prose-sm md:prose-base max-w-none text-muted-foreground leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-2 [&_p]:mb-3 [&_strong]:text-foreground">
                      {s.body}
                    </div>
                  </section>
                ))}
              </div>

              <div className="mt-12 pt-6 border-t border-border text-sm text-muted-foreground">
                By creating an account or placing an order on Koshur Kart, you
                acknowledge that you have read, understood, and agreed to these
                Terms.{" "}
                <Link to="/auth" className="text-accent hover:underline font-medium">
                  Back to sign up
                </Link>
                .
              </div>
            </div>
          </article>
        </div>
      </div>
    </>
  );
};

export default TermsAndConditionsPage;
