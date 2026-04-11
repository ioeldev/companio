/** Stdio MCP server launch config (used with @ai-sdk/mcp Experimental_StdioMCPTransport). */
export interface ExternalMcpStdioConfig {
    command: string;
    args?: string[];
    env?: Record<string, string>;
}

export const externalMcpServers: Record<string, ExternalMcpStdioConfig> = {
    slack: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-slack"],
        env: {
            SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN ?? "",
            SLACK_TEAM_ID: process.env.SLACK_TEAM_ID ?? "",
        },
    },
    clickup: {
        command: "npx",
        args: ["-y", "mcp-remote", "https://mcp.clickup.com/mcp"],
        env: {
            CLICKUP_API_KEY: process.env.CLICKUP_API_KEY ?? "",
        },
    },
    github: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        env: {
            GITHUB_PERSONAL_ACCESS_TOKEN:
                process.env.GITHUB_TOKEN ?? process.env.GITHUB_PERSONAL_ACCESS_TOKEN ?? "",
        },
    },
};
