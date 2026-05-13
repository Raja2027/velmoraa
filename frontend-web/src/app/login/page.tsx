"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useState } from "react";
import { apiUrl } from "@/lib/api";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"email" | "password">("email");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleEmailNext = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/auth/check-email"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.detail || "User not found");
        setLoading(false);
        return;
      }
      setStep("password");
    } catch {
      setError("Network error");
    }
    setLoading(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!password) return;
    setLoading(true);
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) setError("Invalid email or password");
    else window.location.href = "/";
  };

  return (
    <div
      className="flex-1 flex items-center justify-center min-h-screen px-4"
      style={{ background: "var(--bg)" }}
    >
      <div className="w-full max-w-[400px] flex flex-col gap-3">

        {/* Main Card */}
        <div
          className="rounded-2xl px-10 pt-12 pb-8 flex flex-col items-center"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <h1
            className="text-2xl font-bold mb-8"
            style={{ color: "var(--ink-900)" }}
          >
            Log into velmoraa
          </h1>

          {error && (
            <div
              className="w-full text-center text-sm py-2.5 px-4 rounded-xl mb-4"
              style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}
            >
              {error}
            </div>
          )}

          {step === "email" ? (
            <form onSubmit={handleEmailNext} className="w-full flex flex-col gap-3">
              <input
                type="email"
                required
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                style={{ padding: "14px 16px", borderRadius: "var(--radius-xl)" }}
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-full font-bold text-sm text-white transition-all disabled:opacity-60"
                style={{
                  background: "linear-gradient(135deg, #4facfe 0%, #7eb7f7 100%)",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {loading ? "Checking..." : "Next"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="w-full flex flex-col gap-3">
              <div
                className="flex items-center justify-between w-full py-2.5 px-4 rounded-xl text-sm"
                style={{ background: "var(--cream-50)", border: "1px solid var(--border)" }}
              >
                <span style={{ color: "var(--ink-800)" }}>{email}</span>
                <button
                  type="button"
                  onClick={() => { setStep("email"); setPassword(""); setError(""); }}
                  className="text-xs font-medium cursor-pointer"
                  style={{ color: "#4facfe", background: "none", border: "none" }}
                >
                  Change
                </button>
              </div>
              <input
                type="password"
                required
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                style={{ padding: "14px 16px", borderRadius: "var(--radius-xl)" }}
                autoFocus
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-full font-bold text-sm text-white transition-all disabled:opacity-60"
                style={{
                  background: "linear-gradient(135deg, #4facfe 0%, #7eb7f7 100%)",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {loading ? "Logging in..." : "Log in"}
              </button>
            </form>
          )}

          <button
            className="mt-5 text-sm font-medium cursor-pointer transition-colors"
            style={{ color: "var(--ink-900)", background: "none", border: "none" }}
          >
            Forgot password?
          </button>
        </div>

        {/* Google Sign-in Card */}
        <div
          className="rounded-2xl px-10 py-4"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow-xs)",
          }}
        >
          <button
            type="button"
            onClick={() => signIn("google", { callbackUrl: "/" })}
            className="w-full flex items-center justify-center gap-3 py-3 rounded-full font-semibold text-sm cursor-pointer transition-all"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--ink-900)",
            }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--cream-50)"}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "var(--surface)"}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Log in with Google
          </button>
        </div>

        {/* Create account Card */}
        <div
          className="rounded-2xl px-10 py-4"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow-xs)",
          }}
        >
          <Link href="/register">
            <button
              className="w-full py-3 rounded-full font-semibold text-sm cursor-pointer transition-all"
              style={{
                background: "var(--surface)",
                border: "1px solid #4facfe",
                color: "#4facfe",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = "#4facfe";
                (e.currentTarget as HTMLElement).style.color = "#fff";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = "var(--surface)";
                (e.currentTarget as HTMLElement).style.color = "#4facfe";
              }}
            >
              Create new account
            </button>
          </Link>
        </div>

      </div>
    </div>
  );
}
