import { existsSync } from "node:fs";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "./generated/prisma/client";

export * from "./generated/prisma/client";

function findRepoRoot(startDir: string): string {
  let current = path.resolve(startDir);

  while (true) {
    if (existsSync(path.join(current, "packages/database/prisma/schema.prisma"))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(`Unable to locate PaperEdge repo root from ${startDir}`);
    }

    current = parent;
  }
}

export function getDatabaseFilePath(): string {
  return path.join(findRepoRoot(process.cwd()), "packages/database/prisma/dev.db");
}

const dbUrl = `file:${getDatabaseFilePath()}`;
const globalForPrisma = globalThis as unknown as { paperedgePrisma?: PrismaClient };

export const db =
  globalForPrisma.paperedgePrisma ??
  new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: dbUrl }),
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.paperedgePrisma = db;
}
