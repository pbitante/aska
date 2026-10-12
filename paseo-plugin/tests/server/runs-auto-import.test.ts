import { describe, expect, it } from "vitest";
import { AUTO_IMPORT_MS, createAutoImport } from "../../server/runs/archive";

const counts = (imported: number) => ({ imported, skipped: 0, alreadyArchived: 0 });

function clock(start = 0) {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

describe("createAutoImport", () => {
  it("runs at most once per window", async () => {
    const { now, advance } = clock();
    let calls = 0;
    const autoImport = createAutoImport(async () => counts(++calls), now);
    expect(await autoImport()).toEqual(counts(1));
    expect(await autoImport()).toEqual(counts(0));
    advance(AUTO_IMPORT_MS - 1);
    expect(await autoImport()).toEqual(counts(0));
    advance(1);
    expect(await autoImport()).toEqual(counts(2));
    expect(calls).toBe(2);
  });

  it("shares one in-flight run across concurrent callers", async () => {
    let calls = 0;
    let resolve!: (v: ReturnType<typeof counts>) => void;
    const autoImport = createAutoImport(() => {
      calls++;
      return new Promise((r) => (resolve = r));
    });
    const a = autoImport();
    const b = autoImport();
    resolve(counts(1));
    expect(await a).toEqual(counts(1));
    expect(await b).toEqual(counts(1));
    expect(calls).toBe(1);
  });

  // runs.list triggering this is covered in runs-handlers.test.ts.
  it("a forced import bypasses the throttle", async () => {
    const { now, advance } = clock();
    let calls = 0;
    const autoImport = createAutoImport(async () => counts(++calls), now);
    expect(await autoImport()).toEqual(counts(1));
    advance(1000);
    expect(await autoImport({ force: true })).toEqual(counts(2));
    expect(await autoImport()).toEqual(counts(0));
    expect(calls).toBe(2);
  });
});
