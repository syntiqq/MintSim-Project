import { Address, beginCell, toNano } from '@ton/core';
import { Collection } from '../build/Collection/Collection_Collection';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider, args: string[]) {
    const ui = provider.ui();

    const addressStr = args[0] ?? await ui.input('Collection address');
    const metadataUri = args[1] ?? await ui.input('New collection metadata URI (https://...)');

    const collection = provider.open(
        Collection.fromAddress(Address.parse(addressStr))
    );

    const newContent = beginCell()
        .storeUint(0x01, 8)
        .storeStringTail(metadataUri)
        .endCell();

    console.log('Updating collection content...');
    console.log('Collection:', addressStr);
    console.log('New URI:', metadataUri);

    await collection.send(
        provider.sender(),
        { value: toNano('0.02') },
        {
            $$type: 'UpdateContent',
            content: newContent,
        }
    );

    console.log('✅ UpdateContent message sent. Getgems may take a few minutes to refresh.');
}