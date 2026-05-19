import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "..");

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(path.join(repoRoot, relativePath), "utf8")) as T;
}

function readText(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("Step 2 workspace skeleton", () => {
  it("declares app and package workspaces at the repo root", () => {
    const pkg = readJson<{ workspaces?: string[] }>("package.json");

    expect(pkg.workspaces).toEqual(["apps/*", "packages/*"]);
  });

  it("provides shared core and database package entrypoints", () => {
    const corePkg = readJson<{ name?: string; exports?: Record<string, string> }>(
      "packages/core/package.json",
    );
    const databasePkg = readJson<{ name?: string; exports?: Record<string, string> }>(
      "packages/database/package.json",
    );

    expect(corePkg.name).toBe("@paperedge/core");
    expect(corePkg.exports?.["."]).toBe("./src/index.ts");
    expect(databasePkg.name).toBe("@paperedge/database");
    expect(databasePkg.exports?.["."]).toBe("./src/index.ts");
    expect(readText("packages/database/src/index.ts")).toContain("export const db");
  });

  it("creates dashboard and verifier app shells that import shared packages", () => {
    for (const appName of ["dashboard", "verifier"]) {
      const appDir = `apps/${appName}`;

      expect(existsSync(path.join(repoRoot, appDir, "app/page.tsx"))).toBe(true);
      expect(existsSync(path.join(repoRoot, appDir, "app/layout.tsx"))).toBe(true);
      expect(readText(`${appDir}/app/page.tsx`)).toContain("@paperedge/core");
      expect(readText(`${appDir}/app/page.tsx`)).toContain("@paperedge/database");
    }
  });
});
