import type { MetadataRoute } from "next";

/** Static PWA manifest (no DB, no request data). Colours = tokens.css (--teal, --ground). No service worker. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "TagMyCredit",
    short_name: "TagMyCredit",
    description: "Tag trade credit, see buyer risk, protect revenue.",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    background_color: "#F6F9F9",
    theme_color: "#0B3D3A",
    lang: "en",
    dir: "ltr",
    categories: ["business", "finance"],
    icons: [
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Check a buyer", url: "/check", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Monthly snapshots", url: "/snapshots", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
