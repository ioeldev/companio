FROM oven/bun:latest AS dependencies
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:latest
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv git ripgrep ca-certificates patch && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
EXPOSE 7777
CMD ["bun", "run", "start"]
