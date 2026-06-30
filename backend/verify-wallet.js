const { mnemonicToPrivateKey } = require('@ton/crypto');
const { WalletContractV4, WalletContractV5R1 } = require('@ton/ton');

const MNEMONIC = "festival season multiply term damp nation palace april avocado baby horror symptom certain alert media spot any life into pumpkin hat void engage wait";
(async () => {
    const words = MNEMONIC.trim().split(/\s+/);
    console.log(words);
    console.log('number of words:', words.length);

    const keys = await mnemonicToPrivateKey(words);
    console.log('public key (hex):', keys.publicKey.toString('hex'));

    const v4 = WalletContractV4.create({ publicKey: keys.publicKey, workchain: 0 });
    const v5 = WalletContractV5R1.create({ publicKey: keys.publicKey, workchain: 0 });

    console.log('adress V4:  ', v4.address.toString());
    console.log('adress V5R1:', v5.address.toString());

})();