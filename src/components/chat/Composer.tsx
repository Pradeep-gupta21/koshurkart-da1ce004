/**
 * KoshurKart — Composer
 * =================================================================
 * The message input. It reads only what it needs from `useChat()` — the
 * `send`/`cancel` actions and the `loading`/`streaming` flags — and owns just
 * its own draft text locally. No networking, no message state.
 *
 * Interaction contract:
 *  - Enter sends; Shift+Enter inserts a newline (and IME composition is
 *    respected so Enter doesn't fire mid-composition).
 *  - The send control is disabled while a turn is in flight or the draft is
 *    empty.
 *  - While a turn is in flight the send button becomes a Stop button wired to
 *    `cancel()`.
 */

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Send, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useChat } from "./ChatProvider";

const MAX_TEXTAREA_HEIGHT = 200;

export interface ComposerProps {
  className?: string;
  placeholder?: string;
}

export function Composer({
  className,
  placeholder = "Type a message…",
}: ComposerProps): JSX.Element {
  const { send, cancel, loading, streaming } = useChat();
  const [value, setValue] = useState<string>("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow the textarea up to a cap.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, [value]);

  const canSend = value.trim().length > 0 && !loading;

  const submit = useCallback((): void => {
    if (!canSend) return;
    void send(value);
    setValue("");
  }, [canSend, send, value]);

  const handleSubmit = useCallback(
    (e: FormEvent): void => {
      e.preventDefault();
      submit();
    },
    [submit],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>): void => {
      // Enter sends; Shift+Enter is a newline. Ignore Enter during IME compose.
      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        submit();
      }
    },
    [submit],
  );

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "flex items-end gap-2 border-t border-border bg-background p-3",
        className,
      )}
    >
      <label htmlFor="chat-composer-input" className="sr-only">
        Message
      </label>
      <textarea
        id="chat-composer-input"
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={1}
        aria-label="Message"
        className={cn(
          "flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm",
          "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "max-h-[200px] overflow-y-auto",
        )}
      />

      {loading || streaming ? (
        <Button
          type="button"
          variant="secondary"
          size="icon"
          onClick={cancel}
          aria-label="Stop generating"
          title="Stop generating"
        >
          <Square className="h-4 w-4" aria-hidden="true" />
        </Button>
      ) : (
        <Button
          type="submit"
          size="icon"
          disabled={!canSend}
          aria-label="Send message"
          title="Send message"
        >
          <Send className="h-4 w-4" aria-hidden="true" />
        </Button>
      )}
    </form>
  );
}
