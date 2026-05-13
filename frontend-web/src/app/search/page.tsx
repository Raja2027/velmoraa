"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { apiUrl, mediaUrl } from "@/lib/api";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(apiUrl(`/search/users?q=${encodeURIComponent(query)}`));
        const data = await res.json();
        setResults(data.users || []);
      } catch { /**/ } finally { setLoading(false); }
    }, 400);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <main className="flex-1 flex flex-col items-center px-6 pt-12 pb-24">
      <div className="w-full max-w-md fade-up">

        <h1 className="text-xl font-bold mb-1" style={{ color: "var(--ink-900)" }}>People</h1>
        <p className="text-sm mb-6" style={{ color: "var(--stone-500)" }}>Search by username</p>

        {/* Input */}
        <div className="relative mb-6">
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
            style={{ color: "var(--stone-400)" }}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 0z"/>
          </svg>
          <input
            type="text"
            placeholder="Search people..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="input"
            style={{ paddingLeft: 40, paddingRight: 36 }}
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2"
              style={{ color: "var(--stone-400)" }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          )}
        </div>

        {/* Results */}
        <div className="flex flex-col gap-1.5">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-3 rounded-xl animate-pulse"
                style={{ background: "var(--cream-100)", animationDelay: `${i * 80}ms` }}
              >
                <div className="w-10 h-10 rounded-full" style={{ background: "var(--cream-200)" }} />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-28 rounded-lg" style={{ background: "var(--cream-200)" }} />
                  <div className="h-2.5 w-16 rounded-lg" style={{ background: "var(--cream-200)" }} />
                </div>
              </div>
            ))
          ) : query && results.length === 0 ? (
            <div className="text-center py-14">
              <p className="font-medium" style={{ color: "var(--ink-900)" }}>No results</p>
              <p className="text-sm mt-1" style={{ color: "var(--stone-400)" }}>No accounts found for "{query}"</p>
            </div>
          ) : !query ? (
            <p className="text-sm text-center py-12" style={{ color: "var(--stone-400)" }}>
              Start typing to find people
            </p>
          ) : (
            results.map((user, i) => (
              <Link href={`/${user.username}`} key={user.username}>
                <div
                  className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-150 group fade-up"
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    animationDelay: `${i * 40}ms`,
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--cream-50)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "var(--surface)"; }}
                >
                  <div
                    className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0"
                    style={{ border: "1.5px solid var(--border)" }}
                  >
                    {user.profile_picture
                      ? <img src={mediaUrl(user.profile_picture)} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full" style={{ background: "var(--cream-100)" }} />
                    }
                  </div>
                  <p className="text-[14px] font-semibold flex-1" style={{ color: "var(--ink-900)" }}>
                    {user.username}
                  </p>
                  <svg
                    className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: "var(--stone-400)" }}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                  </svg>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
