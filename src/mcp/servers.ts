import type { McpServerConfig } from "@anthropic-ai/claude-agent-sdk";

export const externalMcpServers: Record<string, McpServerConfig> = {
  slack: {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-slack"],
    env: {
      SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN ?? "",
      SLACK_TEAM_ID: process.env.SLACK_TEAM_ID ?? "",
    },
  },
  github: {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    env: {
      GITHUB_TOKEN: process.env.GITHUB_TOKEN ?? "",
    },
  },
  clickup: {
    command: "npx",
    args: ["-y", "mcp-remote", "https://mcp.clickup.com/mcp"],
    env: {
      CLICKUP_API_KEY: process.env.CLICKUP_API_KEY ?? "",
    },
  },
};
