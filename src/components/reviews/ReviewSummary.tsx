import { Star } from 'lucide-react';
import type { ReviewSummary as Summary } from '@/services/reviewService';

interface Props {
  summary: Summary;
}

export default function ReviewSummary({ summary }: Props) {
  const { average, total, distribution } = summary;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-6 md:gap-10 items-center md:items-start">
      <div className="text-center md:text-left">
        <div className="text-5xl font-bold tracking-tight">{average.toFixed(1)}</div>
        <div className="flex justify-center md:justify-start mt-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Star
              key={i}
              className={`h-5 w-5 ${
                i <= Math.round(average) ? 'fill-accent text-accent' : 'text-muted'
              }`}
            />
          ))}
        </div>
        <div className="text-sm text-muted-foreground mt-1">
          {total} {total === 1 ? 'review' : 'reviews'}
        </div>
      </div>

      <div className="space-y-1.5 w-full max-w-md">
        {[5, 4, 3, 2, 1].map((star) => {
          const count = distribution[star as 1 | 2 | 3 | 4 | 5];
          const pct = total ? (count / total) * 100 : 0;
          return (
            <div key={star} className="flex items-center gap-3 text-sm">
              <span className="w-8 text-muted-foreground tabular-nums">{star}★</span>
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-10 text-right text-muted-foreground tabular-nums text-xs">
                {count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
