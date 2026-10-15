import type { MetadataRoute } from "next";

/** Lets the site be added to a phone's home screen with the Salin wallet icon (icons from the mobile app's mark). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Salin",
    short_name: "Salin",
    description: "Know what's fine to spend today.",
    start_url: "/today",
    display: "standalone",
    background_color: "#f5f8f7",
    theme_color: "#0b7a73",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
