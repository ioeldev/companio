import { tool } from "ai";
import { z } from "zod";

/** Example AI SDK tool (not wired into Companio by default). */
export const getTemperatureTool = tool({
    description: "Get the current temperature at a location",
    inputSchema: z.object({
        latitude: z.number().describe("Latitude coordinate"),
        longitude: z.number().describe("Longitude coordinate"),
    }),
    execute: async (args) => {
        const response = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${args.latitude}&longitude=${args.longitude}&current=temperature_2m&temperature_unit=fahrenheit`
        );
        const data: { current?: { temperature_2m?: number } } = await response.json();
        const temp = data.current?.temperature_2m;
        return `Temperature: ${temp ?? "unknown"}°F`;
    },
});
