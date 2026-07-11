/**
 * KoshurKart — AutoScroll
 * =================================================================
 * A scroll viewport that keeps the newest content in view *only when the user
 * is already near the bottom*. If the user has scrolled up to read history,
 * incoming/streamed content does NOT yank them back down — a "jump to latest"
 * affordance appears instead.
 *
 * How it stays efficient during streaming: rather than re-rendering on every
 * token, it observes the content element's size with a `ResizeObserver` and
 * scrolls imperatively. React only re-renders to toggle the jump button.
 *
 * Presentation/behavior only — it knows nothing about messages or networking.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Distance (px) from the bottom within which we consider the user "at bottom". */
const NEAR_BOTTOM_THRESHOLD = 80;

export interface AutoScrollProps {
  children: ReactNode;
  className?: string;
}

export function AutoScroll({ children, className }: AutoScrollProps): JSX.Element {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // Whether the user is pinned to the bottom. A ref so the ResizeObserver reads
  // the latest value without being re-created.
  const pinnedRef = useRef<boolean>(true);
  const [showJump, setShowJump] = useState<boolean>(false);

  const isNearBottom = useCallback((): boolean => {
    const el = viewportRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_THRESHOLD;
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior): void => {
    const el = viewportRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  // Track the user's scroll position; update the pinned state + jump button.
  const handleScroll = useCallback((): void => {
    const near = isNearBottom();
    pinnedRef.current = near;
    setShowJump((prev) => (prev === !near ? prev : !near));
  }, [isNearBottom]);

  // Follow content growth (new messages / streamed tokens) only when pinned.
  useEffect(() => {
    const content = contentRef.current;
    if (!content || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      if (pinnedRef.current) scrollToBottom("auto");
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [scrollToBottom]);

  // Start pinned to the newest message on mount.
  useEffect(() => {
    scrollToBottom("auto");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={cn("relative min-h-0 flex-1", className)}>
      <div
        ref={viewportRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto overscroll-contain"
      >
        <div ref={contentRef}>{children}</div>
      </div>

      {showJump && (
        <button
          type="button"
          onClick={() => scrollToBottom("smooth")}
          aria-label="Scroll to latest messages"
          className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-background/90 px-3 py-1.5 text-xs font-medium shadow-md backdrop-blur transition-colors hover:bg-accent"
        >
          <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
          Latest
        </button>
      )}
    </div>
  );
}
