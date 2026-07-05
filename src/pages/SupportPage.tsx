import { MessageCircle, Mail } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { buildWhatsAppUrl, SUPPORT_EMAIL } from "@/lib/supportConfig";

const FAQS: { q: string; a: string }[] = [
  {
    q: "How do I place an order?",
    a: "Browse products, add items to your cart, and proceed to checkout. You can pay using available payment methods.",
  },
  {
    q: "How can I track my order?",
    a: "Go to your account and open the Orders section to view real-time order status and tracking updates.",
  },
  {
    q: "How do I contact a seller?",
    a: "Visit the product page and use the seller contact option, or reach us via WhatsApp and we will connect you.",
  },
  {
    q: "What payment methods are available?",
    a: "We support UPI, credit and debit cards, net banking, and wallets via our secure payment gateway.",
  },
  {
    q: "What is the return policy?",
    a: "Most products can be returned within 7 days of delivery. Perishable items such as saffron and dry fruits are non-returnable.",
  },
  {
    q: "How do I become a vendor?",
    a: "Click Sell Your Craft on the homepage and complete the vendor registration process.",
  },
  {
    q: "How do I reset my password?",
    a: "On the login page, click Forgot Password and follow the instructions sent to your registered email address.",
  },
];

const SupportPage = () => {
  const waHref = buildWhatsAppUrl("Hi KoshurKart, I need some assistance.");
  const waConfigured = waHref !== "#";

  return (
    <div className="container mx-auto px-4 py-12 md:py-16">
      {/* Hero */}
      <section className="text-center max-w-3xl mx-auto mb-12 md:mb-16">
        <h1 className="text-3xl md:text-5xl lg:text-6xl font-serif font-bold text-foreground leading-tight mb-4">
          How can we help you?
        </h1>
        <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
          Our support team is here to help you with orders, products, and anything else you need.
        </p>
      </section>

      {/* Contact cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto mb-16">
        <Card>
          <CardHeader>
            <div className="h-11 w-11 rounded-lg bg-green-500/10 flex items-center justify-center mb-2">
              <MessageCircle className="h-6 w-6 text-green-500" />
            </div>
            <CardTitle className="text-xl font-serif">Chat on WhatsApp</CardTitle>
            <CardDescription>
              Chat with our support team. We typically reply within minutes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {waConfigured ? (
              <Button asChild className="w-full">
                <a href={waHref} target="_blank" rel="noopener noreferrer">
                  Start Chat
                </a>
              </Button>
            ) : (
              <Button className="w-full" disabled>
                WhatsApp not configured
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="h-11 w-11 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
              <Mail className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-xl font-serif">Email Support</CardTitle>
            <CardDescription>
              Send us an email and we'll respond within 24 hours.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="font-mono text-sm text-foreground bg-muted rounded-md px-3 py-2 break-all">
              {SUPPORT_EMAIL}
            </p>
            <Button asChild variant="outline" className="w-full">
              <a href={`mailto:${SUPPORT_EMAIL}`}>Send Email</a>
            </Button>
          </CardContent>
        </Card>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto">
        <h2 className="text-2xl md:text-4xl font-serif font-bold text-foreground mb-6 text-center">
          Frequently Asked Questions
        </h2>
        <Accordion type="single" collapsible className="w-full">
          {FAQS.map((item, i) => (
            <AccordionItem key={i} value={`faq-${i}`}>
              <AccordionTrigger className="text-left">{item.q}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground leading-relaxed">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </div>
  );
};

export default SupportPage;
