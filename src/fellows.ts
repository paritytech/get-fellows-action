import { start } from "smoldot";

import { SS58String, createClient } from "polkadot-api";
import { getSmProvider } from "polkadot-api/sm-provider";
import { relay, collectives } from "@polkadot-api/descriptors";
import { ActionLogger } from "./github/types";
import polkadot_chain from "polkadot-api/chains/polkadot";
import collectives_chain from "polkadot-api/chains/polkadot_collectives";

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
    const smoldotRelayChain = await smoldot.addChain({ chainSpec: polkadot_chain.chainSpec, disableJsonRpc: true });

    const jsonRpcProvider = getSmProvider(smoldotRelayChain);
    logger.info("Initializing the relay client");
    const polkadotClient = createClient(jsonRpcProvider);

    // const relayClient = createClient(
    //   getChain({
    //     provider: getSmProvider(smoldot, polkadot),
    //     keyring: [],
    //   }),
    // );
    const relayApi = polkadotClient.getTypedApi(relay);

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

    polkadotClient.destroy();

    logger.info("Initializing the collectives client");

    const collectiveRelayChain = await smoldot.addChain({ chainSpec: collectives_chain.chainSpec });
    const collectiveJsonRpcProvider = getSmProvider(collectiveRelayChain);
    logger.info("Initializing the relay client");
    const collectivesClient = createClient(collectiveJsonRpcProvider);
    // const collectivesClient = createClient(
    //   getChain({
    //     provider: getSmProvider(smoldot, {
    //       potentialRelayChains: [relayChain],
    //       chainSpec: polkadot_collectives,
    //     }),
    //     keyring: [],
    //   }),
    // );
    const collectivesApi = collectivesClient.getTypedApi(collectives);

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
    collectivesClient.destroy();

    return users;
  } catch (error) {
    logger.error(error as Error);
    throw error;
  } finally {
    await smoldot.terminate();
  }
};
