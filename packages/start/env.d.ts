// This file is an augmentation to the built-in ImportMeta interface
// Thus cannot contain any top-level imports
// <https://www.typescriptlang.org/docs/handbook/declaration-merging.html#module-augmentation>

/* eslint-disable @typescript-eslint/consistent-type-imports */

declare namespace App {
  // eslint-disable-next-line  @typescript-eslint/no-empty-interface
  export interface RequestEventLocals { }
}

interface ImportMetaEnv extends Record<`VITE_${string}`, any>, SolidStartMetaEnv {
  BASE_URL: string;
  MODE: string;
  DEV: boolean;
  PROD: boolean;
  SSR: boolean;
}

interface SolidStartMetaEnv {
  START_SSR: string;
  START_ISLANDS: string;
  START_DEV_OVERLAY: string;
  SERVER_BASE_URL: string;
}
