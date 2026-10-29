/** Store only the error summary, never SDK request bodies, headers, or tool arguments. */
export function sessionErrorSummary(error: unknown): string {
    let message =
        error instanceof Error ? `${error.name}: ${error.message}` : "Unknown execution error";
    for (const [key, value] of Object.entries(process.env)) {
        if (value && value.length >= 4 && /KEY|TOKEN|SECRET|PASSWORD|URI|CREDENTIAL/i.test(key)) {
            message = message.split(value).join("[redacted]");
        }
    }
    return message
        .replace(/(?:mongodb(?:\+srv)?|https?):\/\/[^\s]+/gi, "[URL redacted]")
        .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
        .replace(/\bsk-[A-Za-z0-9_-]+/g, "[redacted]")
        .slice(0, 1000);
}
