// Observe scripts and integrations before adding enforcement. Never replace an
// existing route-specific enforced policy with this rollout policy.
export const CSP_REPORT_ONLY = "default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self'; script-src-attr 'none'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; media-src 'self' blob:; frame-src 'self'; worker-src 'self' blob:; form-action 'self'";
export function withBrowserPolicy(response) {
  if (response.status < 200) return response;
  const headers = new Headers(response.headers);
  if (!headers.has('Content-Security-Policy-Report-Only')) headers.set('Content-Security-Policy-Report-Only',CSP_REPORT_ONLY);
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
