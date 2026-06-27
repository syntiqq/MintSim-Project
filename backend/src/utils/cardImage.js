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

function buildCardSvg(number) {
    const size = 800;
    const logo = getLogoBase64();
    const formatted = formatPhoneNumber(number);

    // ── Логотип: квадрат сверху-справа, без скругления, cover ──
    // (как .mint-logo во фронте: width/height 150px на карточке ~430px → ~0.35 от размера)
    const logoSize = size * 0.35;
    const logoX = size - logoSize - size * 0.056; // отступ 24px на 430px карточке
    const logoY = size * 0.056;

    // ── Текст: низ-слева, монослейс, три строки как во фронте ──
    const textLeft = size * 0.051;       // 22px на 430px карточке
    const captionSize = size * 0.030;
    const numberSize  = size * 0.102;    // 44px на 430px карточке
    const bottomY = size - size * 0.042; // 18px отступ снизу

    return `
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <!-- фон карточки: rgba(35, 23, 54, 0.89), как в .mint-card -->
  <rect width="${size}" height="${size}" fill="#231736" fill-opacity="0.89" />

  ${logo ? `<image href="${logo}" x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}"
         preserveAspectRatio="xMidYMid slice" />` : ''}

  <!-- caption "MSIM Number" -->
  <text x="${textLeft}" y="${bottomY}" font-family="sans-serif" font-weight="600"
        font-size="${captionSize}" fill="rgba(255,255,255,0.75)" text-anchor="start" letter-spacing="0.03em">MSIM Number</text>

  <!-- сам номер -->
  <text x="${textLeft}" y="${bottomY - captionSize * 2.3}" font-family="'DejaVu Sans Mono', monospace" font-weight="800"
        font-size="${numberSize}" fill="#ffffff" text-anchor="start" letter-spacing="0.05em">${formatted}</text>

  <!-- префикс +999 -->
  <text x="${textLeft}" y="${bottomY - captionSize * 2.3 - numberSize * 1.15}" font-family="'DejaVu Sans Mono', monospace" font-weight="800"
        font-size="${numberSize}" fill="#ffffff" text-anchor="start" letter-spacing="0.05em">+999</text>
</svg>`.trim();
}

async function renderCardPng(number) {
    const svg = buildCardSvg(number);
    return sharp(Buffer.from(svg)).png().toBuffer();
}

module.exports = { renderCardPng };