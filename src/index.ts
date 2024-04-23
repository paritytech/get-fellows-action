import { setFailed } from "@actions/core";

import { fetchIdentity } from "./experiment";
import { generateCoreLogger } from "./util";

const logger = generateCoreLogger();
/*
const mapFellows = async (fellows: FellowObject[]) => {
  setOutput("fellows", JSON.stringify(fellows));
  const githubHandles = fellows
    .map(({ githubHandle }) => githubHandle)
    .filter((handle) => !!handle)
    .join(",");
  setOutput("github-handles", githubHandles);

  const table: SummaryTableRow[] = [
    [
      { header: true, data: "Rank" },
      { header: true, data: "GitHub Handle" },
      { header: true, data: "Address" },
    ],
  ];

  for (const fellow of fellows.sort((old, { rank }) => rank - old.rank)) {
    if (fellow.githubHandle) {
      table.push([
        fellow.rank.toString(),
        `@${fellow.githubHandle}`,
        fellow.address,
      ]);
    }
  }

  return await summary.addHeading("Fellows").addTable(table).write();
};
*/

fetchIdentity(console)
  .then(() => console.log("Done"))
  .catch(setFailed);
// fetchAllFellows(logger).then(mapFellows).catch(setFailed);
