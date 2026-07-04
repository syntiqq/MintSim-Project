import { Address, toNano } from '@ton/core';
import { Collection }        from '../build/Collection/Collection_Collection';
import { NetworkProvider }   from '@ton/blueprint';

export async function run(provider: NetworkProvider, args: string[]) {
    const ui = provider.ui();

    const addressStr = args[0] ?? await ui.input('Collection address');
    const collectionAddress = Address.parse(addressStr);

    const collection = provider.open(
        Collection.fromAddress(collectionAddress)
    );

    const state = await provider.provider(collectionAddress).getState();
    const balanceNano = state.balance;

    console.log('Collection address:', collectionAddress.toString());
    console.log('Current balance:   ', Number(balanceNano) / 1e9, 'TON');

    const RESERVE = toNano('0.05');

    if (balanceNano <= RESERVE) {
        console.log('⚠️  Balance too low to withdraw (below reserve). Nothing to do.');
        return;
    }

    const amountToWithdraw = balanceNano - RESERVE;

    console.log('Withdrawing:       ', Number(amountToWithdraw) / 1e9, 'TON');
    console.log('Reserve kept:       0.05 TON (for contract storage fees)');

    const confirmed = await ui.input('Type "yes" to confirm withdrawal');
    if (confirmed.trim().toLowerCase() !== 'yes') {
        console.log('Cancelled.');
        return;
    }

    const destinationStr = args[1] ?? await ui.input('Destination wallet address (where to send TON)');

    await collection.send(
        provider.sender(),
        { value: toNano('0.02') },
        {
            $$type: 'Withdraw',
            amount: amountToWithdraw,
            destination: Address.parse(destinationStr),
        },
    );
    console.log('✅ Withdraw message sent. Check your wallet balance in ~10-20 sec.');
}