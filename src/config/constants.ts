/**
 * Application constants and configuration
 */

/** QMD version */
export const VERSION = "1.0.0";

/** Default embedding model (can be overridden by QMD_EMBED_MODEL env var) */
export const DEFAULT_EMBED_MODEL = process.env.QMD_EMBED_MODEL || "nomic-embed-text";

/** Default reranking model (can be overridden by QMD_RERANK_MODEL env var) */
export const DEFAULT_RERANK_MODEL = process.env.QMD_RERANK_MODEL || "ExpedientFalcon/qwen3-reranker:0.6b-q8_0";

/** Default query expansion model */
export const DEFAULT_QUERY_MODEL = "qwen3:0.6b";

/** Default glob pattern for markdown files */
export const DEFAULT_GLOB = "**/*.md";

/** Ollama API URL (can be overridden by OLLAMA_URL env var) */
export const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
