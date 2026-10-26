// GET /stack  →  index of every stack and the projects behind it
import { renderPage } from "../../lib/site.js";

export const onRequestGet = ({ request, env }) => renderPage(env, request, "");
