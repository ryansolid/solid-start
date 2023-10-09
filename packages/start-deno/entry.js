import { lookup } from "https://deno.land/x/media_types/mod.ts";
import manifest from "../../dist/public/route-manifest.json";
import handler from "./entry-server";

import { serve } from "https://deno.land/std@0.139.0/http/server.ts";

serve(
  async (request, connInfo) => {
    const { pathname } = new URL(request.url);
    console.log(pathname);

    // This is how the server works:
    // 1. A request comes in for a specific asset.
    // 2. We read the asset from the file system.
    // 3. We send the asset back to the client.

    try {
      const file = await Deno.readFile(`./public${pathname}`);
      const isAsset = pathname.startsWith("/assets/");

      // Respond to the request with the style.css file.
      return new Response(file, {
        headers: {
          "content-type": lookup(pathname),
          ...(isAsset
            ? {
                "cache-control": "public, immutable, max-age=31536000"
              }
            : {})
        }
      });
    } catch (e) {}

    const env = {
      manifest,
      getStaticHTML: async path => {
        console.log(path);
        let text = await Deno.readFile(`./public${path}.html`);
        return new Response(text, {
          headers: {
            "content-type": "text/html"
          }
        });
      }
    }

    function internalFetch(route, init = {}) {
      if (route.startsWith("http")) {
        return fetch(route, init);
      }

      let url = new URL(route, "http://internal");
      const request = new Request(url.href, init);
      return handler({
        request,
        clientAddress: connInfo?.remoteAddr?.hostname,
        locals: {},
        env,
        fetch: internalFetch
      });
    }

    return await handler({
      request,
      clientAddress: connInfo?.remoteAddr?.hostname,
      locals: {},
      env,
      fetch: internalFetch
    });
  },
  {
    port: Number(Deno.env.get("PORT") ?? "8080")
  }
);
