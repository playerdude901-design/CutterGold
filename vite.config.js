import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const removeCrossorigin = () => ({
  name: 'remove-crossorigin',
  transformIndexHtml(html) {
    return html.replace(/ crossorigin/g, '');
  }
});

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), removeCrossorigin()],
  base: './',
})
