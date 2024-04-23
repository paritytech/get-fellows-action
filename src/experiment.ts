import { polkadot as polkadot_descriptor } from "@polkadot-api/descriptors";
import { createClient } from "polkadot-api";
import polkadot_chain, {
    chainSpec as polkadotChainSpec,
} from "polkadot-api/chains/polkadot";
import { getSmProvider } from "polkadot-api/sm-provider";
import { start } from "smoldot";

export const fetchIdentity = async (logger: typeof console): Promise<any> => {
    console.log("polkadot chain", polkadot_chain);
    logger.info("Initializing smoldot");
    const smoldot = start();

    try {
        const smoldotRelayChain = await smoldot.addChain({
            chainSpec: polkadotChainSpec,
            disableJsonRpc: true,
        });

        const jsonRpcProvider = getSmProvider(smoldotRelayChain);
        logger.info("Initializing the relay client");
        const polkadotClient = createClient(jsonRpcProvider);

        const relayApi = polkadotClient.getTypedApi(polkadot_descriptor);

        const identity = await relayApi.query.Identity.IdentityOf.getValue(
            "1eTPAR2TuqLyidmPT9rMmuycHVm9s9czu78sePqg2KHMDrE",
        );

        console.log("Identity is", identity);

        return identity;
    } catch (error) {
        console.warn("something went wrong");
        logger.error(error as Error);
        throw error;
    } finally {
        await smoldot.terminate();
    }
};
