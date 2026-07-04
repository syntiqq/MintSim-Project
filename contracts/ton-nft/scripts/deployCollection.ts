import { beginCell, toNano } from '@ton/core';
import { Collection }          from '../build/Collection/Collection_Collection';
import { NetworkProvider }     from '@ton/blueprint';


export async function run(provider: NetworkProvider, args: string[]) {
    const ui = provider.ui();

    const metadataUri = args[0] ?? await ui.input('Collection metadata URI (https://... or ipfs://...)');

    const collectionContent = beginCell()
        .storeUint(0x01, 8)            // TEP-64 off-chain tag
        .storeStringTail(metadataUri)
        .endCell();

    const collection = provider.open(
        await Collection.fromInit(provider.sender().address!, collectionContent)
    );

    console.log('Deploying Collection to:', collection.address.toString());

    await collection.send(
        provider.sender(),
        { value: toNano('0.15') },   // enough for mainnet deploy + storage
        null,
    );

    await provider.waitForDeploy(collection.address);

    console.log('✅ Collection deployed at:', collection.address.toString());
    console.log('   Next item index:',        await collection.getNextItemIndex());
    console.log('   Owner:',                  (await collection.getOwner()).toString());
    console.log('\n→ Put this address into:');
    console.log('   backend/.env  → GETGEMS_COLLECTION');
    console.log('   frontend/.env → VITE_COLLECTION_ADDRESS');
    console.log('\n→ Also copy build/Collection/Collection_Collection.abi to backend/abi/Collection.abi.json');
}
