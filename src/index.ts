import dotenv from "dotenv";
import { query } from "@anthropic-ai/claude-agent-sdk";

dotenv.config();

const CLICKUP_SPACE_ID = process.env.CLICKUP_SPACE_ID;
// const CLICKUP_WORKSPACE_ID = process.env.CLICKUP_WORKSPACE_ID;
const CLICKUP_MEMBER_ID = process.env.CLICKUP_MEMBER_ID;

console.log(`CLICKUP_MEMBER_ID: ${CLICKUP_MEMBER_ID}`);

for await (const message of query({
    prompt: `When I ask about current tasks, first use get_lists for Space ID ${CLICKUP_SPACE_ID}. Look for the List where status or dates indicate it is currently active. Then, use that list_id to fetch tasks.
    Use the member_id ${CLICKUP_MEMBER_ID} as a reference my member id (assignee, creator, etc.).
    What is my member name? and my tasks in the current sprint?
    `,
    options: {
        allowedTools: ["mcp__slack__*", "mcp__clickup__*"],
    },
})) {
    if (message.type === "result" && message.subtype === "success") {
        console.log(message.result);
    }
}
