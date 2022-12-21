import type { Debugger } from "debug";
import type { Component } from "solid-js";

declare global {
  interface Window {
    _$DEBUG: Debugger;
    _$HY: {
      island(path: string, compLoader: () => Promise<{ default: Component }>): void;
      islandMap: { [path: string]: () => Promise<{ default: Component }> };
      hydrateIslands(): void;
      fe(id: string): void;
    };
  }

  interface RequestInit {
    duplex?: "half";
  }
}

type Adapter = {
  start(): void;
  build(): void;
  dev?(): void;
};

export type StartOptions = {
  adapter: string | Adapter;
  appRoot: string;
  routesDir: string;
  ssr: boolean;
  islands: boolean;
  islandsRouter: boolean;
  lazy: boolean;
  prerenderRoutes: string[];
  inspect: boolean;
  pageExtensions: string[];
  root: string;
  clientEntry: string;
  serverEntry: string;
  appRootFile: string;
};

export {};
