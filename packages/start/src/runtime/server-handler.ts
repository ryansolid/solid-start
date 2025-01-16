/// <reference types="vinxi/types/server" />
import { crossSerializeStream, fromJSON, getCrossReferenceHeader } from "seroval";
// @ts-ignore
import {
  CustomEventPlugin,
  DOMExceptionPlugin,
  EventPlugin,
  FormDataPlugin,
  HeadersPlugin,
  ReadableStreamPlugin,
  RequestPlugin,
  ResponsePlugin,
  URLPlugin,
  URLSearchParamsPlugin
} from "seroval-plugins/web";
import { sharedConfig } from "solid-js";
import { renderToString } from "solid-js/web";
import { provideRequestEvent } from "solid-js/web/storage";
import {
  eventHandler,
  parseCookies,
  setHeader,
  setResponseStatus,
  type HTTPEvent
} from "vinxi/http";
import invariant from "vinxi/lib/invariant";
import { cloneEvent, getFetchEvent, mergeResponseHeaders } from "../server/fetchEvent";
import { getExpectedRedirectStatus } from "../server/handler";
import { createPageEvent } from "../server/pageEvent";
// @ts-ignore
import { FetchEvent, PageEvent } from "../server";
// @ts-ignore
import serverFnManifest from "solidstart:server-fn-manifest";

function createChunk(data: string) {
  const encodeData = new TextEncoder().encode(data);
  const bytes = encodeData.length;
  const baseHex = bytes.toString(16);
  const totalHex = "00000000".substring(0, 8 - baseHex.length) + baseHex; // 32-bit
  const head = new TextEncoder().encode(`;0x${totalHex};`);

  const chunk = new Uint8Array(12 + bytes);
  chunk.set(head);
  chunk.set(encodeData, 12);
  return chunk;
}

function serializeToStream(id: string, value: any) {
  return new ReadableStream({
    start(controller) {
      crossSerializeStream(value, {
        scopeId: id,
        plugins: [
          CustomEventPlugin,
          DOMExceptionPlugin,
          EventPlugin,
          FormDataPlugin,
          HeadersPlugin,
          ReadableStreamPlugin,
          RequestPlugin,
          ResponsePlugin,
          URLSearchParamsPlugin,
          URLPlugin
        ],
        onSerialize(data, initial) {
          controller.enqueue(
            createChunk(initial ? `(${getCrossReferenceHeader(id)},${data})` : data)
          );
        },
        onDone() {
          controller.close();
        },
        onError(error) {
          controller.error(error);
        }
      });
    }
  });
}

async function handleServerFunction(h3Event: HTTPEvent) {
  const event = getFetchEvent(h3Event);
  const request = event.request;

  const serverReference = request.headers.get("X-Server-Id");
  const instance = request.headers.get("X-Server-Instance");
  const singleFlight = request.headers.has("X-Single-Flight");
  const url = new URL(request.url);
  let functionId: string | undefined | null, name: string | undefined | null;
  if (serverReference) {
    invariant(typeof serverReference === "string", "Invalid server function");
    [functionId, name] = serverReference.split("#");
  } else {
    functionId = url.searchParams.get("id");
    name = url.searchParams.get("name");
    if (!functionId || !name) throw new Error("Invalid request");
  }
  const serverFnInfo = serverFnManifest[functionId];

  let fnModule: undefined | { [key: string]: any };

  if (process.env.NODE_ENV === "development") {
    fnModule = await (globalThis as any).app
      .getRouter("server-fns")
      .internals.devServer.ssrLoadModule(serverFnInfo.extractedFilename);
  } else {
    fnModule = await serverFnInfo.importer();
  }

  const serverFunction = fnModule![serverFnInfo.functionName];
  let parsed: any[] = [];

  // grab bound arguments from url when no JS
  if (!instance || h3Event.method === "GET") {
    const args = url.searchParams.get("args");
    if (args) {
      const json = JSON.parse(args);
      (json.t
        ? (fromJSON(json, {
            plugins: [
              CustomEventPlugin,
              DOMExceptionPlugin,
              EventPlugin,
              FormDataPlugin,
              HeadersPlugin,
              ReadableStreamPlugin,
              RequestPlugin,
              ResponsePlugin,
              URLSearchParamsPlugin,
              URLPlugin
            ]
          }) as any)
        : json
      ).forEach((arg: any) => parsed.push(arg));
    }
  }
  if (h3Event.method === "POST") {
    const contentType = request.headers.get("content-type");

    // Nodes native IncomingMessage doesn't have a body,
    // But we need to access it for some reason (#1282)
    type EdgeIncomingMessage = typeof h3Event.node.req & { body?: BodyInit };
    const h3Request = h3Event.node.req as EdgeIncomingMessage | ReadableStream;

    // This should never be the case in "proper" Nitro presets since node.req has to be IncomingMessage,
    // But the new azure-functions preset for some reason uses a ReadableStream in node.req (#1521)
    const isReadableStream = h3Request instanceof ReadableStream;
    const hasReadableStream = (h3Request as EdgeIncomingMessage).body instanceof ReadableStream;
    const isH3EventBodyStreamLocked =
      (isReadableStream && h3Request.locked) ||
      (hasReadableStream && ((h3Request as EdgeIncomingMessage).body as ReadableStream).locked);
    const requestBody = isReadableStream ? h3Request : h3Request.body;

    if (
      contentType?.startsWith("multipart/form-data") ||
      contentType?.startsWith("application/x-www-form-urlencoded")
    ) {
      // workaround for https://github.com/unjs/nitro/issues/1721
      // (issue only in edge runtimes and netlify preset)
      parsed.push(
        await (isH3EventBodyStreamLocked
          ? request
          : new Request(request, { ...request, body: requestBody })
        ).formData()
      );
      // what should work when #1721 is fixed
      // parsed.push(await request.formData);
    } else if (contentType?.startsWith("application/json")) {
      // workaround for https://github.com/unjs/nitro/issues/1721
      // (issue only in edge runtimes and netlify preset)
      const tmpReq = isH3EventBodyStreamLocked
        ? request
        : new Request(request, { ...request, body: requestBody });
      // what should work when #1721 is fixed
      // just use request.json() here
      parsed = fromJSON(await tmpReq.json(), {
        plugins: [
          CustomEventPlugin,
          DOMExceptionPlugin,
          EventPlugin,
          FormDataPlugin,
          HeadersPlugin,
          ReadableStreamPlugin,
          RequestPlugin,
          ResponsePlugin,
          URLSearchParamsPlugin,
          URLPlugin
        ]
      });
    }
  }
  try {
    let result = await provideRequestEvent(event, async () => {
      /* @ts-ignore */
      sharedConfig.context = { event };
      event.locals.serverFunctionMeta = {
        id: functionId + "#" + name
      };
      return serverFunction(...parsed);
    });

    if (singleFlight && instance) {
      result = await handleSingleFlight(event, result);
    }

    // handle responses
    if (result instanceof Response) {
      if (result.headers && result.headers.has("X-Content-Raw")) return result;
      if (instance) {
        // forward headers
        if (result.headers) mergeResponseHeaders(h3Event, result.headers);
        // forward non-redirect statuses
        if (result.status && (result.status < 300 || result.status >= 400))
          setResponseStatus(h3Event, result.status);
        if ((result as any).customBody) {
          result = await (result as any).customBody();
        } else if (result.body == undefined) result = null;
      }
    }

    // handle no JS success case
    if (!instance) return handleNoJS(result, request, parsed);

    setHeader(h3Event, "content-type", "text/javascript");
    return serializeToStream(instance, result);
  } catch (x) {
    if (x instanceof Response) {
      if (singleFlight && instance) {
        x = await handleSingleFlight(event, x);
      }
      // forward headers
      if ((x as any).headers) mergeResponseHeaders(h3Event, (x as any).headers);
      // forward non-redirect statuses
      if ((x as any).status && (!instance || (x as any).status < 300 || (x as any).status >= 400))
        setResponseStatus(h3Event, (x as any).status);
      if ((x as any).customBody) {
        x = (x as any).customBody();
      } else if ((x as any).body == undefined) x = null;
      setHeader(h3Event, "X-Error", "true");
    } else if (instance) {
      const error = x instanceof Error ? x.message : typeof x === "string" ? x : "true";
      setHeader(h3Event, "X-Error", error.replace(/[\r\n]+/g, ""));
    } else {
      x = handleNoJS(x, request, parsed, true);
    }
    if (instance) {
      setHeader(h3Event, "content-type", "text/javascript");
      return serializeToStream(instance, x);
    }
    return x;
  }
}

function handleNoJS(result: any, request: Request, parsed: any[], thrown?: boolean) {
  const url = new URL(request.url);
  const isError = result instanceof Error;
  let statusCode = 302;
  let headers;
  if (result instanceof Response) {
    headers = new Headers(result.headers);
    if (result.headers.has("Location")) {
      headers.set(
        `Location`,
        new URL(
          result.headers.get("Location")!,
          url.origin + import.meta.env.SERVER_BASE_URL
        ).toString()
      );
      statusCode = getExpectedRedirectStatus(result);
    }
  } else headers = new Headers({ Location: new URL(request.headers.get("referer")!).toString() });
  if (result) {
    headers.append(
      "Set-Cookie",
      `flash=${encodeURIComponent(
        JSON.stringify({
          url: url.pathname + url.search,
          result: isError ? result.message : result,
          thrown: thrown,
          error: isError,
          input: [...parsed.slice(0, -1), [...parsed[parsed.length - 1].entries()]]
        })
      )}; Secure; HttpOnly;`
    );
  }
  return new Response(null, {
    status: statusCode,
    headers
  });
}

let App: any;
function createSingleFlightHeaders(sourceEvent: FetchEvent) {
  // cookie handling logic is pretty simplistic so this might be imperfect
  // unclear if h3 internals are available on all platforms but we need a way to
  // update request headers on the underlying H3 event.

  const headers = new Headers(sourceEvent.request.headers);
  const cookies = parseCookies(sourceEvent.nativeEvent);
  const SetCookies = sourceEvent.response.headers.getSetCookie();
  headers.delete("cookie");
  let useH3Internals = false;
  if (sourceEvent.nativeEvent.node?.req) {
    useH3Internals = true;
    sourceEvent.nativeEvent.node.req.headers.cookie = "";
  }
  SetCookies.forEach(cookie => {
    if (!cookie) return;
    const keyValue = cookie.split(";")[0]!;
    const [key, value] = keyValue.split("=");
    key && value && (cookies[key] = value);
  });
  Object.entries(cookies).forEach(([key, value]) => {
    headers.append("cookie", `${key}=${value}`);
    useH3Internals && (sourceEvent.nativeEvent.node.req.headers.cookie += `${key}=${value};`);
  });

  return headers;
}
async function handleSingleFlight(sourceEvent: FetchEvent, result: any): Promise<Response> {
  let revalidate: string[];
  let url = new URL(sourceEvent.request.headers.get("referer")!).toString();
  if (result instanceof Response) {
    if (result.headers.has("X-Revalidate"))
      revalidate = result.headers.get("X-Revalidate")!.split(",");
    if (result.headers.has("Location"))
      url = new URL(
        result.headers.get("Location")!,
        new URL(sourceEvent.request.url).origin + import.meta.env.SERVER_BASE_URL
      ).toString();
  }
  const event = cloneEvent(sourceEvent) as PageEvent;
  event.request = new Request(url, { headers: createSingleFlightHeaders(sourceEvent) });
  return await provideRequestEvent(event, async () => {
    await createPageEvent(event);
    /* @ts-ignore */
    App || (App = (await import("#start/app")).default);
    /* @ts-ignore */
    event.router.dataOnly = revalidate || true;
    /* @ts-ignore */
    event.router.previousUrl = sourceEvent.request.headers.get("referer");
    try {
      renderToString(() => {
        /* @ts-ignore */
        sharedConfig.context.event = event;
        App();
      });
    } catch (e) {
      console.log(e);
    }

    /* @ts-ignore */
    const body = event.router.data;
    if (!body) return result;
    let containsKey = false;
    for (const key in body) {
      if (body[key] === undefined) delete body[key];
      else containsKey = true;
    }
    if (!containsKey) return result;
    if (!(result instanceof Response)) {
      body["_$value"] = result;
      result = new Response(null, { status: 200 });
    } else if ((result as any).customBody) {
      body["_$value"] = (result as any).customBody();
    }
    result.customBody = () => body;
    result.headers.set("X-Single-Flight", "true");
    return result;
  });
}

export default eventHandler(handleServerFunction);
