import { createTanStackServerFnPlugin } from "@tanstack/server-functions-plugin";
import defu from "defu";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp, resolve } from "vinxi";
import { normalize } from "vinxi/lib/path";
import { config } from "vinxi/plugins/config";
import solid from "vite-plugin-solid";
import { SolidStartClientFileRouter, SolidStartServerFileRouter } from "./fs-router.js";
import { serverComponents } from "./server-components.js";

const DEFAULT_EXTENSIONS = ["js", "jsx", "ts", "tsx"];

function solidStartClientFsRouter(config) {
  return (router, app) =>
    new SolidStartClientFileRouter(
      {
        dir: resolve.absolute(config.dir, router.root),
        extensions: config.extensions ?? DEFAULT_EXTENSIONS
      },
      router,
      app
    );
}

function solidStartServerFsRouter(config) {
  return (router, app) =>
    new SolidStartServerFileRouter(
      {
        dir: resolve.absolute(config.dir, router.root),
        extensions: config.extensions ?? DEFAULT_EXTENSIONS,
        dataOnly: config.dataOnly
      },
      router,
      app
    );
}
const SolidStartServerFnsPlugin = createTanStackServerFnPlugin({
  // This is the ID that will be available to look up and import
  // our server function manifest and resolve its module
  manifestVirtualImportId: "solidstart:server-fn-manifest",
  client: {
    getRuntimeCode: () =>
      `import { createServerReference } from "${normalize(
        fileURLToPath(new URL("../dist/runtime/server-runtime.js", import.meta.url))
      )}"`,
    replacer: opts =>
      `createServerReference($$fn$$, '${opts.functionId}', '${opts.extractedFilename}')`
  },
  ssr: {
    getRuntimeCode: () =>
      `import { createServerReference } from '${normalize(
        fileURLToPath(new URL("../dist/runtime/server-fns-runtime.js", import.meta.url))
      )}'`,
    replacer: opts =>
      `createServerReference($$fn$$, '${opts.functionId}', '${opts.extractedFilename}')`
  },
  server: {
    getRuntimeCode: () =>
      `import { createServerReference } from '${normalize(
        fileURLToPath(new URL("../dist/runtime/server-fns-runtime.js", import.meta.url))
      )}'`,
    replacer: opts =>
      `createServerReference($$fn$$, '${opts.functionId}', '${opts.extractedFilename}')`
  }
});

export function defineConfig(baseConfig = {}) {
  let { vite = {}, ...start } = baseConfig;
  const extensions = [...DEFAULT_EXTENSIONS, ...(start.extensions || [])];
  start = defu(start, {
    appRoot: "./src",
    routeDir: "./routes",
    ssr: true,
    devOverlay: true,
    experimental: {
      islands: false
    },
    solid: {},
    server: {
      routeRules: {
        "/_build/assets/**": { headers: { "cache-control": "public, immutable, max-age=31536000" } }
      },
      experimental: {
        asyncContext: true
      }
    }
  });
  const routeDir = join(start.appRoot, start.routeDir);
  let server = start.server;
  if (!start.ssr) {
    server = { ...server, prerender: { routes: ["/"] } };
  }
  let entryExtension = ".tsx";
  if (existsSync(join(process.cwd(), start.appRoot, "app.jsx"))) {
    entryExtension = ".jsx";
  }

  return createApp({
    server: {
      compressPublicAssets: {
        brotli: process.versions.bun ? false : true
      },
      ...server
    },
    routers: [
      {
        name: "public",
        type: "static",
        base: "/",
        dir: "./public"
      },
      {
        name: "ssr",
        type: "http",
        link: {
          client: start.experimental.islands ? undefined : "client"
        },
        handler: `${start.appRoot}/entry-server${entryExtension}`,
        middleware: start.middleware,
        routes: solidStartServerFsRouter({ dir: routeDir, extensions, dataOnly: !start.ssr }),
        extensions,
        target: "server",
        plugins: async () => {
          const userConfig =
            typeof vite === "function" ? await vite({ router: "server" }) : { ...vite };
          const plugins = userConfig.plugins || [];
          delete userConfig.plugins;
          return [
            config("user", {
              ...userConfig,
              optimizeDeps: {
                ...(userConfig.optimizeDeps || {}),
                include: [
                  ...(userConfig.optimizeDeps?.include || []),
                  "@solidjs/start > source-map-js",
                  "@solidjs/start > error-stack-parser"
                ]
              }
            }),
            ...plugins,
            SolidStartServerFnsPlugin.ssr,
            start.experimental.islands ? serverComponents.server() : null,
            solid({ ...start.solid, ssr: true, extensions: extensions.map(ext => `.${ext}`) }),
            config("app-server", {
              resolve: {
                alias: {
                  "#start/app": join(process.cwd(), start.appRoot, `app${entryExtension}`),
                  "~": join(process.cwd(), start.appRoot),
                  ...(!start.ssr
                    ? {
                        "@solidjs/start/server": "@solidjs/start/server/spa"
                      }
                    : {}),
                  ...userConfig.resolve?.alias
                }
              },
              cacheDir: "node_modules/.vinxi/server",
              define: {
                "import.meta.env.START_APP": JSON.stringify(
                  `${start.appRoot}/app${entryExtension}`
                ),
                "import.meta.env.START_ISLANDS": JSON.stringify(start.experimental.islands),
                "import.meta.env.SSR": JSON.stringify(true),
                "import.meta.env.START_SSR": JSON.stringify(start.ssr),
                "import.meta.env.START_DEV_OVERLAY": JSON.stringify(start.devOverlay),
                ...userConfig.define
              }
            })
          ];
        }
      },
      {
        name: "client",
        type: "client",
        base: "/_build",
        handler: `${start.appRoot}/entry-client${entryExtension}`,
        ...(start.experimental.islands
          ? {}
          : {
              routes: solidStartClientFsRouter({ dir: routeDir, extensions })
            }),
        extensions,
        target: "browser",
        plugins: async () => {
          const userConfig =
            typeof vite === "function" ? await vite({ router: "client" }) : { ...vite };
          const plugins = userConfig.plugins || [];
          delete userConfig.plugins;
          return [
            config("user", {
              ...userConfig,
              optimizeDeps: {
                ...(userConfig.optimizeDeps || {}),
                include: [
                  ...(userConfig.optimizeDeps?.include || []),
                  "@solidjs/start > source-map-js",
                  "@solidjs/start > error-stack-parser"
                ]
              }
            }),
            ...plugins,
            SolidStartServerFnsPlugin.client,
            start.experimental.islands ? serverComponents.client() : null,
            solid({ ...start.solid, ssr: start.ssr, extensions: extensions.map(ext => `.${ext}`) }),
            config("app-client", {
              resolve: {
                alias: {
                  "#start/app": join(process.cwd(), start.appRoot, `app${entryExtension}`),
                  "~": join(process.cwd(), start.appRoot),
                  ...(start.experimental.islands
                    ? {
                        "@solidjs/start/client": "@solidjs/start/client/islands"
                      }
                    : {}),
                  ...(!start.ssr
                    ? {
                        "@solidjs/start/client": "@solidjs/start/client/spa"
                      }
                    : {}),
                  ...userConfig.resolve?.alias
                }
              },
              cacheDir: "node_modules/.vinxi/client",
              define: {
                "import.meta.env.START_APP": JSON.stringify(
                  `${start.appRoot}/app${entryExtension}`
                ),
                "import.meta.env.START_ISLANDS": JSON.stringify(start.experimental.islands),
                "import.meta.env.SSR": JSON.stringify(false),
                "import.meta.env.START_SSR": JSON.stringify(start.ssr),
                "import.meta.env.START_DEV_OVERLAY": JSON.stringify(start.devOverlay),
                "import.meta.env.SERVER_BASE_URL": JSON.stringify(server?.baseURL ?? ""),
                ...userConfig.define
              }
            })
          ];
        }
      },
      {
        name: "server-fns",
        type: "http",
        base: "/_server",
        handler: normalize(
          fileURLToPath(new URL("../dist/runtime/server-handler.js", import.meta.url))
        ),
        middleware: start.middleware,
        target: "server",
        routes: solidStartServerFsRouter({ dir: routeDir, extensions, dataOnly: !start.ssr }),
        plugins: async () => {
          const userConfig =
            typeof vite === "function" ? await vite({ router: "server-function" }) : { ...vite };
          const plugins = userConfig.plugins || [];
          delete userConfig.plugins;
          return [
            config("user", {
              ...userConfig,
              optimizeDeps: {
                ...(userConfig.optimizeDeps || {}),
                include: [
                  ...(userConfig.optimizeDeps?.include || []),
                  "@solidjs/start > source-map-js",
                  "@solidjs/start > error-stack-parser"
                ]
              },
              cacheDir: "node_modules/.vinxi/server-fns"
            }),
            ...plugins,
            SolidStartServerFnsPlugin.server,
            start.experimental.islands ? serverComponents.server() : null,
            solid({ ...start.solid, ssr: true, extensions: extensions.map(ext => `.${ext}`) }),
            config("app-server", {
              resolve: {
                alias: {
                  "#start/app": join(process.cwd(), start.appRoot, `app${entryExtension}`),
                  "~": join(process.cwd(), start.appRoot),
                  ...(!start.ssr
                    ? {
                        "@solidjs/start/server": "@solidjs/start/server/spa"
                      }
                    : {}),
                  ...userConfig.resolve?.alias
                }
              },
              define: {
                "import.meta.env.START_APP": JSON.stringify(
                  `${start.appRoot}/app${entryExtension}`
                ),
                "import.meta.env.START_ISLANDS": JSON.stringify(start.experimental.islands),
                "import.meta.env.SSR": JSON.stringify(true),
                "import.meta.env.START_SSR": JSON.stringify(start.ssr),
                "import.meta.env.START_DEV_OVERLAY": JSON.stringify(start.devOverlay),
                ...userConfig.define
              }
            })
          ];
        }
      }
    ]
  });
}
