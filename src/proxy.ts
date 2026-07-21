// The gate (Next 16 renamed "middleware" → "proxy"). Every matched route runs
// through Auth.js's `authorized` callback (see auth.ts): unauthenticated requests
// are redirected to Google sign-in when the gate is live; while Google is
// unconfigured the callback returns true and this is a no-op.
export { auth as proxy } from "@/auth";

export const config = {
  // Protect everything except Next internals, the auth endpoints, and the favicon.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
