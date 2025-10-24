import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// IMPORTANT: If your repo name is different than BCLL_Draft, change the base below to '/<YourRepoName>/'
export default defineConfig({
  plugins: [react()],
  base: '/BCLL_Draft/',
})
