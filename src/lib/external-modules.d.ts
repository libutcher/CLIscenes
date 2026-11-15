/** Modules that only exist in the host site, or after the library build. */
declare module "@docusaurus/useBaseUrl" {
  export default function useBaseUrl(url: string, options?: { absolute?: boolean; forcePrependBaseUrl?: boolean }): string;
}

declare module "cliscenes/style.css";
