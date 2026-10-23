/**
 * The proxy half of JustWatch Search, shared by both Cloudflare deployment shapes:
 *
 *   - Workers static assets -> src/index.js
 *   - Pages Functions       -> functions/proxy/[...url].js
 *
 * It replaces the old standalone Node/Express `cors-proxy` container. That proxy is
 * still needed in some form because apis.justwatch.com answers OPTIONS preflights
 * WITHOUT an Access-Control-Allow-Origin header, so a browser may not call it directly.
 *
 * Two proxy URL shapes are accepted:
 *   /proxy/apis.justwatch.com/graphql            <- preferred (no "://" inside a path)
 *   /proxy/https://apis.justwatch.com/graphql    <- legacy, kept for compatibility
 * A `Target-URL` request header is also honoured, matching the original cors-proxy.
 */

export const PROXY_PREFIX = "/proxy/";

/** Upstream hosts this proxy is willing to talk to. Overridable via the ALLOWED_UPSTREAM_HOSTS var. */
const DEFAULT_ALLOWED_HOSTS = ["apis.justwatch.com"];

/**
 * Request headers copied through to the upstream API.
 * Deliberately a small allowlist — forwarding everything leaks cookies and
 * Cloudflare-internal headers (CF-Connecting-IP, CF-IPCountry, ...) upstream.
 */
const FORWARDED_REQUEST_HEADERS = [
	"content-type",
	"accept",
	"accept-language",
	"authorization",
	"user-agent",
	"graphql-client-name",
	"graphql-client-version",
];

/** Response headers that must not be copied back verbatim. */
const STRIPPED_RESPONSE_HEADERS = [
	// Hop-by-hop headers are invalid to forward.
	"connection",
	"keep-alive",
	"proxy-authenticate",
	"proxy-authorization",
	"te",
	"trailer",
	"transfer-encoding",
	"upgrade",
	// workerd hands us an already-decompressed body stream, so these two would
	// describe a payload we are no longer sending. Cloudflare recomputes them.
	"content-encoding",
	"content-length",
	// We set our own CORS headers below; never echo the upstream's.
	"access-control-allow-origin",
	"access-control-allow-credentials",
	"access-control-allow-methods",
	"access-control-allow-headers",
];

/* ------------------------------------------------------------------ *
 * Proxy
 * ------------------------------------------------------------------ */

export async function handleProxy(request, env, url) {
	const allowOrigin = resolveAllowedOrigin(request, env, url);

	// CORS preflight — answer it ourselves, never forward it upstream.
	if (request.method === "OPTIONS") {
		return new Response(null, { status: 204, headers: buildCorsHeaders(request, allowOrigin) });
	}

	if (allowOrigin === null) {
		return jsonResponse(
			403,
			{ error: "Origin not allowed to use this proxy." },
			request,
			env,
			url
		);
	}

	const target = parseTargetUrl(request, url);
	if (!target) {
		return jsonResponse(
			400,
			{
				error: "No upstream URL found.",
				usage: [
					`${url.origin}${PROXY_PREFIX}<host>/<path>`,
					`${url.origin}${PROXY_PREFIX}https://<host>/<path>`,
				],
				example: `${url.origin}${PROXY_PREFIX}apis.justwatch.com/graphql`,
			},
			request,
			env,
			url,
			allowOrigin
		);
	}

	const allowedHosts = listFromEnv(env.ALLOWED_UPSTREAM_HOSTS, DEFAULT_ALLOWED_HOSTS);
	if (!allowedHosts.includes(target.hostname.toLowerCase())) {
		return jsonResponse(
			403,
			{
				error: `Host "${target.hostname}" is not on this proxy's allowlist.`,
				allowedHosts,
				hint: "Set the ALLOWED_UPSTREAM_HOSTS variable (comma-separated) in wrangler.jsonc to change this.",
			},
			request,
			env,
			url,
			allowOrigin
		);
	}

	const headers = new Headers();
	for (const name of FORWARDED_REQUEST_HEADERS) {
		const value = request.headers.get(name);
		if (value) headers.set(name, value);
	}

	const init = { method: request.method, headers, redirect: "follow" };
	if (request.method !== "GET" && request.method !== "HEAD") {
		init.body = request.body;
	}

	let upstream;
	try {
		upstream = await fetch(target.toString(), init);
	} catch (err) {
		return jsonResponse(
			502,
			{ error: "Upstream request failed.", detail: String(err && err.message ? err.message : err), target: target.toString() },
			request,
			env,
			url,
			allowOrigin
		);
	}

	const responseHeaders = new Headers();
	for (const [name, value] of upstream.headers) {
		if (!STRIPPED_RESPONSE_HEADERS.includes(name.toLowerCase())) {
			responseHeaders.set(name, value);
		}
	}
	applyCorsHeaders(responseHeaders, request, allowOrigin);

	return new Response(upstream.body, {
		status: upstream.status,
		statusText: upstream.statusText,
		headers: responseHeaders,
	});
}

/**
 * Resolves the value for Access-Control-Allow-Origin.
 *
 * Returns:
 *   "*"      — caller sent no Origin (curl, server-to-server, same-origin GET)
 *   <origin> — caller's origin is permitted, echo it back
 *   null     — caller's origin is NOT permitted; reject the request
 *
 * Default policy is same-origin only, so a public deployment cannot be used as
 * an open CORS proxy by third-party sites. Loosen it with ALLOWED_ORIGINS
 * (comma-separated list) or ALLOW_EXTERNAL_ORIGINS="true".
 */
function resolveAllowedOrigin(request, env, url) {
	const origin = request.headers.get("Origin");
	if (!origin) return "*";

	const configured = listFromEnv(env.ALLOWED_ORIGINS, []);
	if (configured.length > 0) {
		return configured.includes(origin.toLowerCase()) ? origin : null;
	}

	if (String(env.ALLOW_EXTERNAL_ORIGINS || "").toLowerCase() === "true") {
		return origin;
	}

	let originHost;
	try {
		originHost = new URL(origin).host;
	} catch {
		return null;
	}
	return originHost === url.host ? origin : null;
}

/**
 * Extracts the upstream URL from the request.
 * Accepts the clean "/proxy/<host>/<path>" form, the legacy
 * "/proxy/https://<host>/<path>" form, and a "Target-URL" header
 * (the convention used by the original cors-proxy this replaces).
 */
function parseTargetUrl(request, url) {
	const rest = decodeSlashes(url.pathname.slice(PROXY_PREFIX.length));
	const search = url.search || "";

	// 1) Explicit Target-URL header wins, matching the original cors-proxy.
	const headerTarget = request.headers.get("Target-URL");
	if (headerTarget) {
		return toUrl(headerTarget.replace(/\/+$/, "") + "/" + rest + search);
	}

	if (!rest) return null;

	// 2) Legacy form: a full URL embedded in the path.
	if (/^https?:\/\//i.test(rest)) {
		return toUrl(rest + search);
	}

	// 3) Clean form: <host>/<path>.
	const slash = rest.indexOf("/");
	const host = slash === -1 ? rest : rest.slice(0, slash);
	const path = slash === -1 ? "/" : rest.slice(slash);
	// Permissive on purpose: hostname, optional port, single-label names allowed.
	// The real gate is the allowlist check in handleProxy, so anything unwanted
	// gets a clear 403 "not on this proxy's allowlist" rather than a vague 400.
	if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:\d{1,5})?$/i.test(host)) {
		return null;
	}
	return toUrl("https://" + host + path + search);
}

/**
 * Repairs a scheme whose slashes were collapsed by an intermediary
 * (nginx's merge_slashes, some CDNs, or .NET's Uri combiner) so that
 * "https:/apis.justwatch.com/x" is read as "https://apis.justwatch.com/x".
 * Kept from the original Node proxy, which needed the same fix.
 */
function decodeSlashes(path) {
	return path.replace(/^(https?):\/+(?=[^/])/i, "$1://");
}

function toUrl(raw) {
	try {
		const parsed = new URL(raw);
		if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
		return parsed;
	} catch {
		return null;
	}
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function buildCorsHeaders(request, allowOrigin) {
	const headers = new Headers();
	applyCorsHeaders(headers, request, allowOrigin);
	return headers;
}

function applyCorsHeaders(headers, request, allowOrigin) {
	const origin = allowOrigin || "*";
	headers.set("Access-Control-Allow-Origin", origin);
	headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
	headers.set(
		"Access-Control-Allow-Headers",
		request.headers.get("Access-Control-Request-Headers") ||
			"Content-Type, Accept, Authorization, Target-URL, GraphQL-Client-Name, GraphQL-Client-Version"
	);
	headers.set("Access-Control-Max-Age", "86400");
	if (origin !== "*") {
		// Required, otherwise the CDN can serve a cached allow-origin to the wrong
		// site. Appended rather than set so an upstream "Vary: Accept-Encoding"
		// survives — but deduped, since JustWatch already sends Vary: Origin.
		const vary = headers.get("Vary");
		const alreadyVariesOnOrigin =
			!!vary && vary.split(",").some((token) => token.trim().toLowerCase() === "origin");
		if (!alreadyVariesOnOrigin) {
			headers.append("Vary", "Origin");
		}
	}
}

function jsonResponse(status, payload, request, env, url, allowOrigin) {
	const headers = new Headers({ "Content-Type": "application/json; charset=utf-8" });
	applyCorsHeaders(headers, request, allowOrigin === undefined ? resolveAllowedOrigin(request, env, url) : allowOrigin);
	return new Response(JSON.stringify(payload, null, 2), { status, headers });
}

function listFromEnv(value, fallback) {
	if (!value) return fallback;
	const list = String(value)
		.split(",")
		.map((item) => item.trim().toLowerCase())
		.filter(Boolean);
	return list.length > 0 ? list : fallback;
}
