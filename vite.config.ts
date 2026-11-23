import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localWranglerPath = path.resolve(__dirname, 'wrangler.jsonc');
const configPath = fs.existsSync(localWranglerPath)
  ? './wrangler.jsonc'
  : './wrangler.example.jsonc';

export default defineConfig({
  plugins: [
    react(),
    cloudflare({
      configPath,
    }),
  ],
});
