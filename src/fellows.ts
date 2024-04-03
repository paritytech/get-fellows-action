import { createClient, SS58String } from "@polkadot-api/client";
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

  try {
    const relayChain = await smoldot.addChain({
      chainSpec: polkadot,
      disableJsonRpc: true,
    });

    logger.info("Initializing the relay client");
    const relayClient = createClient(
      getChain({
        provider: getSmProvider(smoldot, polkadot),
        keyring: [],
      }),
    );
    const relayApi = relayClient.getTypedApi(relayDescriptor);

    const getGhHandle = async (
      address: SS58String,
    ): Promise<string | undefined> => {
      logger.debug(`Fetching identity of '${address}'`);
      const identity =
        await relayApi.query.Identity.IdentityOf.getValue(address);

      if (identity) {
        const handle = identity.info.additional
          .find(([key]) => key.value?.asText() === "github")?.[1]
          .value?.asText()
          .replace("@", "");
        if (handle) {
          logger.info(`Found github handle for '${address}': '${handle}'`);
        } else {
          logger.debug(`'${address}' does not have a GitHub handle`);
        }
        return handle;
      }

      logger.debug(
        `Identity of '${address}' is null. Checking for super identity`,
      );

      const superIdentityAddress = (
        await relayApi.query.Identity.SuperOf.getValue(address)
      )?.[0];

      if (superIdentityAddress) {
        logger.debug(
          `'${address}' has a super identity: '${superIdentityAddress}'. Fetching that identity`,
        );
        return await getGhHandle(superIdentityAddress);
      } else {
        logger.debug(`No superidentity for ${address} found.`);
        return undefined;
      }
    };

    logger.info("Initializing the collectives client");
    const collectivesClient = createClient(
      getChain({
        provider: getSmProvider(smoldot, {
          potentialRelayChains: [relayChain],
          chainSpec: polkadot_collectives,
        }),
        keyring: [],
      }),
    );
    const collectivesApi = collectivesClient.getTypedApi(collectiveDescriptor);

    // Pull the members of the FellowshipCollective
    const memberEntries =
      await collectivesApi.query.FellowshipCollective.Members.getEntries();

    // Build the Array of FellowData and filter out candidates (zero rank members)
    const fellows: FellowData[] = memberEntries
      .map(({ keyArgs: [address], value: rank }) => {
        return { address, rank };
      })
      .filter(({ rank }) => rank > 0);
    logger.debug(JSON.stringify(fellows));

    // We no longer need the collectives client, so let's destroy it
    collectivesClient.destroy();

    // Let's now pull the GH handles of the fellows
    const users: FellowObject[] = await Promise.all(
      fellows.map(async ({ address, rank }) => {
        return {
          address,
          rank,
          githubHandle: await getGhHandle(address),
        };
      }),
    );
    logger.info(`Found users: ${JSON.stringify(Array.from(users.entries()))}`);

    // We are now done with the relay client
    relayClient.destroy();

    return users;
  } catch (error) {
    logger.error(error as Error);
    throw error;
  } finally {
    await smoldot.terminate();
  }
};
