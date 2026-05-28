/**
 * Server-rendered login page. No JS, no third-party assets.
 *
 * The disclosure paragraph is non-negotiable: every student who reaches this
 * page must understand they are sending their password to an unofficial
 * service before they submit it.
 */
function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderLoginPage(args: {
  actionUrl: string;
  hidden: Record<string, string>;
  publicOrigin: string;
  sourceRepoUrl: string;
  errorMessage?: string;
  prefillUsername?: string;
}): string {
  const hiddenInputs = Object.entries(args.hidden)
    .map(([k, v]) => `<input type="hidden" name="${escape(k)}" value="${escape(v)}">`)
    .join('\n');

  const error = args.errorMessage
    ? `<div class="error" role="alert">${escape(args.errorMessage)}</div>`
    : '';

  const prefill = args.prefillUsername ? escape(args.prefillUsername) : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>polito-mcp — sign in</title>
<style>
  :root {
    color-scheme: light dark;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  body {
    max-width: 32rem;
    margin: 2rem auto;
    padding: 0 1.25rem 4rem;
    line-height: 1.5;
  }
  h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
  .subtitle { color: #666; margin-top: 0; }
  .unofficial {
    border: 2px solid #c00;
    background: #fff5f5;
    color: #800;
    padding: 1rem;
    border-radius: 6px;
    margin: 1.25rem 0;
    font-size: 0.95rem;
  }
  @media (prefers-color-scheme: dark) {
    .unofficial { background: #2a0a0a; color: #ffb3b3; }
    .subtitle { color: #aaa; }
  }
  label {
    display: block;
    margin: 1rem 0 0.25rem;
    font-weight: 600;
  }
  input[type=text], input[type=password] {
    width: 100%;
    padding: 0.6rem 0.75rem;
    font-size: 1rem;
    border: 1px solid #888;
    border-radius: 6px;
    box-sizing: border-box;
  }
  button {
    margin-top: 1.25rem;
    padding: 0.75rem 1.25rem;
    font-size: 1rem;
    border: 0;
    border-radius: 6px;
    background: #0a66c2;
    color: white;
    cursor: pointer;
    font-weight: 600;
  }
  button:hover { background: #0950a0; }
  .error {
    margin: 1rem 0;
    padding: 0.75rem 1rem;
    border-radius: 6px;
    background: #fee;
    color: #800;
    border: 1px solid #f99;
  }
  footer {
    margin-top: 2rem;
    font-size: 0.85rem;
    color: #666;
  }
  footer a { color: inherit; }
</style>
</head>
<body>
<h1>Sign in to polito-mcp</h1>
<p class="subtitle">Unofficial MCP bridge for the Politecnico di Torino student API.</p>

<div class="unofficial">
  <strong>This is not Politecnico di Torino.</strong> If you continue, your
  matricola and password will be sent over TLS to <code>${escape(args.publicOrigin)}</code>,
  immediately forwarded to PoliTO's official <code>/auth/login</code>
  endpoint, and the password will be discarded from memory. Only the API
  token returned by PoliTO will be kept (encrypted) so future MCP requests
  can call the API on your behalf.
  <br><br>
  Source code:
  <a href="${escape(args.sourceRepoUrl)}" rel="noopener noreferrer">${escape(args.sourceRepoUrl)}</a>.
  Do not use this if you do not trust the operator.
</div>

${error}

<form method="POST" action="${escape(args.actionUrl)}" autocomplete="off">
  ${hiddenInputs}
  <label for="username">Matricola</label>
  <input id="username" name="username" type="text" inputmode="text"
         autocapitalize="none" spellcheck="false"
         required pattern="[A-Za-z0-9]+" value="${prefill}"
         autocomplete="username">

  <label for="password">PoliTO password</label>
  <input id="password" name="password" type="password" required
         autocomplete="current-password">

  <button type="submit">Sign in and authorize</button>
</form>

<footer>
  No analytics, no tracking, no third-party scripts. Open source under AGPL-3.0.
</footer>
</body>
</html>`;
}
