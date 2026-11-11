/**
 * Text embedding for memory retrieval.
 * Uses ruvector-onnx-embeddings-wasm (RuvNet) with all-MiniLM-L6-v2 (384-dim).
 * Falls back to deterministic hash-based vectors if the model fails to load.
 *
 * In Node (e.g. Vitest), the upstream loader only uses the browser Cache API,
 * so it re-downloads the model every run. We use a file-based cache so the
 * model is downloaded once and reused (see getNodeModelCacheDir).
 *
 * @see docs/domains/memory-reference.md
 */

import * as fs from "node:fs";
import * as path from "node:path";

const DEFAULT_DIMENSIONS = 384;
const DEFAULT_MODEL = "all-MiniLM-L6-v2";

const isNode =
  typeof process !== "undefined" &&
  typeof process.versions?.node === "string";

/** Directory for caching the embedding model in Node (avoids re-download every run). */
function getNodeModelCacheDir(): string {
  const base =
    process.env.RUVECTOR_MODEL_CACHE ||
    path.join(process.cwd(), ".cache", "ruvector-models");
  if (!fs.existsSync(base)) {
    fs.mkdirSync(base, { recursive: true });
  }
  return base;
}

/** Simple string hash (djb2). */
function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  return h >>> 0;
}

/** Seeded pseudo-random for deterministic vectors. */
function seededRandom(seed: number): () => number {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

/**
 * Fallback: generate a deterministic vector from text.
 * Not semantic - used when the real model fails to load.
 */
function embedTextFallback(text: string, dimensions = DEFAULT_DIMENSIONS): Float32Array {
  const vec = new Float32Array(dimensions);
  const seed = hashString(text);
  const rng = seededRandom(seed);
  for (let i = 0; i < dimensions; i++) {
    vec[i] = (rng() - 0.5) * 2;
  }
  // L2 normalize for cosine similarity
  let norm = 0;
  for (let i = 0; i < dimensions; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < dimensions; i++) vec[i] /= norm;
  return vec;
}

type Embedder = { embedOne: (text: string) => Float32Array };
let _loadPromise: Promise<Embedder | null> | null = null;

/**
 * Load the WASM module via dynamic import.
 * ruvector-onnx-embeddings-wasm ships both ESM and CJS entry points;
 * the .cjs file works in Node without import.meta.url issues.
 */
async function loadWasmModule(): Promise<Record<string, unknown> | null> {
  try {
    const mod = (await import(
      /* webpackIgnore: true */
      "ruvector-onnx-embeddings-wasm"
    )) as unknown as Record<string, unknown> & { default?: Record<string, unknown> };
    return (mod.default ?? mod) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function doLoadEmbedder(): Promise<Embedder | null> {
  try {
    const wasmModule = await loadWasmModule();
    if (!wasmModule) return null;

    const modelName = process.env.EMBEDDING_MODEL ?? DEFAULT_MODEL;

    if (isNode) {
      const { MODELS } = await import(
        /* webpackIgnore: true */
        "ruvector-onnx-embeddings-wasm/loader.js"
      );
      const config = (MODELS as Record<string, { model: string; tokenizer: string; maxLength: number }>)[modelName];
      if (!config) return null;

      const cacheDir = getNodeModelCacheDir();
      const modelPath = path.join(cacheDir, `${modelName}-model.onnx`);
      const tokenizerPath = path.join(cacheDir, `${modelName}-tokenizer.json`);

      let modelBytes: Uint8Array;
      let tokenizerJson: string;

      if (fs.existsSync(modelPath) && fs.existsSync(tokenizerPath)) {
        const [modelBuf, tokenizerStr] = await Promise.all([
          fs.promises.readFile(modelPath),
          fs.promises.readFile(tokenizerPath, "utf-8"),
        ]);
        modelBytes = new Uint8Array(modelBuf);
        tokenizerJson = tokenizerStr;
      } else {
        const [modelRes, tokenizerRes] = await Promise.all([
          fetch(config.model),
          fetch(config.tokenizer),
        ]);
        if (!modelRes.ok || !tokenizerRes.ok) return null;
        const [modelBuf, tokenizerStr] = await Promise.all([
          modelRes.arrayBuffer(),
          tokenizerRes.text(),
        ]);
        modelBytes = new Uint8Array(modelBuf);
        tokenizerJson = tokenizerStr;
        await Promise.all([
          fs.promises.writeFile(modelPath, modelBytes),
          fs.promises.writeFile(tokenizerPath, tokenizerJson),
        ]);
      }

      type WasmConfigInstance = {
        setMaxLength: (n: number) => WasmConfigInstance;
        setNormalize: (b: boolean) => WasmConfigInstance;
        setPooling: (n: number) => WasmConfigInstance;
      };
      const WasmEmbedderConfig = wasmModule.WasmEmbedderConfig as new () => WasmConfigInstance;
      const WasmEmbedder = wasmModule.WasmEmbedder as {
        withConfig: (model: Uint8Array, tokenizer: string, c: WasmConfigInstance) => Embedder;
      };
      const embedderConfig = new WasmEmbedderConfig()
        .setMaxLength(config.maxLength)
        .setNormalize(true)
        .setPooling(0);
      return WasmEmbedder.withConfig(modelBytes, tokenizerJson, embedderConfig);
    }

    const { createEmbedder } = await import(
      /* webpackIgnore: true */
      "ruvector-onnx-embeddings-wasm/loader.js"
    );
    return await createEmbedder(modelName, wasmModule) as Embedder;
  } catch (err) {
    console.warn(
      "[embedding] Failed to load embedding model, using hash-based fallback:",
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

/**
 * Singleton loader: all concurrent callers share the same promise so the
 * model is downloaded exactly once and every caller waits for it.
 */
function loadEmbedder(): Promise<Embedder | null> {
  if (!_loadPromise) {
    _loadPromise = doLoadEmbedder();
  }
  return _loadPromise;
}

/**
 * Embed text into a 384-dimensional vector.
 * Uses ruvector-onnx-embeddings-wasm (RuvNet) when available.
 * Falls back to deterministic hash-based vectors on model load failure.
 *
 * @param text - Text to embed
 * @param dimensions - Ignored when using real model (always 384). Used for fallback.
 * @returns Promise resolving to normalized Float32Array
 */
export async function embedText(text: string, dimensions = DEFAULT_DIMENSIONS): Promise<Float32Array> {
  const trimmed = text?.trim() ?? "";
  if (!trimmed) return embedTextFallback("", dimensions);

  const embedder = await loadEmbedder();
  if (!embedder) return embedTextFallback(trimmed, dimensions);

  try {
    const vec = embedder.embedOne(trimmed);
    if (!vec || vec.length < DEFAULT_DIMENSIONS) return embedTextFallback(trimmed, dimensions);
    return new Float32Array(vec.subarray(0, DEFAULT_DIMENSIONS));
  } catch (err) {
    console.warn(
      "[embedding] Inference failed, using hash-based fallback:",
      err instanceof Error ? err.message : String(err)
    );
    return embedTextFallback(trimmed, dimensions);
  }
}

/** Reset for tests. */
export function resetEmbeddingForTesting(): void {
  _loadPromise = null;
}

export { DEFAULT_DIMENSIONS };
