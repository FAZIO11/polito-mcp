// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";

const SITE = process.env.SITE_URL ?? "https://polito-mcp.fly.dev";

// https://astro.build/config
export default defineConfig({
  site: SITE,
  integrations: [sitemap()],
  markdown: {
    shikiConfig: {
      theme: "github-dark",
      wrap: false,
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
