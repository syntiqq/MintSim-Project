const { TonClient, WalletContractV5R1 } = require('@ton/ton');
const { mnemonicToPrivateKey }          = require('@ton/crypto');
const { Address, beginCell, internal, toNano } = require('@ton/core');
const { getOpcode } = require('../utils/opcode');

function isTestnet() {
    return (process.env.TON_NETWORK || 'mainnet') === 'testnet';
}

let _client = null;
function client() {
    if (!_client) {
        _client = new TonClient({
            endpoint: isTestnet()
                ? 'https://testnet.toncenter.com/api/v2/jsonRPC'
                : 'https://toncenter.com/api/v2/jsonRPC',
            apiKey: process.env.TONCENTER_API_KEY,
        });
    }
    return _client;
}

let _walletData = null;
async function adminWallet() {
    if (!_walletData) {
        const words = (process.env.DEPLOYER_MNEMONIC || '').trim().split(/\s+/);
        if (words.length !== 24) {
            throw new Error('DEPLOYER_MNEMONIC must be exactly 24 words — check backend/.env');
        }
        const keys   = await mnemonicToPrivateKey(words);
        const wallet = WalletContractV5R1.create({ publicKey: keys.publicKey, workchain: 0 });
        console.log('🔑 Вычисленный адрес admin-кошелька:', wallet.address.toString());
        console.log('🔑 Публичный ключ (hex):', keys.publicKey.toString('hex'));
        _walletData = { keys, wallet };
    }
    return _walletData;
}

function offchainContentCell(uri) {
    return beginCell().storeUint(0x01, 8).storeStringTail(uri).endCell();
}

/** Reads `get_collection_data()` and returns the current nextItemIndex. */
async function getNextItemIndex() {
    const collectionAddr = Address.parse(process.env.GETGEMS_COLLECTION);
    const res = await client().runMethod(collectionAddr, 'get_collection_data');
    return res.stack.readBigNumber();
}

/**
 * Sends the admin-gated `Mint` message to the Collection contract.
 * Returns { index, nftAddress } once the transaction is confirmed.
 */
async function mintNft({ ownerAddress, metaUri }) {
    const { keys, wallet } = await adminWallet();
    const tonClient = client();
    const opened    = tonClient.open(wallet);

    const collectionAddr = Address.parse(process.env.GETGEMS_COLLECTION);
    const index  = await getNextItemIndex();
    const opcode = getOpcode('Mint');

    const body = beginCell()
        .storeUint(opcode, 32)
        .storeUint(BigInt(Date.now()) % (2n ** 64n), 64)   // queryId
        .storeUint(index, 64)                               // index
        .storeAddress(Address.parse(ownerAddress))           // owner
        .storeRef(offchainContentCell(metaUri))               // content
        .endCell();

    const seqno = await opened.getSeqno();

    await opened.sendTransfer({
        seqno,
        secretKey: keys.secretKey,
        messages: [internal({
            to:    collectionAddr,
            value: toNano('0.1'),
            body,
        })],
    });

    // Wait for the transaction to actually land (seqno bump = confirmed).
    let cur = seqno, attempts = 0;
    while (cur === seqno && attempts < 25) {
        await new Promise(r => setTimeout(r, 2000));
        cur = await opened.getSeqno();
        attempts++;
    }
    if (cur === seqno) {
        throw new Error('Mint transaction did not confirm within 50s — check the admin wallet balance');
    }

    const addrRes = await tonClient.runMethod(
        collectionAddr, 'get_nft_address_by_index', [{ type: 'int', value: index }]
    );
    const nftAddress = addrRes.stack.readAddress();

    return { index, nftAddress: nftAddress.toString() };
}

module.exports = { mintNft, getNextItemIndex };
