// Pinata 
const axios     = require('axios');
const FormData   = require('form-data');

const GATEWAY = process.env.PINATA_GATEWAY || 'https://gateway.pinata.cloud/ipfs/';

function assertConfigured() {
    if (!process.env.PINATA_JWT) {
        throw new Error('PINATA_JWT is not set — get one from pinata.cloud → API Keys');
    }
}

/** Pin a JSON object (e.g. NFT metadata) to IPFS via Pinata. */
async function pinJson(json, name = 'metadata.json') {
    assertConfigured();
    const res = await axios.post(
        'https://api.pinata.cloud/pinning/pinJSONToIPFS',
        { pinataMetadata: { name }, pinataContent: json },
        { headers: { Authorization: `Bearer ${process.env.PINATA_JWT}` } }
    );
    const cid = res.data.IpfsHash;
    return { cid, uri: `ipfs://${cid}`, gatewayUrl: `${GATEWAY}${cid}` };
}

async function pinFile(buffer, filename) {
    assertConfigured();
    const form = new FormData();
    form.append('file', buffer, { filename });
    const res = await axios.post(
        'https://api.pinata.cloud/pinning/pinFileToIPFS',
        form,
        {
            headers: { Authorization: `Bearer ${process.env.PINATA_JWT}`, ...form.getHeaders() },
            maxBodyLength: Infinity,
        }
    );
    const cid = res.data.IpfsHash;
    return { cid, uri: `ipfs://${cid}`, gatewayUrl: `${GATEWAY}${cid}` };
}

module.exports = { pinJson, pinFile };
