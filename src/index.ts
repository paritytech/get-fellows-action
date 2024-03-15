import { setFailed, setOutput, summary } from "@actions/core";
import { SummaryTableRow } from "@actions/core/lib/summary";

import { FellowObject, fetchAllFellows } from "./fellows";
import { generateCoreLogger } from "./util";

const logger = generateCoreLogger();

const mapFellows = async (fellows: FellowObject[]) => {
  setOutput("fellows", JSON.stringify(fellows));
  const githubHandles = fellows
    .map((f) => f.githubHandle)
    .filter((f) => !!f)
    .join(",");
  setOutput("github-handles", githubHandles);

  const table: SummaryTableRow[] = [
    [
      { header: true, data: "Address" },
      { header: true, data: "GitHub Handle" },
      { header: true, data: "Rank" },
    ],
  ];

  for (const fellow of fellows.sort((old, newF) => old.rank - newF.rank)) {
    table.push([
      fellow.address,
      `@${fellow.githubHandle ?? " ERROR"}`,
      fellow.rank.toString(),
    ]);
  }

  await summary.addHeading("Fellows").addTable(table).write();

  // TODO: Remove this once https://github.com/polkadot-api/polkadot-api/issues/327 is fixed
  process.exit(0);
};

fetchAllFellows(logger)
  .then(mapFellows)
  .catch((err) => {
    setFailed(err as Error);
    process.exit(1);
  });
