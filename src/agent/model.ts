import { createAnthropic } from "@ai-sdk/anthropic";
import { createXai } from "@ai-sdk/xai";
import { claudeCode } from "ai-sdk-provider-claude-code";
import type { LanguageModel } from "ai";

export type LlmProviderId = "anthropic" | "xai" | "claude-code";

const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-5";
const DEFAULT_XAI_MODEL = "grok-3";
const DEFAULT_CLAUDE_CODE_MODEL = "sonnet";

/**
 * Resolves the active chat model from LLM_PROVIDER + LLM_MODEL.
 * - anthropic    → ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN)
 * - xai          → XAI_API_KEY
 * - claude-code  → Claude Pro/Max subscription via the Claude Code CLI (no API key needed)
 */
export function resolveModel(): LanguageModel {
    const raw = (process.env.LLM_PROVIDER ?? "anthropic").toLowerCase();
    const provider = (["xai", "claude-code"].includes(raw) ? raw : "anthropic") as LlmProviderId;
    const modelId = process.env.LLM_MODEL?.trim();

    if (provider === "claude-code") {
        return claudeCode(modelId || DEFAULT_CLAUDE_CODE_MODEL);
    }

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
