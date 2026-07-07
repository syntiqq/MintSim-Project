import { Address, beginCell, toNano } from '@ton/core';
import { Collection }                  from '../build/Collection/Collection_Collection';
import { NetworkProvider }             from '@ton/blueprint';

export async function run(provider: NetworkProvider, args: string[]) {
    const ui = provider.ui();

    const collectionAddr = Address.parse(args[0] ?? await ui.input('Collection address'));
    const recipientAddr  = Address.parse(args[1] ?? await ui.input('Recipient wallet address'));
    const metaUri         = args[2] ?? await ui.input('Metadata URI (https://...)');

    const collection = provider.open(Collection.fromAddress(collectionAddr));
    const index = await collection.getNextItemIndex();

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
            index,
            owner:   recipientAddr,
            content,
        }
    );

    ui.write(`✅ Mint sent! NFT index: ${index}`);
}
