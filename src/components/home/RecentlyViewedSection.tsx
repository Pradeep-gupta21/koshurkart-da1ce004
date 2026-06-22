import { useRecentlyViewed } from '@/hooks/useRecentlyViewed';
import ProductCard from '@/components/product/ProductCard';
import { History } from 'lucide-react';

interface Props {
  title?: string;
  subtitle?: string;
  className?: string;
}

/**
 * Mobile-first horizontal carousel of the viewer's recently-viewed products.
 * Renders nothing while loading or when there are no recently-viewed items.
 * Reuses the existing ProductCard component.
 */
export default function RecentlyViewedSection({
  title = 'Recently Viewed',
  subtitle = 'Pick up where you left off',
  className,
}: Props) {
  const { products, isLoading } = useRecentlyViewed(10);

  // Hide while loading or empty — keeps homepage clean and avoids layout shift.
  if (isLoading) {
    return (
      <section className={`container mx-auto px-4 mt-14 ${className ?? ''}`}>
        <div className="mb-6 h-6 w-48 bg-muted rounded animate-pulse" />
        <div className="flex gap-4 overflow-hidden">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="shrink-0 w-[160px] sm:w-[200px] aspect-[3/4] bg-muted rounded-xl animate-pulse"
            />
          ))}
        </div>
      </section>
    );
  }

  if (!products.length) return null;

  return (
    <section className={`container mx-auto px-4 mt-14 ${className ?? ''}`}>
      <div className="flex items-center gap-2 mb-6">
        <History className="h-5 w-5 text-primary" />
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
      </div>

      {/* Native horizontal scroller with snap. No carousel library. */}
      <div
        className="
          -mx-4 px-4
          flex gap-4 overflow-x-auto scroll-smooth snap-x snap-mandatory
          [scrollbar-width:none] [&::-webkit-scrollbar]:hidden
          pb-2
        "
        role="region"
        aria-label={title}
      >
        {products.map((product) => (
          <div
            key={product.id}
            className="snap-start shrink-0 w-[160px] sm:w-[200px] md:w-[220px]"
          >
            <ProductCard product={product} />
          </div>
        ))}
      </div>
    </section>
  );
}
