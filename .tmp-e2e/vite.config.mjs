import { defineConfig } from 'vite';
import htPages from '../dist/index.js';

export default defineConfig({
  plugins: [htPages()],
});
