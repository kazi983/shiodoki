// electron.vite.config.ts
import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
var __electron_vite_injected_dirname = "/home/kazi/Documents/projects/shiodoki/desktop";
var shared = { "@shared": resolve(__electron_vite_injected_dirname, "src/shared") };
var electron_vite_config_default = defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: shared },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: shared },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__electron_vite_injected_dirname, "src/preload/index.ts"),
          // Hidden window that runs the Firebase SDK
          data: resolve(__electron_vite_injected_dirname, "src/preload/data.ts"),
        },
      },
    },
  },
  renderer: {
    resolve: { alias: shared },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__electron_vite_injected_dirname, "src/renderer/index.html"),
          data: resolve(__electron_vite_injected_dirname, "src/renderer/data.html"),
        },
      },
    },
  },
});
export { electron_vite_config_default as default };
