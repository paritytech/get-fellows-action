import { collectives, IdentityData, people } from "@polkadot-api/descriptors";
import {
  Binary,
  createClient,
  HexString,
  PolkadotClient,
  SS58String,
} from "polkadot-api";
import { chainSpec as polkadotChainSpec } from "polkadot-api/chains/polkadot";
import { chainSpec as collectivesChainSpec } from "polkadot-api/chains/polkadot_collectives";
import { chainSpec as peopleChainSpec } from "polkadot-api/chains/polkadot_people";
import { getSmProvider } from "polkadot-api/sm-provider";
import {
  filter,
  firstValueFrom,
  switchMap,
  tap,
  throwError,
  timeout,
} from "rxjs";
import { start } from "smoldot";

import { ActionLogger } from "./github/types";

type FellowData = { address: string; rank: number };

export type FellowObject = {
  address: string;
  githubHandle?: string;
  rank: number;
};

/**
 * The People and Collectives chain specs ship without a `lightSyncState`, so
 * smoldot derives their heads from the relay chain, whose own spec checkpoint
 * lags days behind. Reading storage before the relay chain caught up would
 * report an outdated fellowship, so a head is only trusted once its on-chain
 * timestamp is close to wall clock. Guards against a head that stops advancing.
 */
const MAX_HEAD_AGE_MS = 5 * 60_000;
const SYNC_TIMEOUT_MS = 5 * 60_000;

const waitUntilSynced = async (
  client: PolkadotClient,
  readTimestamp: (at: HexString) => Promise<bigint>,
  chainName: string,
  logger: ActionLogger,
): Promise<void> => {
  await firstValueFrom(
    client.finalizedBlock$.pipe(
      switchMap(async (block) => {
        const age = Date.now() - Number(await readTimestamp(block.hash));
        logger.debug(
          `${chainName}: finalized head #${block.number} is ${Math.round(age / 1000)}s old`,
        );
        return { block, age };
      }),
      filter(({ age }) => age <= MAX_HEAD_AGE_MS),
      tap(({ block, age }) =>
        logger.info(
          `${chainName} is synced at block #${block.number} (${Math.round(age / 1000)}s old)`,
        ),
      ),
      timeout({
        each: SYNC_TIMEOUT_MS,
        with: () =>
          throwError(
            () =>
              new Error(
                `${chainName} light client did not finish syncing within ${SYNC_TIMEOUT_MS / 1000}s`,
              ),
          ),
      }),
    ),
  );
};

export const fetchAllFellows = async (
  logger: ActionLogger,
): Promise<FellowObject[]> => {
  logger.info("Initializing smoldot");
  const smoldot = start();

  try {
    // getSmProvider calls this factory again whenever smoldot destroyed the
    // chain, so it must build a fresh one each time - returning a captured
    // chain would hand back the dead one. The relay chain is therefore added
    // per parachain, which costs nothing: smoldot reuses chains with the same
    // chainSpec.
    const addParachain = (chainSpec: string) => async () => {
      const relayChain = await smoldot.addChain({
        chainSpec: polkadotChainSpec,
      });
      return await smoldot.addChain({
        chainSpec,
        potentialRelayChains: [relayChain],
      });
    };

    logger.info("Initializing the people client");
    const peopleClient = createClient(
      getSmProvider(addParachain(peopleChainSpec)),
    );
    const peopleApi = peopleClient.getTypedApi(people);

    logger.info("Initializing the collectives client");
    const collectivesClient = createClient(
      getSmProvider(addParachain(collectivesChainSpec)),
    );
    const collectivesApi = collectivesClient.getTypedApi(collectives);

    logger.info("Waiting for the light clients to sync");
    await Promise.all([
      waitUntilSynced(
        collectivesClient,
        (at) => collectivesApi.query.Timestamp.Now.getValue({ at }),
        "Collectives chain",
        logger,
      ),
      waitUntilSynced(
        peopleClient,
        (at) => peopleApi.query.Timestamp.Now.getValue({ at }),
        "People chain",
        logger,
      ),
    ]);

    const getGhHandle = async (
      address: SS58String,
    ): Promise<string | undefined> => {
      logger.debug(`Fetching identity of '${address}'`);
      const identity =
        await peopleApi.query.Identity.IdentityOf.getValue(address);

      if (identity) {
        const github = readIdentityData(identity.info.github);

        if (!github) {
          logger.debug(
            `'${address}' does not have an additional field named 'github'`,
          );
          return;
        }

        const handle = github.replace("@", "");

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

function readIdentityData(identityData: IdentityData): string | null {
  if (identityData.type === "None" || identityData.type === "Raw0") return null;
  if (identityData.type === "Raw1")
    return Binary.toText(Uint8Array.of(identityData.value));
  return Binary.toText(Binary.fromHex(identityData.value));
}
