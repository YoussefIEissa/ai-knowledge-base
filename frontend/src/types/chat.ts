import type { Source } from "./api";

/** One document the user chose to limit a question to. */
export interface ChatScope {
  /** Vector-index document id sent to /ask as `document_id`. */
  documentId: string;
  /** Document title shown in the UI. */
  label: string;
}

export type TurnStatus = "pending" | "done" | "error" | "stopped";

/** One question and what came back for it. */
export interface ChatTurn {
  id: string;
  question: string;
  /** null means the question was asked across all indexed documents. */
  scope: ChatScope | null;
  status: TurnStatus;
  askedAt: number;
  answer?: string;
  sources?: Source[];
  error?: string;
}

/** A conversation kept in this browser's localStorage. */
export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  turns: ChatTurn[];
}
