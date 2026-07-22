/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_KEEL_PRO_CHECKOUT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
