// Browser-only storage. Nothing in this file is sent to or read from the
// backend: chats and remembered chunk counts live in localStorage.

import type { ChatScope, ChatTurn, Conversation } from "../types/chat";
import { isRecord } from "./api";
import { toSource } from "./ask";

const CONVERSATIONS_KEY = "knowledge-ai:conversations:v1";
const CHUNK_COUNTS_KEY = "knowledge-ai:chunk-counts:v1";

export const MAX_CONVERSATIONS = 30;

function read(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be full or disabled. The app keeps working in memory.
  }
}

function toScope(value: unknown): ChatScope | null {
  if (!isRecord(value) || typeof value.documentId !== "string") return null;
  return {
    documentId: value.documentId,
    label: typeof value.label === "string" ? value.label : value.documentId,
  };
}

function toTurn(value: unknown): ChatTurn | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.question !== "string") {
    return null;
  }
  const turn: ChatTurn = {
    id: value.id,
    question: value.question,
    scope: toScope(value.scope),
    status: "error",
    askedAt: typeof value.askedAt === "number" ? value.askedAt : 0,
  };

  if (value.status === "done" && typeof value.answer === "string") {
    turn.status = "done";
    turn.answer = value.answer;
    turn.sources = Array.isArray(value.sources) ? value.sources.map(toSource) : [];
  } else if (value.status === "stopped") {
    turn.status = "stopped";
  } else if (value.status === "pending") {
    // A request cannot survive a page reload.
    turn.error = "This question was interrupted when the page was closed or reloaded.";
  } else {
    turn.error = typeof value.error === "string" ? value.error : "This question failed.";
  }
  return turn;
}

export function loadConversations(): Conversation[] {
  const stored = read(CONVERSATIONS_KEY);
  if (!Array.isArray(stored)) return [];

  const conversations: Conversation[] = [];
  for (const item of stored) {
    if (!isRecord(item) || typeof item.id !== "string" || !Array.isArray(item.turns)) continue;
    const turns = item.turns.map(toTurn).filter((turn): turn is ChatTurn => turn !== null);
    if (turns.length === 0) continue;
    conversations.push({
      id: item.id,
      title: typeof item.title === "string" ? item.title : "Untitled chat",
      createdAt: typeof item.createdAt === "number" ? item.createdAt : 0,
      updatedAt: typeof item.updatedAt === "number" ? item.updatedAt : 0,
      turns,
    });
  }
  return conversations;
}

export function saveConversations(conversations: Conversation[]): void {
  write(CONVERSATIONS_KEY, conversations);
}

/**
 * Chunk counts are only reported once, in the upload response. They are
 * remembered here per stored filename so the library can show them later,
 * in this browser only.
 */
export function loadChunkCounts(): Record<string, number> {
  const stored = read(CHUNK_COUNTS_KEY);
  if (!isRecord(stored)) return {};
  const counts: Record<string, number> = {};
  for (const [key, value] of Object.entries(stored)) {
    if (typeof value === "number") counts[key] = value;
  }
  return counts;
}

export function saveChunkCounts(counts: Record<string, number>): void {
  write(CHUNK_COUNTS_KEY, counts);
}

export function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
