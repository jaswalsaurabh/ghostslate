# GhostSlate Infrastructure

This directory holds infrastructure configuration for local development and production deployment to Google Cloud Run.

## Deployment Target

- **Production:** Google Cloud Run (single container serving API + built web SPA).
- **Local:** `docker compose -f infra/docker-compose.yml up --build`.

## Required Services

1. **ClickHouse Cloud** (or local instance) reachable by `mcp-clickhouse`.
2. **Gemini on Vertex AI via `@google/genai`** for multimodal reasoning and vision.
3. **Cloud Run** for hosting.
