import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Vite 8 usa Rolldown, que exige que manualChunks sea una función.
        // Separa las dependencias grandes en archivos propios para que el
        // navegador las cachee: al actualizar la aplicación, el usuario no
        // vuelve a descargar React ni Supabase.
        manualChunks(id) {
          if (!id.includes('node_modules')) return

          if (id.includes('jspdf') || id.includes('html2canvas') || id.includes('dompurify')) {
            return 'pdf'
          }
          if (id.includes('@supabase')) {
            return 'supabase'
          }
          if (id.includes('react-router') || id.includes('/react/') || id.includes('react-dom')) {
            return 'react'
          }
        },
      },
    },
  },
})