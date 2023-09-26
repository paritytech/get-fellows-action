import { setFailed, setOutput } from "@actions/core";

import { fetchAllFellows } from "./fellows";
import { generateCoreLogger } from "./util";

const logger = generateCoreLogger();

const mapFellows = (fellows: Map<string, number>) => {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const fellowsHandles = Array.from(fellows.keys());
  setOutput("fellows-handles", JSON.stringify(fellowsHandles));
  const fellowsMap = [...fellows].map(([name, rank]) => {
    return { user: name, rank };
  });
  setOutput("fellows-map", JSON.stringify(fellowsMap));
  setOutput("fellows", fellowsHandles.join(","));
};

fetchAllFellows(logger).then(mapFellows).catch(setFailed);
