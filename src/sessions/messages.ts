import type { ModelMessage } from "ai";

/** MongoDB previously serialized optional undefined SDK flags as null.
 * Repair only SDK metadata; null in user/tool payloads must remain unchanged.
 */
export function restoreMessages(messages: ModelMessage[]): ModelMessage[] {
    return messages.map((message) => {
        if (!Array.isArray(message.content)) return message;
        return {
            ...message,
            content: message.content.map((part) => {
                if (
                    part.type !== "tool-call" ||
                    (part as { providerExecuted?: unknown }).providerExecuted !== null
                )
                    return part;
                const restored = { ...part };
                delete restored.providerExecuted;
                return restored;
            }),
        } as ModelMessage;
    });
}
