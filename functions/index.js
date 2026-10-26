// GET /  →  the portfolio, with the live data injected so it renders with no extra request
import { renderPage } from "../lib/site.js";

export const onRequestGet = ({ request, env }) => renderPage(env, request);
