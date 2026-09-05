import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({base:'/dist-review/',plugins:[react()],build:{outDir:'dist-review',target:'es2022',rollupOptions:{input:'revisao-local.html'}}});
