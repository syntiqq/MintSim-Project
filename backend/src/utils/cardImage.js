const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { formatPhoneNumber } = require('./formatNumber');

let logoCache = null;
function getLogoBase64() {
    if (logoCache !== null) return logoCache;
    try {
        const logoPath = path.resolve(__dirname, '..', '..', 'assets', 'logo.png');
        const buf = fs.readFileSync(logoPath);
        logoCache = `data:image/png;base64,${buf.toString('base64')}`;
    } catch {
        logoCache = null;
    }
    return logoCache;
}

let fontCache = null;
function getFontBase64() {
    if (fontCache !== null) return fontCache;
    try {
        const fontPath = path.resolve(__dirname, '..', '..', 'assets', 'Iosevka-Bold.ttf');
        const buf = fs.readFileSync(fontPath);
        fontCache = buf.toString('base64');
    } catch (e) {
        console.warn('Iosevka font not found, falling back to monospace:', e.message);
        fontCache = null;
    }
    return fontCache;
}

function buildCardSvg(number) {
    const size = 800;
    const logo = getLogoBase64();
    const fontBase64 = getFontBase64();
    const digits = formatPhoneNumber(number); // "XX XXX XXX", без +999

    const logoSize = size * 0.35;
    const logoX = size - logoSize - size * 0.056;
    const logoY = size * 0.056;

    const textLeft = size * 0.07;
    const captionSize = size * 0.030;
    const numberSize  = size * 0.102;
    const bottomY = size - size * 0.042;

    const fontFamily = fontBase64 ? "'Iosevka'" : "'DejaVu Sans Mono', monospace";

    return `
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    ${fontBase64 ? `
    <style>
      @font-face {
        font-family: 'Iosevka';
        src: url(data:font/ttf;base64,${fontBase64}) format('truetype');
        font-weight: 800;
      }
    </style>` : ''}
  </defs>

  <!-- background: rgba(46, 20, 87, 0.89) -->
  <rect width="${size}" height="${size}" fill="#2e1457" fill-opacity="0.89" />

  ${logo ? `<image href="${logo}" x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}"
         preserveAspectRatio="xMidYMid slice" />` : ''}

  <!-- caption "MSIM Number" -->
  <text x="${textLeft}" y="${bottomY}" font-family="${fontFamily}" font-weight="600"
        font-size="${captionSize}" fill="rgba(255,255,255,0.75)" text-anchor="start" letter-spacing="0.03em">MSIM Number</text>

  <!-- строка с цифрами номера -->
  <text x="${textLeft}" y="${bottomY - captionSize * 2.3}" font-family="${fontFamily}" font-weight="800"
        font-size="${numberSize}" fill="#ffffff" text-anchor="start" letter-spacing="0.05em">${digits}</text>

  <!-- +999 отдельной строкой выше -->
  <text x="${textLeft}" y="${bottomY - captionSize * 2.3 - numberSize * 1.15}" font-family="${fontFamily}" font-weight="800"
        font-size="${numberSize}" fill="#ffffff" text-anchor="start" letter-spacing="0.05em">+999</text>
</svg>`.trim();
}

async function renderCardPng(number) {
    const svg = buildCardSvg(number);
    return sharp(Buffer.from(svg)).png().toBuffer();
}

module.exports = { renderCardPng };