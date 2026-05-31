import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ShieldCheck,
  CreditCard,
  Truck,
  Award,
  RotateCcw,
  HeadphonesIcon,
  Sprout,
  Lightbulb,
  Heart,
  Lock,
  Rocket,
  Mail,
  ShoppingBag,
  Store,
  ArrowRight,
  MapPin,
} from "lucide-react";
import aboutHero from "@/assets/about-hero.jpg";

const LAST_UPDATED = "June 1, 2026";
const SUPPORT_EMAIL = "koshurkartofficial@gmail.com";

/* ── Animated counter hook ── */
function useCountUp(target: number, duration = 2000) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const hasRun = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasRun.current) {
            hasRun.current = true;
            let start: number | null = null;
            const animate = (ts: number) => {
              if (!start) start = ts;
              const progress = Math.min((ts - start) / duration, 1);
              setCount(Math.floor(progress * target));
              if (progress < 1) requestAnimationFrame(animate);
            };
            requestAnimationFrame(animate);
          }
        });
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [target, duration]);

  return { count, ref };
}

/* ── Sections data ── */
const whyChooseItems = [
  { icon: ShieldCheck, label: "Trusted Vendors", desc: "Every seller is verified to ensure authenticity and quality." },
  { icon: CreditCard, label: "Secure Payments", desc: "Encrypted transactions with Razorpay, UPI, and COD options." },
  { icon: Truck, label: "Fast Delivery", desc: "Reliable logistics partners ensuring timely doorstep delivery." },
  { icon: Award, label: "Quality Products", desc: "Curated selection focusing on craftsmanship and genuine goods." },
  { icon: RotateCcw, label: "Easy Returns", desc: "Hassle-free return and refund process within policy terms." },
  { icon: HeadphonesIcon, label: "Customer Support", desc: "Dedicated team ready to assist you at every step." },
];

const customerBenefits = [
  "Wide product selection from local artisans to modern brands",
  "Competitive pricing with transparent cost breakdown",
  "Secure checkout with multiple payment options",
  "Real-time order tracking from dispatch to delivery",
  "Easy returns and refund policy for peace of mind",
];

const vendorBenefits = [
  "Reach more customers across the valley and beyond",
  "Easy product management with intuitive dashboards",
  "Sales analytics and performance insights",
  "Marketing opportunities through native advertising",
  "Business growth tools to scale your operations",
];

const coreValues = [
  { icon: ShieldCheck, label: "Trust", desc: "Building relationships on honesty and reliability." },
  { icon: Lightbulb, label: "Transparency", desc: "Clear policies, pricing, and communication." },
  { icon: Rocket, label: "Innovation", desc: "Embracing technology to improve commerce." },
  { icon: Heart, label: "Customer First", desc: "Every decision starts with the customer experience." },
  { icon: Lock, label: "Security", desc: "Protecting data and transactions at every layer." },
  { icon: Sprout, label: "Growth", desc: "Empowering vendors and enriching communities." },
];

const stats = [
  { label: "Registered Customers", value: 12500, suffix: "+" },
  { label: "Verified Vendors", value: 480, suffix: "+" },
  { label: "Products Listed", value: 8600, suffix: "+" },
  { label: "Orders Delivered", value: 34500, suffix: "+" },
];

function CounterCard({ label, target, suffix }: { label: string; target: number; suffix: string }) {
  const { count, ref } = useCountUp(target);
  return (
    <div ref={ref} className="rounded-xl bg-card border border-border p-6 md:p-8 text-center">
      <div className="text-3xl md:text-4xl font-bold text-accent tabular-nums mb-2">
        {count.toLocaleString()}{suffix}
      </div>
      <div className="text-sm text-muted-foreground font-medium">{label}</div>
    </div>
  );
}

/* ── Page component ── */
export default function AboutUsPage() {
  useEffect(() => {
    document.title = "About Us | Koshur Kart";
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute("content", "Learn about Koshur Kart — a trusted multi-vendor marketplace connecting customers with quality products and empowering local sellers.");
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.setAttribute("href", "/about-us");
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* 1. Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-dusk" />
        <div className="relative container mx-auto px-4 py-20 md:py-28 lg:py-36 flex flex-col lg:flex-row items-center gap-10 lg:gap-16">
          <div className="flex-1 text-center lg:text-left animate-fade-in">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 text-accent text-xs font-semibold tracking-wide uppercase mb-6">
              <MapPin size={14} />
              Kashmir&apos;s Own Marketplace
            </span>
            <h1 className="text-3xl md:text-5xl lg:text-6xl font-serif font-bold text-primary-foreground leading-tight mb-4">
              About <span className="text-accent">Koshur Kart</span>
            </h1>
            <p className="text-base md:text-lg text-primary-foreground/70 max-w-xl mx-auto lg:mx-0 leading-relaxed mb-8">
              Connecting customers with trusted sellers through a modern, reliable, and seamless online marketplace.
            </p>
            <Link
              to="/search"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-accent text-accent-foreground font-semibold hover:bg-accent/90 transition-colors shadow-lg"
            >
              <ShoppingBag size={18} />
              Start Shopping
              <ArrowRight size={16} />
            </Link>
          </div>
          <div className="flex-1 w-full max-w-lg lg:max-w-none animate-scale-in">
            <img
              src={aboutHero}
              alt="Koshur Kart marketplace illustration"
              className="w-full rounded-2xl shadow-2xl"
              width={1344}
              height={672}
            />
          </div>
        </div>
      </section>

      {/* 2. Our Story */}
      <section className="container mx-auto px-4 py-16 md:py-24">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl md:text-4xl font-serif font-bold text-foreground mb-6">Our Story</h2>
          <p className="text-muted-foreground leading-relaxed text-base md:text-lg mb-6">
            Koshur Kart was created with the vision of building a trusted multi-vendor ecommerce platform where
            customers can discover quality products and vendors can grow their businesses. Born from a desire to
            bridge the gap between local artisans, emerging brands, and discerning buyers, we set out to create
            something more than just a marketplace — we wanted to build a community.
          </p>
          <p className="text-muted-foreground leading-relaxed text-base md:text-lg">
            We believe in the power of <strong className="text-foreground">trust</strong>, the value of{" "}
            <strong className="text-foreground">convenience</strong>, and the importance of{" "}
            <strong className="text-foreground">accessibility</strong>. By combining technology-driven commerce
            with a human touch, Koshur Kart brings the best of the valley — and beyond — right to your doorstep.
          </p>
        </div>
      </section>

      {/* 3. Mission */}
      <section className="bg-muted/50">
        <div className="container mx-auto px-4 py-16 md:py-24">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-2xl md:text-4xl font-serif font-bold text-foreground mb-6">Our Mission</h2>
            <blockquote className="relative border-l-4 border-accent pl-6 py-2 text-left md:text-center md:border-l-0 md:pl-0">
              <p className="text-xl md:text-2xl font-serif italic text-foreground leading-relaxed">
                &ldquo;To empower businesses and provide customers with a secure, convenient, and enjoyable shopping experience.&rdquo;
              </p>
            </blockquote>
          </div>
        </div>
      </section>

      {/* 4. Vision */}
      <section className="container mx-auto px-4 py-16 md:py-24">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl md:text-4xl font-serif font-bold text-foreground mb-6">Our Vision</h2>
          <p className="text-xl md:text-2xl font-serif text-foreground leading-relaxed">
            &ldquo;To become a leading ecommerce marketplace that connects communities, supports entrepreneurs,
            and delivers exceptional customer experiences.&rdquo;
          </p>
        </div>
      </section>

      {/* 5. Why Choose Koshur Kart */}
      <section className="bg-muted/50">
        <div className="container mx-auto px-4 py-16 md:py-24">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-4xl font-serif font-bold text-foreground mb-4">Why Choose Koshur Kart</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              A marketplace built on trust, designed for convenience, and committed to quality.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 stagger-children">
            {whyChooseItems.map((item) => (
              <div
                key={item.label}
                className="group rounded-xl bg-card border border-border p-6 hover:shadow-md transition-shadow"
              >
                <div className="h-12 w-12 rounded-lg bg-accent/10 flex items-center justify-center mb-4 group-hover:bg-accent/20 transition-colors">
                  <item.icon size={24} className="text-accent" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">{item.label}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6. For Customers + 7. For Vendors */}
      <section className="container mx-auto px-4 py-16 md:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16">
          {/* Customers */}
          <div className="rounded-2xl bg-card border border-border p-8 md:p-10">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-10 w-10 rounded-lg bg-secondary/10 flex items-center justify-center">
                <ShoppingBag size={20} className="text-secondary" />
              </div>
              <h3 className="text-xl md:text-2xl font-serif font-bold text-foreground">For Customers</h3>
            </div>
            <ul className="space-y-4">
              {customerBenefits.map((b) => (
                <li key={b} className="flex items-start gap-3 text-muted-foreground">
                  <span className="mt-1.5 h-2 w-2 rounded-full bg-accent shrink-0" />
                  <span className="leading-relaxed">{b}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Vendors */}
          <div className="rounded-2xl bg-card border border-border p-8 md:p-10">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-10 w-10 rounded-lg bg-info/10 flex items-center justify-center">
                <Store size={20} className="text-info" />
              </div>
              <h3 className="text-xl md:text-2xl font-serif font-bold text-foreground">For Vendors</h3>
            </div>
            <ul className="space-y-4">
              {vendorBenefits.map((b) => (
                <li key={b} className="flex items-start gap-3 text-muted-foreground">
                  <span className="mt-1.5 h-2 w-2 rounded-full bg-accent shrink-0" />
                  <span className="leading-relaxed">{b}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* 8. Core Values */}
      <section className="bg-muted/50">
        <div className="container mx-auto px-4 py-16 md:py-24">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-4xl font-serif font-bold text-foreground mb-4">Our Core Values</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              The principles that guide everything we do at Koshur Kart.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 stagger-children">
            {coreValues.map((v) => (
              <div
                key={v.label}
                className="rounded-xl bg-card border border-border p-6 text-center hover:shadow-md transition-shadow"
              >
                <div className="h-12 w-12 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
                  <v.icon size={22} className="text-accent" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">{v.label}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 9. Platform Statistics */}
      <section className="container mx-auto px-4 py-16 md:py-24">
        <div className="text-center mb-12">
          <h2 className="text-2xl md:text-4xl font-serif font-bold text-foreground mb-4">Platform at a Glance</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Numbers that reflect the trust our community places in us.
          </p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((s) => (
            <CounterCard key={s.label} label={s.label} target={s.value} suffix={s.suffix} />
          ))}
        </div>
      </section>

      {/* 10. Contact & Support */}
      <section className="bg-muted/50">
        <div className="container mx-auto px-4 py-16 md:py-24">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-2xl md:text-4xl font-serif font-bold text-foreground mb-4">Contact & Support</h2>
            <p className="text-muted-foreground mb-8 leading-relaxed">
              Our team is always here to help and support our customers and vendors. Whether you have a question
              about an order, need assistance with your vendor account, or just want to say hello — we&apos;re listening.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
              >
                <Mail size={18} />
                {SUPPORT_EMAIL}
              </a>
              <Link
                to="/search"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-border bg-card text-foreground font-semibold hover:bg-muted transition-colors"
              >
                <HeadphonesIcon size={18} />
                Contact Us
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 11. Final CTA */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-dusk" />
        <div className="relative container mx-auto px-4 py-16 md:py-24 text-center">
          <h2 className="text-3xl md:text-5xl font-serif font-bold text-primary-foreground mb-4">
            Join the Koshur Kart Community
          </h2>
          <p className="text-primary-foreground/70 max-w-xl mx-auto mb-8 leading-relaxed">
            Whether you&apos;re here to shop or to sell, you&apos;re part of something bigger. Discover amazing
            products or grow your business with us today.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/search"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-accent text-accent-foreground font-semibold hover:bg-accent/90 transition-colors shadow-lg"
            >
              <ShoppingBag size={18} />
              Start Shopping
            </Link>
            <Link
              to="/vendor/apply"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-primary-foreground/20 bg-primary-foreground/5 text-primary-foreground font-semibold hover:bg-primary-foreground/10 transition-colors"
            >
              <Store size={18} />
              Become a Vendor
            </Link>
          </div>
        </div>
      </section>

      {/* Last Updated */}
      <section className="container mx-auto px-4 py-8 text-center">
        <p className="text-sm text-muted-foreground">
          Last Updated: <time dateTime="2026-06-01">{LAST_UPDATED}</time>
        </p>
      </section>
    </div>
  );
}
