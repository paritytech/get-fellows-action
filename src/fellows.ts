/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/ban-ts-comment */
import { createClient } from "@polkadot-api/client";
import { getChain } from "@polkadot-api/node-polkadot-provider";
import { getSmProvider } from "@polkadot-api/sm-provider";
import { WebSocketProvider } from "@polkadot-api/ws-provider/node";
import { start } from "smoldot";

import collectiveDescriptor from "./codegen/collectives";
import relayDescriptor from "./codegen/relay";
import { ActionLogger } from "./github/types";

const collectiveChain =
  require("@substrate/connect-known-chains/polkadot_collectives") as {
    chainSpec: string;
  };
const polkadot = require("@substrate/connect-known-chains/polkadot") as {
  chainSpec: string;
};

type FellowData = { address: string; rank: number };

export type FellowObject = {
  address: string;
  githubHandle?: string;
  rank: number;
};

export const fetchAllFellows = async (
  logger: ActionLogger,
): Promise<FellowObject[]> => {
  logger.info("Initializing smoldot");
  const smoldot = start();
  const SmProvider = getSmProvider(smoldot);
  let polkadotClient: ReturnType<typeof createClient> | null = null;

  try {
    const relayChain = await smoldot.addChain({
      chainSpec: polkadot.chainSpec,
    });
    logger.debug("Connecting to collective parachain");
    await smoldot.addChain({
      chainSpec: collectiveChain.chainSpec,
      potentialRelayChains: [relayChain],
    });

    logger.info("Initializing PAPI");
    polkadotClient = createClient(
      getChain({
        provider: SmProvider({
          potentialRelayChains: [relayChain],
          chainSpec: collectiveChain.chainSpec,
        }),
        keyring: [],
      }),
    );

    // We fetch all the members from the collective
    const collectivesApi = polkadotClient.getTypedApi(collectiveDescriptor);
    const memberEntries =
      await collectivesApi.query.FellowshipCollective.Members.getEntries();

    // We iterate over the fellow data and convert them into usable values
    const fellows: FellowData[] = [];
    for (const member of memberEntries) {
      const [address] = member.keyArgs;
      fellows.push({ address, rank: member.value } as FellowData);
    }
    logger.debug(JSON.stringify(fellows));

    // Once we obtained this information, we disconnect this api.
    polkadotClient.destroy();

    logger.debug("Connecting to relay parachain.");

    // We move into the relay chain
    polkadotClient = createClient(
      getChain({
        provider: WebSocketProvider("wss://rpc.polkadot.io"),
        keyring: [],
      }),
    );
    const relayApi = polkadotClient.getTypedApi(relayDescriptor);

    const users: FellowObject[] = [];

    // We iterate over the different members and extract their data
    for (const fellow of fellows) {
      logger.debug(
        `Fetching identity of '${fellow.address}', rank: ${fellow.rank}`,
      );

      const fellowData = await relayApi.query.Identity.IdentityOf.getValue(
        fellow.address,
      );

      let data: FellowObject = { address: fellow.address, rank: fellow.rank };

      // If the identity is null, we ignore it.
      if (!fellowData) {
        logger.debug("Identity is null. Skipping");
        continue;
      }

      const additional = fellowData.info.additional;

      // If it does not have additional data (GitHub handle goes here) we ignore it
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      if (!additional || additional.length < 1) {
        logger.debug("Additional data is null. Skipping");
        continue;
      }

      for (const additionalData of additional) {
        const [key, value] = additionalData;
        // We verify that they have an additional data of the key "github"
        // If it has a handle defined, we push it into the array
        const fieldName = key.value?.asText();
        logger.debug(`Analyzing: ${fieldName ?? "unknown field"}`);
        const fieldValue = value.value?.asText();
        if (fieldName === "github" && fieldValue && fieldValue.length > 0) {
          logger.debug(`Found handles: '${fieldValue}`);
          // We add it to the array and remove the @ if they add it to the handle
          data = { ...data, githubHandle: fieldValue.replace("@", "") };
        }
        users.push(data);
      }
    }
    logger.info(`Found users: ${JSON.stringify(Array.from(users.entries()))}`);

    return users;
  } catch (error) {
    logger.error(error as Error);
    throw error;
  } finally {
    if (polkadotClient) {
      polkadotClient.destroy();
    }
    await smoldot.terminate();
  }
};
