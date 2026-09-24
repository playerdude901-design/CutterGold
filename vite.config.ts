import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const removeCrossorigin = () => ({
  name: 'remove-crossorigin',
  transformIndexHtml(html: string) {
    return html.replace(/ crossorigin/g, '');
  }
});

export default defineConfig({
  plugins: [react(), removeCrossorigin()],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})