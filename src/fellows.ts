/* eslint-disable @typescript-eslint/ban-ts-comment */
import { ApiPromise, WsProvider } from "@polkadot/api";

import { ActionLogger } from "./github/types";

type FellowData = { address: string; rank: number };

export const fetchAllFellows = async (
  logger: ActionLogger,
): Promise<Map<string, number>> => {
  let api: ApiPromise;
  logger.debug("Connecting to collective parachain");
  // we connect to the collective rpc node
  const wsProvider = new WsProvider(
    "wss://polkadot-collectives-rpc.polkadot.io",
  );
  api = await ApiPromise.create({ provider: wsProvider });
  try {
    // We fetch all the members
    const membersObj = await api.query.fellowshipCollective.members.entries();

    // We iterate over the fellow data and convert them into usable values
    const fellows: FellowData[] = [];
    for (const [key, rank] of membersObj) {
      // @ts-ignore
      const [address]: [string] = key.toHuman();
      fellows.push({ address, ...(rank.toHuman() as object) } as FellowData);
    }
    logger.debug(JSON.stringify(fellows));

    // Once we obtained this information, we disconnect this api.
    await api.disconnect();

    logger.debug("Connecting to relay parachain.");
    // We connect to the relay chain
    api = await ApiPromise.create({
      provider: new WsProvider("wss://rpc.polkadot.io"),
    });

    // We iterate over the different members and extract their data
    const users: Map<string, number> = new Map<string, number>();
    for (const fellow of fellows) {
      logger.debug(
        `Fetching identity of '${fellow.address}', rank: ${fellow.rank}`,
      );
      const fellowData = (
        await api.query.identity.identityOf(fellow.address)
      ).toHuman() as Record<string, unknown> | undefined;

      // If the identity is null, we ignore it.
      if (!fellowData) {
        logger.debug("Identity is null. Skipping");
        continue;
      }

      // @ts-ignore
      const additional = fellowData.info.additional as
        | [{ Raw: string }, { Raw: string }][]
        | undefined;

      // If it does not have additional data (GitHub handle goes here) we ignore it
      if (!additional || additional.length < 1) {
        logger.debug("Additional data is null. Skipping");
        continue;
      }

      for (const additionalData of additional) {
        const [key, value] = additionalData;
        // We verify that they have an additional data of the key "github"
        // If it has a handle defined, we push it into the array
        if (
          key?.Raw &&
          key?.Raw === "github" &&
          value?.Raw &&
          value?.Raw.length > 0
        ) {
          logger.debug(`Found handles: '${value.Raw}'`);
          // We add it to the array and remove the @ if they add it to the handle
          users.set(value.Raw.replace("@", ""), fellow.rank);
        }
      }
    }

    logger.info(`Found users: ${JSON.stringify(Array.from(users.entries()))}`);

    return users;
  } catch (error) {
    logger.error(error as Error);
    throw error;
  } finally {
    await api.disconnect();
  }
};
