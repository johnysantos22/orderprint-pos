import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    tailwindcss(),
    tanstackRouter(),
    react(),
    tsconfigPaths(),
  ],
  server: {
    proxy: {
      // Quando seu código chamar '/evolution-api', o Vite redireciona para sua VM
      '/evolution-api': {
        target: 'http://34.29.78.213:8080', // <--- IP PÚBLICO DA MINHA SUA VM NO GOOGLE CLOUD
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/evolution-api/, '')
      }
    }
  }
});
