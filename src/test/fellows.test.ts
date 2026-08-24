import { describe, expect, test } from "vitest";

import { fetchAllFellows } from "../fellows";
import { ActionLogger } from "../github/types";

const RELAY_WARP_SYNC_TIMEOUT_MS = 300_000;

describe("Fellows test", () => {
  const logger: ActionLogger = {
    debug: (_: string): void => {},
    info: (_: string): void => {},
    warn: (_: string | Error): void => {},
    error: (_: string | Error): void => {},
  };

  test(
    "Should fetch fellows",
    async () => {
      const members = await fetchAllFellows(logger);
      expect(members.length).toBeGreaterThan(0);
      expect(members).toContainEqual(
        expect.objectContaining({
          rank: 7,
          githubHandle: "gavofyork",
        }),
      );
    },
    RELAY_WARP_SYNC_TIMEOUT_MS,
  );
});
