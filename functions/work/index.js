// GET /work  →  the project list on the home page
export const onRequestGet = ({ request }) => Response.redirect(new URL("/#work", request.url).toString(), 302);
