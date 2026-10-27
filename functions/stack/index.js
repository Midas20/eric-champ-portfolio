// GET /stack  →  index of every stack and the projects behind it
import { renderPage } from "../../lib/site.js";

export const onRequestGet = (ctx) => renderPage(ctx.env, ctx.request, "", ctx.waitUntil.bind(ctx));
