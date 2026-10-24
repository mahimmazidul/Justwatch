import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * Type checking runs as its own CI step (`npm run typecheck`) rather than
   * inside `next build`.
   *
   * This is not a way to skip it: it is enforced on every push and currently
   * passes. Running it a second time inside the build process roughly doubles
   * the build's peak memory, because Next additionally generates the
   * .next/types route definitions there, and that was enough to get the build
   * OOM-killed on a machine with about 1 GB of headroom. Separating them keeps
   * the gate and lets the build fit.
   *
   * There is no equivalent eslint key: Next 16 no longer runs ESLint during
   * `next build`, so `npm run lint` in CI is the only place it happens.
   */
  typescript: { ignoreBuildErrors: true },

  images: {
    /*
     * Next's image optimizer runs as a separate Node service, which does not
     * exist inside a Worker, so it has to be turned off for this deployment.
     *
     * Nothing is lost here: every poster and provider icon comes from
     * images.justwatch.com, which already serves purpose-sized JPEGs selected
     * by profile in the GraphQL query (S276 for posters, S100 for icons). The
     * optimizer would only have re-encoded an image that is already the right
     * dimensions.
     *
     * remotePatterns is kept because it still documents the allowed hosts for
     * local `next dev`, where the optimizer does run.
     */
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "images.justwatch.com" },
      { protocol: "https", hostname: "www.justwatch.com" },
    ],
  },
};

export default nextConfig;

/*
 * Wires the local `next dev` server to the Cloudflare runtime, exactly as
 * `opennextjs-cloudflare migrate` does. Without it, getCloudflareContext() has
 * no bindings during development, so the D1 database is unreachable locally.
 * It is a no-op for production builds, which go through the OpenNext worker.
 */
import("@opennextjs/cloudflare").then((m) => m.initOpenNextCloudflareForDev());
