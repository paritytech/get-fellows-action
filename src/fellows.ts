import { createClient } from "@polkadot-api/client";
import { getChain } from "@polkadot-api/node-polkadot-provider";
import { getSmProvider } from "@polkadot-api/sm-provider";
import {
  polkadot,
  polkadot_collectives,
} from "@substrate/connect-known-chains";
import { start } from "smoldot";

import collectiveDescriptor from "./codegen/collectives";
import relayDescriptor from "./codegen/relay";
import { ActionLogger } from "./github/types";

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

  // TODO: Replace once https://github.com/paritytech/opstooling/discussions/373 is fixed
  let polkadotClient: ReturnType<typeof createClient> | null = null;

  try {
    const relayChain = await smoldot.addChain({
      chainSpec: polkadot,
    });
    logger.debug("Connecting to collective parachain");
    await smoldot.addChain({
      chainSpec: polkadot_collectives,
      potentialRelayChains: [relayChain],
    });

    const SmProviderCollectives = getSmProvider(smoldot, {
      potentialRelayChains: [relayChain],
      chainSpec: polkadot_collectives,
    });
    logger.info("Initializing PAPI");
    polkadotClient = createClient(
      getChain({
        provider: SmProviderCollectives,
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
      // We filter candidates (who are rank 0)
      if (member.value > 0) {
        const [address] = member.keyArgs;
        fellows.push({ address, rank: member.value });
      }
    }
    logger.debug(JSON.stringify(fellows));

    // Once we obtained this information, we disconnect this api.
    polkadotClient.destroy();

    logger.debug("Connecting to relay parachain.");

    // We move into the relay chain
    const SmProviderRelay = getSmProvider(smoldot, {
      potentialRelayChains: [relayChain],
      chainSpec: polkadot,
    });
    polkadotClient = createClient(
      getChain({
        provider: SmProviderRelay,
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

      // If the identity is null, we check if there is a super identity.
      if (!fellowData) {
        logger.debug("Identity is null. Checking for super identity");
        const superIdentity = await relayApi.query.Identity.SuperOf.getValue(
          fellow.address,
        );
        if (superIdentity) {
          const [address] = superIdentity;
          logger.debug(
            `${fellow.address} has a super identity: ${address}. Adding it to the array`,
          );

          fellows.push({ address, rank: fellow.rank });
        } else {
          logger.debug("No super identity found. Skipping");
        }

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
