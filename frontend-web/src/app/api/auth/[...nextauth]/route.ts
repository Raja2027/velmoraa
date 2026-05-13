import NextAuth, { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "mock_client_id",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "mock_client_secret",
    }),
    CredentialsProvider({
      name: "Password",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (credentials?.email && credentials?.password) {
          try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/auth/login`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                email: credentials.email,
                password: credentials.password,
              }),
            });
            if (res.ok) {
              const data = await res.json();
              return {
                id: data.email,
                email: data.email,
                name: data.username,
                isOnboarded: data.is_onboarded,
                username: data.username,
              };
            }
          } catch (e) {
            console.error(e);
          }
        }
        return null;
      }
    })
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (trigger === "update" && session?.isOnboarded) {
        token.isOnboarded = session.isOnboarded;
        token.username = session.username;
      }
      if (user) {
        token.isOnboarded = (user as any).isOnboarded;
        token.username = (user as any).username;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        (session as any).isOnboarded = token.isOnboarded;
        if (session.user) {
          (session.user as any).name = token.username || session.user.name;
        }
      }
      return session;
    },
    async signIn({ user, account, profile }) {
      // Skip sync for credentials login (already validated via /auth/login)
      if (account?.provider === "credentials") {
        return true;
      }

      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/auth/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            google_id: account?.provider === "google" ? user.id : null,
            email: user.email,
            name: user.name || "",
            image: user.image || "",
          }),
        });
        
        if (!res.ok) {
          console.error("Failed to sync user to backend");
          return false;
        }
        
        const data = await res.json();

        // User not registered — redirect to register with pre-filled data
        if (data.needs_registration) {
          const params = new URLSearchParams({
            email: data.email || user.email || "",
            name: data.name || user.name || "",
            image: data.image || user.image || "",
          });
          return `/register?${params.toString()}`;
        }

        (user as any).isOnboarded = data.is_onboarded;
        (user as any).username = data.username;

        return true;
      } catch (error) {
        console.error("Error syncing user:", error);
        return false;
      }
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET || "supersecretmockkey",
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
