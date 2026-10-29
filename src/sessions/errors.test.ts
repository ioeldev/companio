import { test, expect } from "bun:test";
import { sessionErrorSummary } from "./errors.ts";
test("error summaries retain useful diagnostics and redact credentials", () => {
    process.env.TEST_SECRET = "private-credential";
    try {
        const result = sessionErrorSummary(
            new Error(
                "Invalid schema: tools[2]. private-credential Bearer xyz sk-example https://server/path?secret=x",
            ),
        );
        expect(result).toContain("Invalid schema: tools[2]");
        for (const secret of ["private-credential", "xyz", "sk-example", "secret=x"])
            expect(result).not.toContain(secret);
    } finally {
        delete process.env.TEST_SECRET;
    }
});
