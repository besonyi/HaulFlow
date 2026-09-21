/// <reference types="vite/client" />

import type { CarHaulerApi } from "@shared/contracts/ipc";

declare global {
  interface Window {
    carHauler?: CarHaulerApi;
  }
}

export {};
