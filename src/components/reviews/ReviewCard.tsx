import { Star, ShieldCheck, ThumbsUp, Award } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import ReviewImageGallery from './ReviewImageGallery';
import type { ReviewRow } from '@/services/reviewService';
import { cn } from '@/lib/utils';

interface Props {
  review: ReviewRow;
  hasVoted: boolean;
  onToggleHelpful: (reviewId: string) => void;
  voting?: boolean;
}

export default function ReviewCard({ review, hasVoted, onToggleHelpful, voting }: Props) {
  const name = review.profiles?.name || 'Anonymous';
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const isTopReview = review.helpful_count >= 5;

  return (
    <article className="bg-card rounded-xl border border-border p-5 marketplace-shadow hover:shadow-md transition-shadow animate-fade-in">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar className="h-10 w-10 shrink-0">
            <AvatarImage src={review.profiles?.avatar ?? undefined} alt={name} />
            <AvatarFallback>{initials || '?'}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm truncate">{name}</span>
              {review.is_verified_purchase && (
                <Badge variant="secondary" className="gap-1 text-[10px] font-medium">
                  <ShieldCheck className="h-3 w-3" />
                  Verified Purchase
                </Badge>
              )}
              {isTopReview && (
                <Badge className="gap-1 text-[10px] bg-accent text-accent-foreground hover:bg-accent">
                  <Award className="h-3 w-3" />
                  Top Review
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star
                    key={i}
                    className={cn(
                      'h-3.5 w-3.5',
                      i <= review.rating ? 'fill-accent text-accent' : 'text-muted'
                    )}
                  />
                ))}
              </div>
              <span className="text-xs text-muted-foreground">
                {new Date(review.created_at).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            </div>
          </div>
        </div>
      </header>

      {review.comment && (
        <p className="text-sm text-foreground/90 mt-3 leading-relaxed whitespace-pre-wrap break-words">
          {review.comment}
        </p>
      )}

      {review.images?.length > 0 && <ReviewImageGallery images={review.images} />}

      <footer className="mt-4 flex items-center justify-between">
        <Button
          type="button"
          variant={hasVoted ? 'default' : 'outline'}
          size="sm"
          disabled={voting}
          onClick={() => onToggleHelpful(review.id)}
          className="gap-2 h-8"
        >
          <ThumbsUp className={cn('h-3.5 w-3.5', hasVoted && 'fill-current')} />
          Helpful{review.helpful_count > 0 ? ` (${review.helpful_count})` : ''}
        </Button>
      </footer>
    </article>
  );
}
