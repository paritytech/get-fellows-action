import { collectives, IdentityData, people } from "@polkadot-api/descriptors";
import { Binary, createClient, SS58String } from "polkadot-api";
import { chainSpec as polkadotChainSpec } from "polkadot-api/chains/polkadot";
import { chainSpec as collectivesChainSpec } from "polkadot-api/chains/polkadot_collectives";
import { chainSpec as peopleChainSpec } from "polkadot-api/chains/polkadot_people";
import { getSmProvider } from "polkadot-api/sm-provider";
import { start } from "smoldot";

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
    // Create smoldot chain with Polkadot Relay Chain
    const smoldotRelayChain = await smoldot.addChain({
      chainSpec: polkadotChainSpec,
    });

    // Add the people chain to smoldot
    const peopleRelayChain = await smoldot.addChain({
      chainSpec: peopleChainSpec,
      potentialRelayChains: [smoldotRelayChain],
    });

    // Initialize the smoldot provider
    const jsonRpcProvider = getSmProvider(peopleRelayChain);
    logger.info("Initializing the people client");
    const peopleClient = createClient(jsonRpcProvider);

    // Get the types for the people client
    const peopleApi = peopleClient.getTypedApi(people);

    const getGhHandle = async (
      address: SS58String,
    ): Promise<string | undefined> => {
      logger.debug(`Fetching identity of '${address}'`);
      const identityOf =
        await peopleApi.query.Identity.IdentityOf.getValue(address);

      if (identityOf) {
        const [identity] = identityOf;
        const github = readIdentityData(identity.info.github);

        if (!github) {
          logger.debug(
            `'${address}' does not have an additional field named 'github'`,
          );
          return;
        }

        const handle = github.asText().replace("@", "") as string;

        if (handle) {
          logger.info(`Found github handle for '${address}': '${handle}'`);
        } else {
          logger.debug(`'${address}' does not have a GitHub handle`);
          return;
        }
        return handle;
      }

      logger.debug(
        `Identity of '${address}' is null. Checking for super identity`,
      );

      const superIdentityAddress = (
        await peopleApi.query.Identity.SuperOf.getValue(address)
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

    const collectiveRelayChain = await smoldot.addChain({
      chainSpec: collectivesChainSpec,
      potentialRelayChains: [smoldotRelayChain],
    });
    const collectiveJsonRpcProvider = getSmProvider(collectiveRelayChain);
    logger.info("Initializing the relay client");
    const collectivesClient = createClient(collectiveJsonRpcProvider);
    const collectivesApi = collectivesClient.getTypedApi(collectives);

    // Pull the members of the FellowshipCollective
    const memberEntries =
      await collectivesApi.query.FellowshipCollective.Members.getEntries();

    // We no longer need the collective client, so let's destroy it
    collectivesClient.destroy();

    // Build the Array of FellowData and filter out candidates (zero rank members)
    const fellows: FellowData[] = memberEntries
      .map(({ keyArgs: [address], value: rank }) => {
        return { address, rank };
      })
      .filter(({ rank }) => rank > 0);
    logger.debug(JSON.stringify(fellows));

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
    peopleClient.destroy();

    return users;
  } catch (error) {
    logger.error(error as Error);
    throw error;
  } finally {
    await smoldot.terminate();
  }
};

function readIdentityData(identityData: IdentityData): Binary | null {
  if (identityData.type === "None" || identityData.type === "Raw0") return null;
  if (identityData.type === "Raw1")
    return Binary.fromBytes(new Uint8Array(identityData.value));
  return identityData.value;
}
