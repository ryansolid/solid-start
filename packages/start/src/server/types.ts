import type { JSX } from "solid-js";
import { RequestEvent } from "solid-js/web";
import { HTTPEvent } from "vinxi/http";

// export const FETCH_EVENT = "$FETCH";

export type DocumentComponentProps = {
  assets: JSX.Element;
  scripts: JSX.Element;
  children?: JSX.Element;
};

export type Asset = {
  tag: "style";
  attrs: JSX.StyleHTMLAttributes<HTMLStyleElement> & { key?: string };
  children?: JSX.Element;
} | {
  tag: "script";
  attrs: JSX.ScriptHTMLAttributes<HTMLScriptElement> & { key?: string };
} | {
  tag: "link";
  attrs: JSX.LinkHTMLAttributes<HTMLLinkElement> & { key?: string };
};

export type HandlerOptions = {
  mode?: "sync" | "async" | "stream";
  nonce?: string;
  renderId?: string;
  onCompleteAll?: (options: { write: (v: any) => void }) => void;
  onCompleteShell?: (options: { write: (v: any) => void }) => void;
};

export type ContextMatches = {
  originalPath: string;
  pattern: string;
  path: string;
  params: unknown;
};

export interface ResponseStub {
  status?: number;
  statusText?: string;
  headers: Headers;
}

export interface FetchEvent {
  request: Request;
  response: ResponseStub;
  clientAddress?: string;
  locals: App.RequestEventLocals;
  nativeEvent: HTTPEvent;
}

export interface PageEvent extends RequestEvent {
  manifest: any;
  assets: any;
  routes: any[];
  // prevUrl: string | null;
  // $type: typeof FETCH_EVENT;
  $islands: Set<string>;
  complete: boolean;
  // mutation: boolean;
}

export interface APIEvent extends FetchEvent {
  params: { [key: string]: string };
}

export interface APIHandler {
  (event: APIEvent): Promise<any>;
}

export interface ServerFunctionMeta {
  id: string;
}

declare module "solid-js/web" {
  interface RequestEvent extends FetchEvent {
    serverOnly?: boolean;
  }
}
