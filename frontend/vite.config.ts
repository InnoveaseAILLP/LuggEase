import {defineConfig} from 'vite';
import path from 'node:path';
export default defineConfig({
  esbuild:{jsx:'automatic'},
  resolve:{alias:[
    {find:'react-native-config', replacement:path.resolve(__dirname,'src/env-config.web.ts')},
    {find:/^react-native$/, replacement:'react-native-web'},
    {find:'@', replacement:path.resolve(__dirname)},
  ], extensions:['.web.tsx','.web.ts','.web.jsx','.web.js','.tsx','.ts','.jsx','.js','.json']},
  define:{global:'globalThis',__DEV__:JSON.stringify(process.env.NODE_ENV !== 'production'),'process.env.NODE_ENV':JSON.stringify(process.env.NODE_ENV || 'development')},
  optimizeDeps:{esbuildOptions:{loader:{'.js':'jsx'}, resolveExtensions:['.web.tsx','.web.ts','.web.jsx','.web.js','.tsx','.ts','.jsx','.js','.json']}},
  build:{outDir:'dist'},
});
