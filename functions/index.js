// GET /  →  the portfolio, with the live data injected so it renders with no extra request
import { renderPage } from "../lib/site.js";

export const onRequestGet = (ctx) => renderPage(ctx.env, ctx.request, undefined, ctx.waitUntil.bind(ctx));
