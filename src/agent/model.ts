import { createAnthropic } from "@ai-sdk/anthropic";
import { createXai } from "@ai-sdk/xai";
import type { LanguageModel } from "ai";

export type LlmProviderId = "anthropic" | "xai";

const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-5";
const DEFAULT_XAI_MODEL = "grok-3";

/**
 * Resolves the active chat model from LLM_PROVIDER + LLM_MODEL.
 * - anthropic → ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN)
 * - xai → XAI_API_KEY
 */
export function resolveModel(): LanguageModel {
    const raw = (process.env.LLM_PROVIDER ?? "anthropic").toLowerCase();
    const provider = (raw === "xai" ? "xai" : "anthropic") as LlmProviderId;
    const modelId = process.env.LLM_MODEL?.trim();

    if (provider === "xai") {
        const apiKey = process.env.XAI_API_KEY?.trim();
        if (!apiKey) {
            throw new Error("XAI_API_KEY is required when LLM_PROVIDER=xai");
        }
        return createXai({ apiKey })(modelId || DEFAULT_XAI_MODEL);
    }

    const apiKey =
        process.env.ANTHROPIC_API_KEY?.trim() ||
        process.env.ANTHROPIC_AUTH_TOKEN?.trim() ||
        process.env.CLAUDE_CODE_OAUTH_TOKEN?.trim();
    if (!apiKey) {
        throw new Error(
            "ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN) is required when LLM_PROVIDER=anthropic"
        );
    }
    return createAnthropic({ apiKey })(modelId || DEFAULT_ANTHROPIC_MODEL);
}
