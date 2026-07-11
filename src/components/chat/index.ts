/**
 * KoshurKart — Chat UI barrel
 * =================================================================
 * The public surface of the chat component library. A host mounts a surface
 * with just:
 *
 *   import { ChatProvider, ChatWindow } from "@/components/chat";
 *
 *   <ChatProvider audience="customer" title="Help">
 *     <ChatWindow />
 *   </ChatProvider>
 *
 * The individual pieces are exported too, so a host can compose a bespoke
 * layout (e.g. a docked panel, a full-page view) from the same primitives.
 * All state lives in `ChatProvider`; every other component is presentational
 * and reads it through `useChat()`.
 */

export { ChatProvider, useChat } from "./ChatProvider";
export type { ChatProviderProps, ChatContextValue } from "./ChatProvider";

export { ChatWindow } from "./ChatWindow";
export type { ChatWindowProps } from "./ChatWindow";

export { ConversationHeader } from "./ConversationHeader";
export type { ConversationHeaderProps } from "./ConversationHeader";

export { MessageList } from "./MessageList";
export type { MessageListProps } from "./MessageList";

export { MessageBubble } from "./MessageBubble";
export type { MessageBubbleProps } from "./MessageBubble";

export { Composer } from "./Composer";
export type { ComposerProps } from "./Composer";

export { ErrorBanner } from "./ErrorBanner";
export type { ErrorBannerProps } from "./ErrorBanner";

export { AutoScroll } from "./AutoScroll";
export type { AutoScrollProps } from "./AutoScroll";

export { StreamingCursor } from "./StreamingCursor";
export { TypingIndicator } from "./TypingIndicator";
export { Markdown } from "./Markdown";
export type { MarkdownProps } from "./Markdown";
