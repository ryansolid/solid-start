// @refresh skip
import {
  HTTPEvent,
  defineMiddleware,
  sendWebResponse
} from "vinxi/http";
import { getFetchEvent } from "../server/fetchEvent";
import type { FetchEvent } from "../server/types";

/** Function responsible for receiving an observable [operation]{@link Operation} and returning a [result]{@link OperationResult}. */

export type MiddlewareFn = (event: FetchEvent) => Promise<unknown> | unknown;
/** This composes an array of Exchanges into a single ExchangeIO function */

export type RequestMiddleware = (event: FetchEvent) => Response | Promise<Response> | void | Promise<void> | Promise<void | Response>;

// copy-pasted from h3/dist/index.d.ts
type EventHandlerResponse<T = any> = T | Promise<T>;
type ResponseMiddlewareResponseParam = { body?: Awaited<EventHandlerResponse> };

export type ResponseMiddleware = (
  event: FetchEvent,
  response: ResponseMiddlewareResponseParam
) => Response | Promise<Response> | void | Promise<void>;

function wrapRequestMiddleware(onRequest: RequestMiddleware) {
  return async (h3Event: HTTPEvent) => {
    const fetchEvent = getFetchEvent(h3Event);
    const response = await onRequest(fetchEvent);
    if (response) {
      await sendWebResponse(h3Event, response);
    }
  };
}

function wrapResponseMiddleware(onBeforeResponse: ResponseMiddleware) {
  return async (h3Event: HTTPEvent, response: ResponseMiddlewareResponseParam) => {
    const fetchEvent = getFetchEvent(h3Event);
    const mwResponse = await onBeforeResponse(fetchEvent, response);
    if (mwResponse) {
      response.body = mwResponse;
    }
  };
}

export function createMiddleware({
  onRequest,
  onBeforeResponse
}: {
  onRequest?: RequestMiddleware | RequestMiddleware[] | undefined;
  onBeforeResponse?: ResponseMiddleware | ResponseMiddleware[] | undefined;
}) {
  return defineMiddleware({
    onRequest:
      typeof onRequest === "function"
        ? wrapRequestMiddleware(onRequest)
        : Array.isArray(onRequest)
        ? onRequest.map(wrapRequestMiddleware)
        : undefined,
    onBeforeResponse:
      typeof onBeforeResponse === "function"
        ? wrapResponseMiddleware(onBeforeResponse)
        : Array.isArray(onBeforeResponse)
        ? onBeforeResponse.map(wrapResponseMiddleware)
        : undefined
  });
}
