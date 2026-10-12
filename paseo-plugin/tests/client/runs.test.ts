import { describe, expect, it } from "vitest";
import { filterRuns, importToastMessage, projectFilters, UNKNOWN_PROJECT } from "../../client/logic/runs";
import type { RunMeta } from "../../shared/runs";

const meta = (id: string, projectPath: string | null) => ({ id, projectPath }) as RunMeta;
const runs = [meta("20261009T120000Z-Aaaaaa", "/home/u/dev/tidepool"), meta("20261009T110000Z-Bbbbbb", "/home/u/dev/aska"), meta("20261009T100000Z-Cccccc", null), meta("20261009T090000Z-Dddddd", "/home/u/dev/tidepool")];

describe("project filters", () => {
  it("offers all, each project once, and unknown when present", () => {
    expect(projectFilters(runs)).toEqual([
      { value: "all", label: "All" },
      { value: "/home/u/dev/aska", label: "aska" },
      { value: "/home/u/dev/tidepool", label: "tidepool" },
      { value: UNKNOWN_PROJECT, label: "Unknown project" },
    ]);
    expect(projectFilters([runs[0]!])).toEqual([
      { value: "all", label: "All" },
      { value: "/home/u/dev/tidepool", label: "tidepool" },
    ]);
  });
  it("filters by project, unknown, or nothing", () => {
    expect(filterRuns(runs, "all")).toHaveLength(4);
    expect(filterRuns(runs, "/home/u/dev/tidepool").map((r) => r.id)).toEqual(["20261009T120000Z-Aaaaaa", "20261009T090000Z-Dddddd"]);
    expect(filterRuns(runs, UNKNOWN_PROJECT).map((r) => r.id)).toEqual(["20261009T100000Z-Cccccc"]);
  });
});

describe("importToastMessage", () => {
  it("leaves out zero parts", () => {
    expect(importToastMessage({ imported: 2, skipped: 1, alreadyArchived: 3 })).toBe("Imported 2 runs · 3 already archived · 1 skipped");
    expect(importToastMessage({ imported: 1, skipped: 0, alreadyArchived: 0 })).toBe("Imported 1 run");
    expect(importToastMessage({ imported: 0, skipped: 0, alreadyArchived: 5 })).toBe("Imported 0 runs · 5 already archived");
  });
});
