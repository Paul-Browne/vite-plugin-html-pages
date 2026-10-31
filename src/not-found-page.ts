/**
 * Fallback 404 page, used when the project has no `src/404.ht.js`: the
 * build writes it to `404.html`, and the dev server answers a miss with it.
 *
 * The home link has to honour Vite's `base`: on a site served from
 * `/repo/`, a hardcoded `/` sends the visitor to the host root rather
 * than back into the site.
 */
export function defaultNotFoundHtml(base: string): string {
  const home = base.endsWith('/') ? base : `${base}/`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>404 - Page Not Found</title>
    <style>
      :root {
        color-scheme: light dark;
      }
      body {
        margin: 0;
        font-family: system-ui, sans-serif;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 2rem;
      }
      main {
        max-width: 40rem;
        text-align: center;
      }
      h1 {
        font-size: 3rem;
        margin: 0 0 1rem;
      }
      p {
        margin: 0.5rem 0;
        line-height: 1.5;
      }
      a {
        color: inherit;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>404</h1>
      <p>Page not found.</p>
      <p><a href="${home}">Go back home</a></p>
    </main>
  </body>
</html>
`;
}
