import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type ChatApi, ChatContext } from "../../hooks/chatContext";
import { ApiError, describeError, isAbortError } from "../../services/api";
import { askQuestion } from "../../services/ask";
import {
  createId,
  loadConversations,
  MAX_CONVERSATIONS,
  saveConversations,
} from "../../services/localStore";
import type { AskRequest } from "../../types/api";
import type { ChatScope, ChatTurn, Conversation } from "../../types/chat";

function titleFrom(question: string): string {
  const singleLine = question.replace(/\s+/g, " ").trim();
  return singleLine.length > 60 ? `${singleLine.slice(0, 57)}…` : singleLine;
}

/** Add what the user can do about an /ask failure, based on the backend's status codes. */
function describeAskError(error: unknown): string {
  const message = describeError(error);
  if (!(error instanceof ApiError)) return message;
  if (error.status === 502) {
    return `${message} The backend failed while retrieving passages or calling the language model. Check that LM Studio is running with the model loaded.`;
  }
  return message;
}

/**
 * Owns chat state for the whole app so a pending answer survives moving
 * between pages. Conversations are saved to localStorage only; the backend
 * keeps no chat history.
 */
export function ChatProvider({ children }: { children: ReactNode }) {
  const [conversations, setConversations] = useState<Conversation[]>(loadConversations);
  const [scope, setScope] = useState<ChatScope | null>(null);
  const controllers = useRef(new Map<string, AbortController>());

  useEffect(() => {
    saveConversations(conversations);
  }, [conversations]);

  useEffect(() => {
    const active = controllers.current;
    return () => {
      active.forEach((controller) => controller.abort());
      active.clear();
    };
  }, []);

  const patchTurn = useCallback(
    (conversationId: string, turnId: string, patch: Partial<ChatTurn>) => {
      const now = Date.now();
      setConversations((list) =>
        list.map((conversation) =>
          conversation.id !== conversationId
            ? conversation
            : {
                ...conversation,
                updatedAt: now,
                turns: conversation.turns.map((turn) =>
                  turn.id === turnId ? { ...turn, ...patch } : turn,
                ),
              },
        ),
      );
    },
    [],
  );

  const send = useCallback(
    (conversationId: string, turn: ChatTurn) => {
      const controller = new AbortController();
      controllers.current.set(turn.id, controller);

      const payload: AskRequest = turn.scope
        ? { question: turn.question, document_id: turn.scope.documentId }
        : { question: turn.question };

      askQuestion(payload, controller.signal)
        .then(
          (response) =>
            patchTurn(conversationId, turn.id, {
              status: "done",
              answer: response.answer,
              sources: response.sources,
            }),
          (error: unknown) =>
            patchTurn(
              conversationId,
              turn.id,
              isAbortError(error)
                ? { status: "stopped" }
                : { status: "error", error: describeAskError(error) },
            ),
        )
        .finally(() => {
          if (controllers.current.get(turn.id) === controller) {
            controllers.current.delete(turn.id);
          }
        });
    },
    [patchTurn],
  );

  const ask = useCallback<ChatApi["ask"]>(
    (conversationId, question, turnScope) => {
      const now = Date.now();
      const id = conversationId ?? createId();
      const turn: ChatTurn = {
        id: createId(),
        question,
        scope: turnScope,
        status: "pending",
        askedAt: now,
      };

      setConversations((list) => {
        if (list.some((conversation) => conversation.id === id)) {
          return list.map((conversation) =>
            conversation.id === id
              ? { ...conversation, updatedAt: now, turns: [...conversation.turns, turn] }
              : conversation,
          );
        }
        const created: Conversation = {
          id,
          title: titleFrom(question),
          createdAt: now,
          updatedAt: now,
          turns: [turn],
        };
        return [created, ...list].slice(0, MAX_CONVERSATIONS);
      });

      send(id, turn);
      return id;
    },
    [send],
  );

  const retry = useCallback<ChatApi["retry"]>(
    (conversationId, turn) => {
      const next: ChatTurn = {
        id: turn.id,
        question: turn.question,
        scope: turn.scope,
        status: "pending",
        askedAt: Date.now(),
      };
      setConversations((list) =>
        list.map((conversation) =>
          conversation.id !== conversationId
            ? conversation
            : {
                ...conversation,
                updatedAt: next.askedAt,
                turns: conversation.turns.map((item) => (item.id === turn.id ? next : item)),
              },
        ),
      );
      send(conversationId, next);
    },
    [send],
  );

  const stop = useCallback<ChatApi["stop"]>((turnId) => {
    controllers.current.get(turnId)?.abort();
  }, []);

  const removeConversation = useCallback<ChatApi["removeConversation"]>(
    (conversationId) => {
      const target = conversations.find((conversation) => conversation.id === conversationId);
      for (const turn of target?.turns ?? []) controllers.current.get(turn.id)?.abort();
      setConversations((list) => list.filter((conversation) => conversation.id !== conversationId));
    },
    [conversations],
  );

  const clearConversations = useCallback<ChatApi["clearConversations"]>(() => {
    controllers.current.forEach((controller) => controller.abort());
    setConversations([]);
  }, []);

  const sorted = useMemo(
    () => [...conversations].sort((a, b) => b.updatedAt - a.updatedAt),
    [conversations],
  );

  const value = useMemo<ChatApi>(
    () => ({
      conversations: sorted,
      scope,
      setScope,
      ask,
      retry,
      stop,
      removeConversation,
      clearConversations,
    }),
    [sorted, scope, ask, retry, stop, removeConversation, clearConversations],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
