import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// Single-user gate (ADR-0016 slice 3): Google sign-in, no password, restricted to
// an allowlist of emails. The app's data access uses the service_role key server-
// side (ADR-0016 decision 5), independent of the signed-in user — so Auth.js is a
// pure "is this Davide?" gate, not a per-user data layer. No Supabase Auth / RLS.
const allowlist = (process.env.AUTH_ALLOWED_EMAIL ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [Google],
  callbacks: {
    // Only let allowlisted Google accounts complete sign-in.
    signIn({ profile }) {
      const email = profile?.email?.toLowerCase();
      return Boolean(email && allowlist.includes(email));
    },
    // The middleware gate. It stays OPEN until Google is configured, so local /
    // pre-setup dev (and the LAN phone view) is not locked out before OAuth
    // credentials exist. Once AUTH_GOOGLE_ID is set (locally or on Vercel), the
    // gate is live and requires a signed-in, allowlisted user.
    authorized({ auth: session }) {
      if (!process.env.AUTH_GOOGLE_ID) return true;
      return Boolean(session?.user);
    },
  },
});
