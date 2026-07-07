
//cd contracts/ton-nft && npx blueprint build
//cp build/Collection/Collection_Collection.abi backend/abi/Collection.abi.json

const fs   = require('fs');
const path = require('path');

let cache = null;

function loadAbi() {
    if (cache) return cache;
    const abiPath = path.resolve(__dirname, '..', '..', 'abi', 'Collection.abi.json');
    if (!fs.existsSync(abiPath)) {
        throw new Error(
            'Missing backend/abi/Collection.abi.json. After `npx blueprint build` in ' +
            'contracts/ton-nft, copy build/Collection/Collection_Collection.abi to that path. ' +
            'Or set MINT_OPCODE manually in backend/.env.'
        );
    }
    cache = JSON.parse(fs.readFileSync(abiPath, 'utf8'));
    return cache;
}

function getOpcode(messageName) {
    if (process.env.MINT_OPCODE && messageName === 'Mint') {
        return Number(process.env.MINT_OPCODE);
    }

    const abi = loadAbi();
    const type = (abi.types || []).find(t => t.name === messageName);
    if (!type || type.header == null) {
        throw new Error(
            `Could not find opcode for "${messageName}" in Collection.abi.json. ` +
            `Open the file, search for "${messageName}", and set MINT_OPCODE in .env manually.`
        );
    }
    return type.header;
}

module.exports = { getOpcode };
