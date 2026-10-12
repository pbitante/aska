// Small helpers the client, the server and shared code all use.

export const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;
