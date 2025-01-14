// This file is an augmentation to the built-in ImportMeta interface
// Thus cannot contain any top-level imports
// <https://www.typescriptlang.org/docs/handbook/declaration-merging.html#module-augmentation>

/* eslint-disable @typescript-eslint/consistent-type-imports */

declare namespace App {
  export interface RequestEventLocals {
    [key: string | symbol]: any;
  }
}

interface ImportMetaEnv extends Record<`VITE_${string}`, any>, SolidStartMetaEnv {
  BASE_URL: string;
  MODE: string;
  DEV: boolean;
  PROD: boolean;
  SSR: boolean;
}

interface SolidStartMetaEnv {
  START_SSR: boolean;
  START_ISLANDS: boolean;
  START_DEV_OVERLAY: boolean;
  SERVER_BASE_URL: string;
}
