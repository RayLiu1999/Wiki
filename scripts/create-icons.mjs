import { mkdir, readFile } from 'node:fs/promises';
import sharp from 'sharp';
const svg = await readFile('public/favicon.svg');
await mkdir('public/icons', { recursive: true });
for (const size of [192, 512]) await sharp(svg).resize(size, size).png().toFile('public/icons/icon-' + size + '.png');
await sharp(svg).resize(180, 180).png().toFile('public/icons/apple-touch-icon.png');
const mask = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#7357ce"/><g transform="translate(112 112) scale(2.25)"><g fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="m64 30 35 20-35 20-35-20 35-20Z"/><path d="m29 66 35 20 35-20M29 82l35 20 35-20"/></g></g></svg>';
await sharp(Buffer.from(mask)).resize(512, 512).png().toFile('public/icons/maskable-512.png');
