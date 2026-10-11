import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const directory = new URL('../public/icons/', import.meta.url);
await mkdir(directory, { recursive: true });
const artwork = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#153b3b"/>
  <path d="M144 242 256 148 368 242" fill="none" stroke="#e3aa34" stroke-width="24" stroke-linejoin="round"/>
  <path d="M169 249v112h174V249" fill="none" stroke="#ffffff" stroke-width="24"/>
  <path d="M238 361v-72h36v72" fill="none" stroke="#ffffff" stroke-width="20"/>
</svg>`);
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['icon-maskable.png', 512], ['apple-touch-icon.png', 180]]) {
  await sharp(artwork).resize(size, size).png().toFile(fileURLToPath(new URL(name, directory)));
}
