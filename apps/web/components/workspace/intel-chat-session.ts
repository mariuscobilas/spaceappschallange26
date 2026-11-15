import type { UIMessage } from "ai";

export interface IntelConversation {
  id: string;
  messages: UIMessage[];
}

const conversations = new Map<string, IntelConversation>();

export function getConversation(key: string): IntelConversation {
  let conversation = conversations.get(key);
  if (!conversation) {
    conversation = { id: crypto.randomUUID(), messages: [] };
    conversations.set(key, conversation);
  }
  return conversation;
}

export function saveConversation(key: string, conversation: IntelConversation) {
  if (conversations.get(key)?.id !== conversation.id) return;
  conversations.set(key, conversation);
}

export function startConversation(key: string): IntelConversation {
  const conversation = { id: crypto.randomUUID(), messages: [] };
  conversations.set(key, conversation);
  return conversation;
}
