import { createContext, useContext } from "react";
import type { ChatScope, ChatTurn, Conversation } from "../types/chat";

export interface ChatApi {
  /** Conversations stored in this browser, most recently used first. */
  conversations: Conversation[];
  /** Document the next question is limited to; null means all indexed documents. */
  scope: ChatScope | null;
  setScope: (scope: ChatScope | null) => void;
  /** Send a question. Creates a conversation when `conversationId` is null. Returns its id. */
  ask: (conversationId: string | null, question: string, scope: ChatScope | null) => string;
  /** Send the same question again with the scope it was originally asked with. */
  retry: (conversationId: string, turn: ChatTurn) => void;
  /** Stop waiting for a pending answer. The backend may still finish generating it. */
  stop: (turnId: string) => void;
  removeConversation: (conversationId: string) => void;
  clearConversations: () => void;
}

export const ChatContext = createContext<ChatApi | null>(null);

export function useChat(): ChatApi {
  const value = useContext(ChatContext);
  if (!value) throw new Error("useChat must be used inside ChatProvider");
  return value;
}
