const crypto = require('crypto');

function generateNumber(len = 6) {
  let out = '';
  for (let i = 0; i < len; i++) out += String(crypto.randomInt(0, 10));
  return out;
}
module.exports = { generateNumber };