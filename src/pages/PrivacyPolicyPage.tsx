import { useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Shield, Database, UserCog, Store, CreditCard, Cookie, Lock,
  ScrollText, Plug, Baby, Archive, Globe, RefreshCw, Mail,
} from "lucide-react";

const SUPPORT_EMAIL = "support@koshurkart.shop";
const CONTACT_EMAIL = "koshurkartofficial@gmail.com";
const LAST_UPDATED = "June 2, 2026";

type Section = {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  body: React.ReactNode;
};

const sections: Section[] = [
  {
    id: "introduction",
    title: "1. Introduction",
    icon: Shield,
    body: (
      <>
        <p>
          Welcome to <strong>Koshur Kart</strong>, a multi-vendor ecommerce
          marketplace based in India that connects customers with independent
          sellers across the country. We respect your privacy and are committed
          to protecting your personal information.
        </p>
        <p>
          This Privacy Policy explains what we collect, how we use it, and the
          rights available to you. It applies to all visitors, registered
          customers, and vendors who use our website, mobile experience, or any
          related services (collectively, the "Platform"). By using the
          Platform, you consent to the practices described here.
        </p>
        <p>
          We comply with applicable Indian laws including the{" "}
          <strong>Information Technology Act, 2000</strong>, the{" "}
          <strong>SPDI Rules, 2011</strong>, and the{" "}
          <strong>Digital Personal Data Protection Act, 2023 (DPDP Act)</strong>.
        </p>
      </>
    ),
  },
  {
    id: "information-we-collect",
    title: "2. Information We Collect",
    icon: Database,
    body: (
      <>
        <p>We collect the following categories of information:</p>
        <ul>
          <li><strong>Account information:</strong> name, email, phone number, password, and profile preferences.</li>
          <li><strong>Transactional information:</strong> orders, billing and shipping addresses, invoices, and refund history.</li>
          <li><strong>Vendor information:</strong> business name, GSTIN, PAN, bank account details, KYC documents, and payout records (vendors only).</li>
          <li><strong>Browsing &amp; device information:</strong> IP address, browser type, operating system, device identifiers, and pages visited.</li>
          <li><strong>Location information:</strong> approximate location derived from IP or pincode you enter to check serviceability.</li>
          <li><strong>Communications:</strong> support messages, reviews, ratings, and feedback you submit.</li>
        </ul>
      </>
    ),
  },
  {
    id: "how-we-use-information",
    title: "3. How We Use Information",
    icon: UserCog,
    body: (
      <>
        <p>We use the information we collect to:</p>
        <ul>
          <li>Create and manage your account and authenticate you securely.</li>
          <li>Process orders, payments, delivery, returns, and refunds.</li>
          <li>Enable vendors to fulfill orders and communicate with customers.</li>
          <li>Personalize recommendations, search results, and offers.</li>
          <li>Detect, prevent, and address fraud, abuse, and security incidents.</li>
          <li>Send transactional updates and, with your consent, marketing communications.</li>
          <li>Improve the Platform, troubleshoot issues, and run analytics.</li>
          <li>Comply with legal obligations, tax requirements, and lawful requests from authorities.</li>
        </ul>
      </>
    ),
  },
  {
    id: "seller-vendor-information",
    title: "4. Seller / Vendor Information",
    icon: Store,
    body: (
      <>
        <p>
          Vendors who register to sell on Koshur Kart provide additional
          business and verification details required to operate on the
          marketplace. This includes business identity (GSTIN, PAN), bank
          account information for payouts, and KYC documents.
        </p>
        <ul>
          <li>Vendor KYC documents are stored securely and accessed only by authorized administrators for verification, compliance, and dispute resolution.</li>
          <li>Public vendor information (store name, ratings, product listings) may be visible to customers and crawlers.</li>
          <li>Customer contact details shared during fulfillment are limited to what is needed to deliver the order.</li>
        </ul>
      </>
    ),
  },
  {
    id: "payment-information",
    title: "5. Payment Information",
    icon: CreditCard,
    body: (
      <>
        <p>
          Payments on Koshur Kart may be processed through <strong>Razorpay</strong>,
          UPI, and other PCI-DSS compliant payment partners. We do{" "}
          <strong>not</strong> store full card numbers, CVV, UPI PINs, or
          net-banking credentials on our servers.
        </p>
        <ul>
          <li>Payment instrument details are collected and tokenized directly by our payment partners.</li>
          <li>We retain only the metadata required to reconcile orders, issue refunds, and meet audit and tax requirements (transaction ID, amount, status, method).</li>
          <li>Cash on Delivery (where offered) does not involve sharing payment credentials with us.</li>
        </ul>
      </>
    ),
  },
  {
    id: "cookies-tracking",
    title: "6. Cookies & Tracking Technologies",
    icon: Cookie,
    body: (
      <>
        <p>
          We use cookies, local storage, and similar technologies to keep you
          signed in, remember your cart and preferences, measure performance,
          and improve the Platform.
        </p>
        <ul>
          <li><strong>Essential cookies</strong> are required for authentication, cart, checkout, and security.</li>
          <li><strong>Analytics cookies</strong> help us understand how the Platform is used so we can improve it.</li>
          <li>You can manage or disable cookies in your browser settings; some features may not work correctly if you do.</li>
        </ul>
      </>
    ),
  },
  {
    id: "data-security",
    title: "7. Data Security",
    icon: Lock,
    body: (
      <>
        <p>
          We use industry-standard security measures to protect your data,
          including encryption in transit (HTTPS/TLS), encrypted storage,
          row-level database access controls, role-based access for staff,
          rate limiting, and continuous monitoring for suspicious activity.
        </p>
        <p>
          No method of transmission or storage is 100% secure. While we work
          hard to safeguard your information, we cannot guarantee absolute
          security. If you suspect any unauthorized activity on your account,
          please contact us immediately at{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent hover:underline">{SUPPORT_EMAIL}</a>.
        </p>
      </>
    ),
  },
  {
    id: "user-rights",
    title: "8. Your Rights",
    icon: ScrollText,
    body: (
      <>
        <p>Subject to applicable law, you have the right to:</p>
        <ul>
          <li><strong>Access</strong> the personal information we hold about you.</li>
          <li><strong>Correct</strong> inaccurate or incomplete information from your profile or by writing to us.</li>
          <li><strong>Delete</strong> your account and associated personal data, subject to legal retention obligations.</li>
          <li><strong>Withdraw consent</strong> for marketing communications at any time.</li>
          <li><strong>Lodge a grievance</strong> with our Grievance Officer (see Contact Information).</li>
        </ul>
        <p>
          To exercise any of these rights, email us at{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent hover:underline">{SUPPORT_EMAIL}</a>.
          We will respond within the timelines required by Indian law.
        </p>
      </>
    ),
  },
  {
    id: "third-party-services",
    title: "9. Third-Party Services",
    icon: Plug,
    body: (
      <>
        <p>
          We work with trusted third parties to operate the marketplace,
          including payment gateways (e.g., Razorpay), logistics and delivery
          partners, cloud hosting providers, communication services (email,
          SMS, push), and analytics providers.
        </p>
        <p>
          These partners receive only the information necessary to perform
          their function and are contractually required to protect it. We{" "}
          <strong>never sell customer data to third parties</strong>.
        </p>
      </>
    ),
  },
  {
    id: "childrens-privacy",
    title: "10. Children's Privacy",
    icon: Baby,
    body: (
      <p>
        Koshur Kart is intended for users who are <strong>18 years or older</strong>.
        We do not knowingly collect personal information from children under 18.
        If we learn that we have collected information from a minor without
        verifiable parental consent, we will delete it promptly. If you believe
        a minor has provided us with personal information, contact{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent hover:underline">{SUPPORT_EMAIL}</a>.
      </p>
    ),
  },
  {
    id: "data-retention",
    title: "11. Data Retention",
    icon: Archive,
    body: (
      <>
        <p>
          We retain personal information only for as long as needed to provide
          the Platform, fulfill the purposes described in this Policy, and
          satisfy our legal, tax, accounting, and dispute-resolution
          obligations.
        </p>
        <ul>
          <li>Order and invoice records are retained for the duration required by Indian tax and accounting law.</li>
          <li>Account data is retained while your account is active and for a reasonable period thereafter.</li>
          <li>KYC and payout records are retained for the period prescribed by financial regulations.</li>
        </ul>
      </>
    ),
  },
  {
    id: "international-transfers",
    title: "12. International Data Transfers",
    icon: Globe,
    body: (
      <p>
        Koshur Kart primarily operates in and serves customers within India.
        Some of our service providers (cloud hosting, analytics, communications)
        may process data outside India. Where this happens, we take appropriate
        contractual and technical safeguards so your information receives a
        comparable standard of protection.
      </p>
    ),
  },
  {
    id: "changes",
    title: "13. Changes to This Privacy Policy",
    icon: RefreshCw,
    body: (
      <p>
        We may update this Privacy Policy from time to time to reflect changes
        in our practices, technology, legal requirements, or for other
        operational reasons. Material changes will be communicated through the
        Platform or by email. The "Last updated" date at the top of this page
        indicates when the Policy was most recently revised. Continued use of
        the Platform after changes means you accept the updated Policy.
      </p>
    ),
  },
  {
    id: "contact",
    title: "14. Contact Information",
    icon: Mail,
    body: (
      <>
        <p>
          If you have questions, concerns, or grievances about this Privacy
          Policy or our handling of your personal data, please reach out:
        </p>
        <ul>
          <li><strong>Support:</strong> <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent hover:underline">{SUPPORT_EMAIL}</a></li>
          <li><strong>Grievance Officer:</strong> <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent hover:underline">{CONTACT_EMAIL}</a></li>
        </ul>
        <p>
          Koshur Kart operates from and is governed by the laws of <strong>India</strong>.
          Any disputes shall be subject to the exclusive jurisdiction of the
          competent courts in India.
        </p>
      </>
    ),
  },
];

const PrivacyPolicyPage = () => {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = "Privacy Policy — Koshur Kart";

    const ensureMeta = (selector: string, attrs: Record<string, string>) => {
      let el = document.head.querySelector<HTMLMetaElement>(selector);
      const created = !el;
      if (!el) {
        el = document.createElement("meta");
        Object.entries(attrs).forEach(([k, v]) => {
          if (k !== "content") el!.setAttribute(k, v);
        });
        document.head.appendChild(el);
      }
      const prev = el.getAttribute("content");
      el.setAttribute("content", attrs.content);
      return () => {
        if (created) el!.remove();
        else if (prev !== null) el!.setAttribute("content", prev);
      };
    };

    const description =
      "Koshur Kart Privacy Policy — how we collect, use, and protect customer and vendor data on our India-based multi-vendor marketplace.";

    const cleanups = [
      ensureMeta('meta[name="description"]', { name: "description", content: description }),
      ensureMeta('meta[property="og:title"]', { property: "og:title", content: "Privacy Policy — Koshur Kart" }),
      ensureMeta('meta[property="og:description"]', { property: "og:description", content: description }),
      ensureMeta('meta[property="og:url"]', { property: "og:url", content: "/privacy-policy" }),
      ensureMeta('meta[property="og:type"]', { property: "og:type", content: "website" }),
    ];

    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const canonicalCreated = !canonical;
    const prevHref = canonical?.getAttribute("href") ?? null;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", "/privacy-policy");

    const ld = document.createElement("script");
    ld.type = "application/ld+json";
    ld.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Privacy Policy",
      url: "/privacy-policy",
      about: "Koshur Kart privacy practices, data collection, and user rights.",
    });
    document.head.appendChild(ld);

    return () => {
      document.title = prevTitle;
      cleanups.forEach((fn) => fn());
      if (canonicalCreated) canonical!.remove();
      else if (prevHref !== null) canonical!.setAttribute("href", prevHref);
      ld.remove();
    };
  }, []);

  return (
    <>
      <div className="bg-muted/30 border-b border-border">
        <div className="container mx-auto px-4 py-10 md:py-14 max-w-5xl">
          <div className="flex items-center gap-3 text-accent mb-3">
            <Shield className="h-5 w-5" />
            <span className="text-xs font-semibold tracking-widest uppercase">Legal</span>
          </div>
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-foreground">
            Privacy Policy
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Last updated: {LAST_UPDATED}
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-10 md:py-14 max-w-5xl">
        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-10">
          <aside className="hidden lg:block">
            <nav aria-label="On this page" className="sticky top-24 space-y-1 text-sm">
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
                At Koshur Kart, your trust matters. This Privacy Policy
                describes the information we collect, how we use it, who we
                share it with, and the choices you have. Please read it
                alongside our{" "}
                <Link to="/terms-and-conditions" className="text-accent hover:underline">
                  Terms &amp; Conditions
                </Link>.
              </p>

              <details className="lg:hidden mb-8 rounded-lg border border-border bg-muted/30 p-4">
                <summary className="cursor-pointer font-semibold text-foreground text-sm">
                  On this page
                </summary>
                <nav className="mt-3 flex flex-col gap-1.5 text-sm">
                  {sections.map((s) => (
                    <a
                      key={s.id}
                      href={`#${s.id}`}
                      className="text-muted-foreground hover:text-accent transition-colors"
                    >
                      {s.title}
                    </a>
                  ))}
                </nav>
              </details>

              <div className="space-y-10">
                {sections.map((s) => {
                  const Icon = s.icon;
                  return (
                    <section
                      key={s.id}
                      id={s.id}
                      aria-labelledby={`${s.id}-heading`}
                      className="scroll-mt-24"
                    >
                      <h2
                        id={`${s.id}-heading`}
                        className="font-serif text-xl md:text-2xl font-semibold text-foreground mb-4 flex items-center gap-3"
                      >
                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent shrink-0">
                          <Icon className="h-5 w-5" />
                        </span>
                        <span>{s.title}</span>
                      </h2>
                      <div className="prose prose-sm md:prose-base max-w-none text-muted-foreground leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-2 [&_p]:mb-3 [&_strong]:text-foreground">
                        {s.body}
                      </div>
                    </section>
                  );
                })}
              </div>

              <div className="mt-12 pt-6 border-t border-border text-sm text-muted-foreground">
                By using Koshur Kart, you acknowledge that you have read and
                understood this Privacy Policy. For any questions, contact us
                at{" "}
                <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent hover:underline font-medium">
                  {SUPPORT_EMAIL}
                </a>.
              </div>
            </div>
          </article>
        </div>
      </div>
    </>
  );
};

export default PrivacyPolicyPage;
