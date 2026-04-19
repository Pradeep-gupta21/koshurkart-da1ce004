import { useState, useMemo } from 'react';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, PenLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/ui/EmptyState';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { reviewService, type ReviewSort } from '@/services/reviewService';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import ReviewSummary from './ReviewSummary';
import ReviewCard from './ReviewCard';
import ReviewForm from './ReviewForm';
import { Link } from 'react-router-dom';

interface Props {
  productId: string;
}

const PAGE_SIZE = 10;

export default function ReviewSection({ productId }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [sort, setSort] = useState<ReviewSort>('top');
  const [withImagesOnly, setWithImagesOnly] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const summaryQ = useQuery({
    queryKey: ['review-summary', productId],
    queryFn: () => reviewService.getReviewSummary(productId),
  });

  const eligibilityQ = useQuery({
    queryKey: ['review-eligibility', productId, user?.id],
    queryFn: async () => {
      if (!user) return { canReview: false, hasReviewed: false, orderId: null as string | null };
      const [orderId, hasReviewed] = await Promise.all([
        reviewService.canReview(productId),
        reviewService.hasReviewed(productId),
      ]);
      return { canReview: !!orderId && !hasReviewed, hasReviewed, orderId };
    },
  });

  const tab: ReviewSort | 'images' = withImagesOnly ? 'images' : sort;

  const reviewsQ = useInfiniteQuery({
    queryKey: ['reviews', productId, sort, withImagesOnly],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      reviewService.getReviews(productId, {
        sort,
        withImagesOnly,
        limit: PAGE_SIZE,
        offset: pageParam as number,
      }),
    getNextPageParam: (last, pages) =>
      last.length === PAGE_SIZE ? pages.length * PAGE_SIZE : undefined,
  });

  const allReviews = useMemo(
    () => reviewsQ.data?.pages.flat() ?? [],
    [reviewsQ.data]
  );

  const myVotesQ = useQuery({
    queryKey: ['my-helpful-votes', productId, user?.id, allReviews.map((r) => r.id).join(',')],
    queryFn: () => reviewService.getMyHelpfulVotes(allReviews.map((r) => r.id)),
    enabled: !!user && allReviews.length > 0,
  });

  const helpfulMut = useMutation({
    mutationFn: (reviewId: string) => reviewService.toggleHelpful(reviewId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reviews', productId] });
      qc.invalidateQueries({ queryKey: ['my-helpful-votes', productId] });
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to vote'),
  });

  const onReviewSubmitted = () => {
    setFormOpen(false);
    qc.invalidateQueries({ queryKey: ['reviews', productId] });
    qc.invalidateQueries({ queryKey: ['review-summary', productId] });
    qc.invalidateQueries({ queryKey: ['review-eligibility', productId] });
  };

  const renderCTA = () => {
    if (!user) {
      return (
        <Button asChild variant="outline">
          <Link to="/auth">Sign in to review</Link>
        </Button>
      );
    }
    if (eligibilityQ.isLoading) {
      return <Skeleton className="h-10 w-36" />;
    }
    if (eligibilityQ.data?.hasReviewed) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0}>
                <Button variant="outline" disabled className="gap-2">
                  <PenLine className="h-4 w-4" /> Review Submitted
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>You've already reviewed this product.</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    if (!eligibilityQ.data?.canReview) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0}>
                <Button variant="outline" disabled className="gap-2">
                  <PenLine className="h-4 w-4" /> Write a Review
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Only customers who received this product can review.</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    return (
      <Button onClick={() => setFormOpen(true)} className="gap-2">
        <PenLine className="h-4 w-4" /> Write a Review
      </Button>
    );
  };

  return (
    <section className="mt-14">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6 mb-8">
        <div>
          <h2 className="text-2xl font-semibold mb-6">Customer Reviews</h2>
          {summaryQ.isLoading ? (
            <Skeleton className="h-24 w-72" />
          ) : (
            <ReviewSummary summary={summaryQ.data ?? { average: 0, total: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } }} />
          )}
        </div>
        <div className="md:pt-12">{renderCTA()}</div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => {
          if (v === 'images') {
            setWithImagesOnly(true);
          } else {
            setWithImagesOnly(false);
            setSort(v as ReviewSort);
          }
        }}
        className="mb-6"
      >
        <TabsList>
          <TabsTrigger value="top">Top Reviews</TabsTrigger>
          <TabsTrigger value="latest">Latest</TabsTrigger>
          <TabsTrigger value="images">With Photos</TabsTrigger>
        </TabsList>
      </Tabs>

      {reviewsQ.isLoading ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ) : allReviews.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No reviews yet"
          description={
            withImagesOnly
              ? 'No reviews with photos yet.'
              : 'Be the first to share your experience.'
          }
          className="py-12"
        />
      ) : (
        <div className="space-y-4">
          {allReviews.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              hasVoted={myVotesQ.data?.has(review.id) ?? false}
              voting={helpfulMut.isPending}
              onToggleHelpful={(id) => {
                if (!user) {
                  toast.error('Sign in to mark reviews helpful');
                  return;
                }
                helpfulMut.mutate(id);
              }}
            />
          ))}
          {reviewsQ.hasNextPage && (
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                onClick={() => reviewsQ.fetchNextPage()}
                disabled={reviewsQ.isFetchingNextPage}
              >
                {reviewsQ.isFetchingNextPage ? 'Loading…' : 'Load more reviews'}
              </Button>
            </div>
          )}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Write a Review</DialogTitle>
          </DialogHeader>
          {eligibilityQ.data?.orderId && (
            <ReviewForm
              productId={productId}
              orderId={eligibilityQ.data.orderId}
              onSuccess={onReviewSubmitted}
              onCancel={() => setFormOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
