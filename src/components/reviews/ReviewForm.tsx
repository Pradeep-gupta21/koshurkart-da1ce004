import { useState } from 'react';
import { Star, X, Upload, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { reviewService } from '@/services/reviewService';
import { reviewSchema } from '@/lib/validators/reviewSchema';
import { cn } from '@/lib/utils';

interface Props {
  productId: string;
  orderId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

const MAX_IMAGES = 6;
const MAX_CHARS = 2000;

export default function ReviewForm({ productId, orderId, onSuccess, onCancel }: Props) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const next = [...images];
    const nextPreviews = [...previews];
    for (const file of Array.from(files)) {
      if (next.length >= MAX_IMAGES) break;
      if (!file.type.startsWith('image/')) {
        toast.error(`${file.name} is not an image`);
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name} exceeds 10MB`);
        continue;
      }
      next.push(file);
      nextPreviews.push(URL.createObjectURL(file));
    }
    setImages(next);
    setPreviews(nextPreviews);
  };

  const removeImage = (i: number) => {
    URL.revokeObjectURL(previews[i]);
    setImages(images.filter((_, idx) => idx !== i));
    setPreviews(previews.filter((_, idx) => idx !== i));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = reviewSchema.safeParse({
      productId,
      orderId,
      rating,
      comment,
      images: [],
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message || 'Invalid review');
      return;
    }

    setSubmitting(true);
    try {
      await reviewService.submitReview({
        productId,
        orderId,
        rating,
        comment: comment.trim(),
        imageFiles: images,
      });
      toast.success('Review submitted!');
      onSuccess();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to submit review');
    } finally {
      setSubmitting(false);
    }
  };

  const displayRating = hoverRating || rating;

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <Label className="mb-2 block">Your Rating</Label>
        <div className="flex gap-1" onMouseLeave={() => setHoverRating(0)}>
          {[1, 2, 3, 4, 5].map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => setRating(i)}
              onMouseEnter={() => setHoverRating(i)}
              className="focus:outline-none focus:ring-2 focus:ring-ring rounded p-1 transition-transform hover:scale-110"
              aria-label={`${i} star${i > 1 ? 's' : ''}`}
            >
              <Star
                className={cn(
                  'h-8 w-8 transition-colors',
                  i <= displayRating ? 'fill-accent text-accent' : 'text-muted'
                )}
              />
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label htmlFor="comment" className="mb-2 block">
          Your Review
        </Label>
        <Textarea
          id="comment"
          value={comment}
          onChange={(e) => setComment(e.target.value.slice(0, MAX_CHARS))}
          placeholder="Share what you liked, what could be better, and how the product worked for you…"
          rows={5}
          className="resize-none"
        />
        <div className="text-xs text-muted-foreground mt-1 text-right">
          {comment.length} / {MAX_CHARS}
        </div>
      </div>

      <div>
        <Label className="mb-2 block">Photos (optional)</Label>
        <div className="flex flex-wrap gap-2">
          {previews.map((src, i) => (
            <div
              key={i}
              className="relative aspect-square w-20 rounded-lg overflow-hidden border border-border bg-muted group"
            >
              <img src={src} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removeImage(i)}
                className="absolute top-1 right-1 bg-background/90 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Remove image"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {images.length < MAX_IMAGES && (
            <label className="aspect-square w-20 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors text-muted-foreground">
              <Upload className="h-5 w-5" />
              <span className="text-[10px] mt-1">Upload</span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
            </label>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Up to {MAX_IMAGES} photos. Images are compressed automatically.
        </p>
      </div>

      <div className="flex gap-2 justify-end pt-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting || rating === 0}>
          {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Submit Review
        </Button>
      </div>
    </form>
  );
}
