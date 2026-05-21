import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  images: string[];
}

export default function ReviewImageGallery({ images }: Props) {
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);

  if (!images?.length) return null;

  const openAt = (i: number) => {
    setIdx(i);
    setOpen(true);
  };

  const prev = () => setIdx((i) => (i - 1 + images.length) % images.length);
  const next = () => setIdx((i) => (i + 1) % images.length);

  return (
    <>
      <div className="flex flex-wrap gap-2 mt-3">
        {images.map((src, i) => (
          <button
            key={i}
            type="button"
            onClick={() => openAt(i)}
            className="aspect-square w-20 rounded-lg overflow-hidden bg-muted border border-border hover:scale-105 transition-transform focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <img
              src={src}
              alt={`Review ${i + 1}`}
              width={80}
              height={80}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover"
            />
          </button>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl p-0 bg-background">
          <div className="relative">
            <img
              src={images[idx]}
              alt={`Review image ${idx + 1}`}
              className="w-full max-h-[80vh] object-contain bg-muted"
            />
            {images.length > 1 && (
              <>
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={prev}
                  className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full"
                  aria-label="Previous image"
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={next}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full"
                  aria-label="Next image"
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-background/80 px-3 py-1 rounded-full text-xs">
                  {idx + 1} / {images.length}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
