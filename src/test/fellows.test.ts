import { describe, expect, test } from "vitest";

import { fetchAllFellows } from "../fellows";
import { ActionLogger } from "../github/types";

describe("Fellows test", () => {
  const logger: ActionLogger = {
    debug: (_: string): void => {},
    info: (_: string): void => {},
    warn: (_: string | Error): void => {},
    error: (_: string | Error): void => {},
  };

  test("Should fetch fellows", async () => {
    const members = await fetchAllFellows(logger);
    expect(members.length).toBeGreaterThan(0);
  }, 60_000);
});
