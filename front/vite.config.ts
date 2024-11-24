import react from '@vitejs/plugin-react-swc';
import path from 'path';
import { defineConfig } from 'vite';
import svgr from 'vite-plugin-svgr';

// https://vite.dev/config/
export default defineConfig({
  server: {
    // port: 80,
    // host: '0.0.0.0',
    // open: true,
    // proxy: {
    //   // /api로 시작하는 모든 요청을 백엔드로 프록시
    //   '/': {
    //     target: 'http://localhost:8080', // 백엔드 서버 주소 (NestJS 서버)
    //     changeOrigin: true, // CORS 헤더 설정을 자동으로 처리
    //   },
    // },
  },
  plugins: [react(), svgr()],
  resolve: {
    alias: [{ find: '@', replacement: path.resolve(__dirname, 'src') }],
  },
});
