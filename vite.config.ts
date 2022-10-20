import { resolve } from "path";
import mdx from "solid-start-mdx";
import netlify from "solid-start-netlify";
import solid from "solid-start/vite";
import { defineConfig } from "vite";

export default defineConfig({
  css: {
    postcss: {
      plugins: [(await import("tailwindcss")).default]
    }
  },
  plugins: [
    await mdx(),
    solid({
      rootEntry: resolve("docs.root.tsx"),
      appRoot: "./docs",
      routesDir: ".",
      islandsRouter: true,
      islands: true,
      extensions: [".mdx", ".md"],
      adapter: netlify({ edge: true })
    })
  ]
});
