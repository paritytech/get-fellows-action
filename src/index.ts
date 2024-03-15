import { setFailed, setOutput } from "@actions/core";

import { FellowObject, fetchAllFellows } from "./fellows";
import { generateCoreLogger } from "./util";

const logger = generateCoreLogger();

const mapFellows = (fellows: FellowObject[]) => {
  setOutput("fellows", JSON.stringify(fellows));
  const githubHandles = fellows
    .map((f) => f.githubHandle)
    .filter((f) => !!f)
    .join(",");
  setOutput("github-handles", githubHandles);
};

fetchAllFellows(logger)
  .then(mapFellows)
  .catch(setFailed)
  .finally(() => {
    logger.info("Shutting down application");
    // TODO: Remove this once https://github.com/polkadot-api/polkadot-api/issues/327 is fixed
    process.exit(0);
  });
