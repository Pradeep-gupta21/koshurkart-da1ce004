/**
 * KoshurKart — Markdown
 * =================================================================
 * A thin, presentation-only wrapper around `react-markdown` (+ GFM) that
 * renders assistant/user message text with the app's Tailwind styling.
 *
 * Safety: raw HTML is NOT enabled (no `rehype-raw`), so model output cannot
 * inject markup — links, code, and emphasis are rendered as React elements,
 * never `dangerouslySetInnerHTML`. Links are forced to open safely in a new
 * tab. Purely presentational: no state, no side effects.
 */

import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

const components: Components = {
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="font-medium underline underline-offset-2 hover:opacity-80"
    >
      {children}
    </a>
  ),
  code: ({ className, children, ...props }) => {
    const isBlock = /language-/.test(className ?? "");
    if (isBlock) {
      return (
        <code
          className={cn(
            "block overflow-x-auto rounded-md bg-black/10 p-3 text-xs font-mono leading-relaxed dark:bg-white/10",
            className,
          )}
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <code
        className="rounded bg-black/10 px-1 py-0.5 text-[0.85em] font-mono dark:bg-white/10"
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: ({ children }) => <pre className="my-2 last:mb-0 first:mt-0">{children}</pre>,
  ul: ({ children }) => (
    <ul className="my-2 list-disc space-y-1 pl-5 last:mb-0 first:mt-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 list-decimal space-y-1 pl-5 last:mb-0 first:mt-0">{children}</ol>
  ),
  p: ({ children }) => <p className="my-2 leading-relaxed first:mt-0 last:mb-0">{children}</p>,
  h1: ({ children }) => <h1 className="mb-2 mt-3 text-lg font-semibold first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-2 mt-3 text-base font-semibold first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1 mt-2 text-sm font-semibold first:mt-0">{children}</h3>,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-current/30 pl-3 italic opacity-90">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-current/20 px-2 py-1 text-left font-semibold">{children}</th>
  ),
  td: ({ children }) => <td className="border border-current/20 px-2 py-1">{children}</td>,
};

export interface MarkdownProps {
  /** The raw markdown text to render. */
  content: string;
  /** Optional wrapper class. */
  className?: string;
}

function MarkdownImpl({ content, className }: MarkdownProps): JSX.Element {
  return (
    <div className={cn("text-sm [word-break:break-word]", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

/** Memoized so a bubble only re-parses markdown when its text changes. */
export const Markdown = memo(MarkdownImpl);
