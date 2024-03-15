import { mock, MockProxy } from "jest-mock-extended";

import { fetchAllFellows } from "../fellows";
import { ActionLogger } from "../github/types";

describe("Fellows test", () => {
  let logger: MockProxy<ActionLogger>;

  beforeEach(() => {
    logger = mock<ActionLogger>();
  });

  test("Should fetch fellows", async () => {
    const members = await fetchAllFellows(logger);
    expect(members.length).toBeGreaterThan(0);
  }, 60_000);
});
