/**
 * Cloudflare Pages variant (optional).
 *
 * The primary deployment for this project is a Worker with static assets —
 * see wrangler.jsonc and src/index.js. This file exists only so the very same
 * app can also be deployed with `wrangler pages deploy`, which uses file-based
 * routing instead of a Worker script.
 *
 * It contains no logic of its own; it delegates to the shared proxy module, so
 * both deployment shapes behave identically.
 *
 * Route: /proxy/*
 *
 * Note the double brackets: Cloudflare Pages uses [[name]].js for a catch-all
 * that matches any depth of path, and [name].js for a single segment. This is
 * NOT the Next.js/Vercel [...name].js spelling, which Wrangler rejects with
 * "Invalid Pages function route parameter".
 */

import { handleProxy } from "../../src/proxy.js";

export async function onRequest(context) {
	return handleProxy(context.request, context.env, new URL(context.request.url));
}
