import type { IncomingMessage, Server, ServerResponse } from 'node:http';

const { createServer } = require('node:http') as typeof import('node:http');

/**
 * # Hello, World: now with departments
 * This is a demo of **Markdown in Code**: Markdown rendered inside source comments.
 * It is deliberately more layered and documented than a Hello World server needs
 * to be. It is **not an example of the most efficient way to write one**.
 * The extra functions are here to show the documentation, not to improve the greeting.
 *
 * ## Function map
 * | Function | Purpose |
 * | :--- | :--- |
 * | `readOptions` | Read and validate environment settings. |
 * | `escapeHtml` | Escape greeting text before inserting it into HTML. |
 * | `renderPage` | Build the Hello World page. |
 * | `routeRequest` | Choose the response for a method and path. |
 * | `handleRequest` | Send the chosen response through Node HTTP. |
 * | `createHelloServer` | Construct a server without listening yet. |
 * | `reportListening` | Print the actual address after startup. |
 * | `reportFailure` | Report startup errors and set the exit code. |
 * | `startServer` | Construct, configure and start the server. |
 *
 * A tiny Node server, separated into layers so each function has **one job**.
 * It serves *actual HTML*, uses `node:http`, and requires ~~a Kubernetes cluster~~
 * no extra packages. The architecture committee has been asked to remain calm.
 *
 * One responsibility per layer
 * ============================
 * Run this file with **Node 24**: `node demo.ts`.
 * Open <http://127.0.0.1:3000/> after the startup message appears.
 * Stop the server with Ctrl+C. Set `PORT=0` to request an available port.
 *
 * ## A small tour
 * - **Configuration** reads the environment and validates the port.
 *   - `HOST` defaults to `127.0.0.1`; `PORT` defaults to `3000`.
 *   - `GREETING` defaults to `Hello, World!` and is escaped before rendering.
 * + **Presentation** turns a greeting into a complete HTML document.
 * * **Transport** handles HTTP without asking presentation what a socket is.
 *
 * ### Routes
 * | Method | Path | Response |
 * | :--- | :---: | ---: |
 * | `GET` / `HEAD` | `/` | Hello World HTML |
 * | `GET` / `HEAD` | `/health` | `OK` |
 * | `GET` / `HEAD` | Anything else | `404` |
 * | Other methods | Any path | `405` |
 *
 * #### Try it
 * 1. Start the server with `node demo.ts`.
 * 2. Open the root page in your browser.
 * 3. Visit `/health` to confirm that the server has a pulse.
 *
 * - [x] Return Hello World without a framework.
 * - [x] Escape the configurable greeting.
 * - [ ] Resist adding a plugin system before lunch.
 *
 * ##### A word from operations
 * > This service has one dependency: the computer being on.
 * > > We are tracking that as an infrastructure concern.
 *
 * ###### Small print
 * This is a local demo, with no authentication, TLS or production deployment setup.
 *
 * ---
 *
 * A page, not a platform
 * ----------------------
 * Both underlined heading styles are supported, too.
 *
 * ## Browser example
 * ```js
 * const response = await fetch('http://127.0.0.1:3000/');
 * console.log(response.status); // 200: the world has been greeted.
 * ```
 *
 * ## Links and references
 * Read the [Node HTTP documentation][http], inspect the [table notes](./docs/tables.md),
 * or review the [function template](../md-comments/README.md).
 * Bare URL: https://nodejs.org/api/http.html
 * Example email autolink: <developer@example.com>
 * Ctrl+click opens links; an ordinary click reveals this comment for editing.
 *
 * [http]: https://nodejs.org/api/http.html "Node HTTP API"
 */

type ServerOptions = { host: string; port: number; greeting: string };
type Reply = { status: number; contentType: string; body: string; allow?: string };

// **Grouped comments** get a frame, too.
// A second line gives the first line someone to complain to about off-by-one errors.
const defaultGreeting = 'Hello, World!'; // A **trailing comment** keeps its delimiters.

/* **Same-line block comment:** small enough to skip the architectural diagram. */
const defaultHost = '127.0.0.1';

/**
 * ## readOptions(environment) ⇒ {ServerOptions}
 * Reads startup options. Invalid ports fail before we reserve a socket.
 *
 * **Kind:** function
 * **Access:** public
 *
 * ## Parameters
 * - `environment` **{NodeJS.ProcessEnv}** *(optional)* - Defaults to `process.env`.
 *   - `HOST` **{string}** - Bind address; defaults to `127.0.0.1`.
 *   - `PORT` **{string}** - Integer from 0 through 65535; defaults to `3000`.
 *   - `GREETING` **{string}** - Message to put in the page.
 *
 * ## Returns
 * **{ServerOptions}** - Validated host, port and greeting.
 *
 * ## Throws
 * - `RangeError` - If `PORT` is not a valid decimal port number.
 *
 * ## Example
 * ```ts
 * const options = readOptions({ PORT: '0', GREETING: 'Hello, developer!' });
 * ```
 */
function readOptions(environment: NodeJS.ProcessEnv = process.env): ServerOptions {
  const rawPort = environment.PORT ?? '3000';
  const port = Number(rawPort);
  if (!/^\d+$/.test(rawPort) || !Number.isInteger(port) || port < 0 || port > 65535) {
    throw new RangeError('PORT must be an integer between 0 and 65535. Port 65536 remains aspirational.');
  }
  return { host: environment.HOST || defaultHost, port, greeting: environment.GREETING ?? defaultGreeting };
}

/**
 * ## escapeHtml(value) ⇒ {string}
 * Keeps a greeting from promoting itself into executable markup.
 *
 * **Kind:** function
 * **Access:** private
 *
 * ## Parameters
 * - `value` **{string}** - Plain text to insert into HTML.
 *
 * ## Returns
 * **{string}** - Text with ampersands, brackets and quotes escaped.
 *
 * ## Implementation Details
 * 1. Match the five special HTML characters.
 * 2. Replace each using a fixed lookup, without interpreting the input.
 */
function escapeHtml(value: string): string {
  const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return value.replace(/[&<>"']/g, character => entities[character]);
}

/**
 * ## renderPage(greeting) ⇒ {string}
 * Builds the page. No sockets, environment reads or surprise database queries.
 *
 * **Kind:** function
 * **Access:** public
 *
 * ## Parameters
 * - `greeting` **{string}** - Plain text displayed as the main heading.
 *
 * ## Returns
 * **{string}** - A complete UTF-8 HTML document with an escaped greeting.
 *
 * ## Example
 * ```ts
 * const html = renderPage('Hello, World!');
 * ```
 *
 * ## See Also
 * - [Node HTTP][http] - Used by the transport layer, not this function.
 *
 * [http]: https://nodejs.org/api/http.html
 */
function renderPage(greeting: string): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hello, World!</title>
<style>body{font-family:system-ui,sans-serif;max-width:42rem;margin:12vh auto;padding:1.5rem;line-height:1.6}a{color:#185abd}</style></head>
<body><h1>${escapeHtml(greeting)}</h1>
<p>One small server. Several functions. Absolutely no quarterly roadmap required.</p>
<p><a href="/health">Check server health</a></p></body>
</html>`;
}

/**
 * ## routeRequest(method, path, greeting) ⇒ {Reply}
 * Chooses a response without writing to the network.
 *
 * **Kind:** function
 * **Access:** public
 *
 * ## Parameters
 * - `method` **{string}** - HTTP method, such as `GET` or `HEAD`.
 * - `path` **{string}** - Request path, optionally including a query string.
 * - `greeting` **{string}** - Plain text for the home page.
 *
 * ## Returns
 * **{Reply}** - Status, content type and body; `allow` accompanies a 405 response.
 *
 * ## Implementation Details
 * 1. Reject unsupported methods.
 * 2. Ignore the query string when selecting the route.
 * 3. Return the home page, a health response or an honest 404.
 *
 * > A 404 means the route is missing, not that it needs another abstraction.
 */
function routeRequest(method: string, path: string, greeting: string): Reply {
  if (method !== 'GET' && method !== 'HEAD') {
    return { status: 405, contentType: 'text/plain; charset=utf-8', body: 'Method not allowed.\n', allow: 'GET, HEAD' };
  }
  const pathname = path.split('?')[0];
  if (pathname === '/') return { status: 200, contentType: 'text/html; charset=utf-8', body: renderPage(greeting) };
  if (pathname === '/health') return { status: 200, contentType: 'text/plain; charset=utf-8', body: 'OK\n' };
  return { status: 404, contentType: 'text/plain; charset=utf-8', body: 'Not found. The world is at /.\n' };
}

/**
 * ## handleRequest(options, request, response) ⇒ {void}
 * Adapts a Node HTTP request to the pure routing layer and sends its reply.
 *
 * **Kind:** function
 * **Access:** private
 *
 * ## Parameters
 * - `options` **{ServerOptions}** - Validated server configuration.
 * - `request` **{IncomingMessage}** - Node's incoming request.
 * - `response` **{ServerResponse}** - Writable HTTP response.
 *
 * ## Returns
 * **{void}** - Ends the response; `HEAD` sends headers without a body.
 *
 * **Technical Notes:** `Content-Length` counts UTF-8 bytes, not JavaScript characters.
 */
function handleRequest(options: ServerOptions, request: IncomingMessage, response: ServerResponse): void {
  const reply = routeRequest(request.method ?? 'GET', request.url ?? '/', options.greeting);
  response.statusCode = reply.status;
  response.setHeader('Content-Type', reply.contentType);
  response.setHeader('Content-Length', Buffer.byteLength(reply.body));
  if (reply.allow) response.setHeader('Allow', reply.allow);
  response.end(request.method === 'HEAD' ? undefined : reply.body);
}

/**
 * ## createHelloServer(options) ⇒ {Server}
 * Builds a server without starting it. Construction and listening are separate jobs.
 *
 * **Kind:** function
 * **Access:** public
 *
 * ## Parameters
 * - `options` **{ServerOptions}** - Validated host, port and greeting.
 *
 * ## Returns
 * **{Server}** - An unbound server; callers may listen or attach their own handlers.
 *
 * ## Example
 * ```ts
 * const server = createHelloServer(readOptions({ PORT: '0' }));
 * ```
 */
function createHelloServer(options: ServerOptions): Server {
  return createServer(handleRequest.bind(undefined, options));
}

/**
 * ## reportListening() ⇒ {void}
 * Announces the address Node actually bound, including an automatically chosen port.
 *
 * **Kind:** function
 * **Access:** private
 *
 * ## Parameters
 * - `this` **{Server}** - Bound by Node when the listening callback runs.
 *
 * ## Returns
 * **{void}** - Writes the startup URL to the console.
 */
function reportListening(this: Server): void {
  const address = this.address();
  if (address && typeof address !== 'string') {
    const host = address.address.includes(':') ? `[${address.address}]` : address.address;
    console.log(`Hello World is listening at http://${host}:${address.port}/`);
  }
}

/**
 * ## reportFailure(error) ⇒ {void}
 * Reports startup failure without claiming that the server is "probably fine."
 *
 * **Kind:** function
 * **Access:** private
 *
 * ## Parameters
 * - `error` **{unknown}** - A validation exception or asynchronous server error.
 *
 * ## Returns
 * **{void}** - Logs the reason and sets the process exit code to 1.
 */
function reportFailure(error: unknown): void {
  console.error('Server could not start:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

/**
 * ## startServer(options) ⇒ {Server}
 * Connects the last layer: an HTTP server meets an actual TCP port.
 *
 * **Kind:** function
 * **Access:** public
 *
 * ## Parameters
 * - `options` **{ServerOptions}** - Validated configuration, usually from `readOptions`.
 *
 * ## Returns
 * **{Server}** - The starting server; `listening` signals readiness and `close()` stops it.
 *
 * ## Throws
 * - `Error` - Synchronous listen errors. Asynchronous bind failures go to `reportFailure`.
 *
 * ## Implementation Details
 * 1. Construct the server.
 * 2. Register its startup error handler.
 * 3. Listen, then announce the real address.
 */
function startServer(options: ServerOptions): Server {
  const server = createHelloServer(options);
  server.once('error', reportFailure);
  server.listen(options.port, options.host, reportListening);
  return server;
}

// A lone comment can still be **bold**, *italic*, and contain `code`.
module.exports = { readOptions, escapeHtml, renderPage, routeRequest, createHelloServer, startServer };

if (require.main === module) {
  try {
    startServer(readOptions());
  } catch (error) {
    reportFailure(error);
  }
}
