# bun-react-tailwind-template

To install dependencies:

```bash
bun install
```

To start a development server:

```bash
bun dev
```

## MongoDB Atlas

Set `MONGODB_URI` in `.env` to your Atlas connection string. `MONGODB_DB` is optional and defaults to `companio`. Atlas network access must allow the machine running Companio.

## Deployment

Pushing `main` typechecks the project, builds an image, and publishes it to GitHub Container Registry (GHCR). It then deploys that image to the VPS using `docker-compose.prod.yml`.

Configure these GitHub Actions secrets: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, and `GHCR_TOKEN` (a GitHub token with `read:packages`). Optionally set the `VPS_PORT` repository variable; it defaults to `9143`.

Create `~/apps/companio/.env` on the VPS with the runtime secrets from `.env.example` before the first deployment. Docker and the Compose plugin must be installed there. The published GHCR package must be public, or `GHCR_TOKEN` must be authorized to read it.

To run for production:

```bash
bun start
```

This project was created using `bun init` in bun v1.2.20. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
