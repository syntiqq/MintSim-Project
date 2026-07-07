import { Address, beginCell, toNano } from '@ton/core';
import { Collection }                  from '../build/Collection/Collection_Collection';
import { NetworkProvider, sleep }      from '@ton/blueprint';


export async function run(provider: NetworkProvider, args: string[]) {
    const ui = provider.ui();

    const collectionAddr = Address.parse(args[0] ?? await ui.input('Collection address'));
    const recipientAddr  = Address.parse(args[1] ?? await ui.input('Recipient wallet address'));
    const metaUri         = args[2] ?? await ui.input('Metadata URI (https://...)');

    if (!(await provider.isContractDeployed(collectionAddr))) {
        ui.write(`Error: contract at ${collectionAddr} is not deployed!`);
        return;
    }

    const collection = provider.open(Collection.fromAddress(collectionAddr));
    const indexBefore = await collection.getNextItemIndex();
    ui.write(`nextItemIndex before mint: ${indexBefore}`);

    const content = beginCell()
        .storeUint(0x01, 8)
        .storeStringTail(metaUri)
        .endCell();

    await collection.send(
        provider.sender(),
        { value: toNano('0.1') },
        {
            $$type:  'Mint',
            queryId: BigInt(Date.now()),
            index:   indexBefore,
            owner:   recipientAddr,
            content,
        }
    );

    ui.write('Transaction sent. Waiting for nextItemIndex to increment…');

    let indexAfter = await collection.getNextItemIndex();
    let attempt = 1;
    while (indexAfter === indexBefore) {
        ui.setActionPrompt(`Attempt ${attempt} — waiting…`);
        await sleep(2000);
        indexAfter = await collection.getNextItemIndex();
        attempt++;
    }

    ui.clearActionPrompt();
    ui.write(`✅ NFT minted! nextItemIndex is now ${indexAfter}`);
}
