/**
 * Cloudflare Workers entry point — the single program.
 *
 * Serves the published Blazor WebAssembly app AND proxies /proxy/* to the
 * upstream JustWatch API. Static files that exist on disk are served directly
 * from Cloudflare's edge without invoking this script at all (see
 * assets.run_worker_first in wrangler.jsonc), so the only requests that cost
 * Worker invocations are the API calls.
 */

import { PROXY_PREFIX, handleProxy } from "./proxy.js";

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);

		if (url.pathname === "/proxy" || url.pathname.startsWith(PROXY_PREFIX)) {
			return handleProxy(request, env, url);
		}

		// Blazor app. Deep links such as /title/tm305113 and /search?q=dune have no
		// matching file, so assets.not_found_handling = "single-page-application"
		// returns index.html and Blazor's client-side router takes over.
		return env.ASSETS.fetch(request);
	},
};
