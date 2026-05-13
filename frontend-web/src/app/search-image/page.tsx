"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { apiUrl, mediaUrl } from "@/lib/api";

type SearchMatch = {
  user_id: number;
  username: string;
  profile_picture?: string | null;
  match_confidence: number;
  match_level?: "strong" | "likely" | "possible" | "low";
  is_fallback?: boolean;
};

function matchLabel(match: SearchMatch) {
  if (match.is_fallback || match.match_level === "low") return "Low confidence";
  if (match.match_level === "strong") return "Strong match";
  if (match.match_level === "likely") return "Likely match";
  return "Possible match";
}

function matchAccent(match: SearchMatch): string {
  if (match.is_fallback || match.match_level === "low") return "#c2410c";
  if (match.match_level === "strong") return "#15803d";
  if (match.match_level === "likely") return "#1d4ed8";
  return "#92400e";
}

function ConfidenceMeter({ value, match }: { value: number; match: SearchMatch }) {
  const accent = matchAccent(match);
  return (
    <div className="w-full mt-2">
      <div className="flex justify-between mb-1.5" style={{ fontSize: 11, color: "var(--stone-400)" }}>
        <span>Match confidence</span>
        <span className="font-semibold" style={{ color: accent }}>{value}%</span>
      </div>
      <div className="h-1 rounded-full overflow-hidden" style={{ background: "var(--cream-200)" }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${value}%`, background: accent, opacity: 0.8 }}
        />
      </div>
    </div>
  );
}

export default function FindByFace() {
  const { data: session } = useSession();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchMatch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null);
  const [queryFaces, setQueryFaces] = useState<any[]>([]);
  const [hoveredFaceIndex, setHoveredFaceIndex] = useState<number | null>(null);

  const processFile = (f: File) => {
    setFile(f); setPreview(URL.createObjectURL(f));
    setResults([]); setQueryFaces([]); setHasSearched(false); setError(null); setImageSize(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f?.type.startsWith("image/")) processFile(f);
  };

  const handleSearch = async () => {
    if (!file) return;
    setLoading(true); setError(null); setHasSearched(true);
    const fd = new FormData();
    fd.append("file", file);
    if (session?.user?.email) fd.append("email", session.user.email);
    try {
      const res = await fetch(apiUrl("/search-by-image"), { method: "POST", body: fd });
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || "Search failed"); }
      const data = await res.json();
      setResults((data.matches || []) as SearchMatch[]);
      setQueryFaces(data.query_faces || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally { setLoading(false); }
  };

  const hasFallback = results.some(m => m.is_fallback || m.match_level === "low");

  return (
    <main className="flex-1 flex flex-col items-center px-6 pt-12 pb-24">
      <div className="w-full max-w-xl fade-up">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-xl font-bold mb-1" style={{ color: "var(--ink-900)" }}>Find by Face</h1>
          <p className="text-sm" style={{ color: "var(--stone-500)" }}>
            Upload a photo to identify matching profiles using AI face recognition.
            Only opted-in users appear.
          </p>
        </div>

        {/* Upload Zone */}
        <div
          onClick={() => { if (!loading) fileRef.current?.click(); }}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`rounded-2xl overflow-hidden transition-all duration-200 mb-4 ${loading ? 'cursor-wait' : 'cursor-pointer'}`}
          style={{
            border: dragOver
              ? "1.5px dashed var(--stone-500)"
              : "1.5px dashed var(--border-mid)",
            background: dragOver ? "var(--cream-100)" : "var(--surface)",
          }}
        >
          <input
            ref={fileRef} type="file" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); }}
          />
          {preview ? (
            <div className="relative h-[300px] flex items-center justify-center bg-black/5 overflow-hidden">
              <img 
                src={preview} 
                alt="Preview" 
                className="max-w-full max-h-full object-contain" 
                onLoad={(e) => setImageSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              />
              {/* Bounding Boxes */}
              {imageSize && queryFaces.map((qf) => {
                const fa = qf.facial_area;
                if (!fa) return null;
                // Calculate percentage based on natural image size so it scales with object-contain
                // Note: since object-contain centers the image, we actually need to calculate the rendered size
                // For simplicity, we can just overlay an absolute div that matches the image dimensions exactly.
                return (
                  <div key={qf.face_index} className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div style={{ position: 'relative', aspectRatio: `${imageSize.w}/${imageSize.h}`, maxHeight: '100%', maxWidth: '100%' }}>
                      <div
                        className={`absolute border-2 transition-colors duration-300 ${hoveredFaceIndex === qf.face_index ? 'border-primary shadow-[0_0_15px_rgba(79,172,254,0.5)] z-10' : 'border-white/60'}`}
                        style={{
                          left: `${(fa.x / imageSize.w) * 100}%`,
                          top: `${(fa.y / imageSize.h) * 100}%`,
                          width: `${(fa.w / imageSize.w) * 100}%`,
                          height: `${(fa.h / imageSize.h) * 100}%`,
                          borderRadius: '8%',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
              {!loading && (
                <div
                  className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity duration-200 flex items-center justify-center pointer-events-auto"
                  style={{ background: "rgba(28,25,23,0.4)" }}
                >
                  <span
                    className="text-sm font-medium px-4 py-2 rounded-xl text-white shadow-lg"
                    style={{ background: "rgba(28,25,23,0.8)" }}
                  >
                    Change photo
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="h-52 flex flex-col items-center justify-center gap-3">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ background: "var(--cream-100)", border: "1px solid var(--border)" }}
              >
                <svg className="w-5 h-5" style={{ color: "var(--stone-500)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium" style={{ color: "var(--ink-800)" }}>Drop a photo or click to upload</p>
              </div>
            </div>
          )}
        </div>

        {/* Search Button */}
        <button
          onClick={handleSearch}
          disabled={!file || loading}
          className="btn btn-dark w-full py-3 rounded-xl mb-4"
          style={{ fontSize: 14 }}
        >
          {loading ? (
            <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Scanning...
            </>
          ) : "Search by Face"}
        </button>

        {/* Error */}
        {error && (
          <div
            className="p-4 rounded-xl text-sm mb-4 fade-up"
            style={{ background: "#fff1ee", border: "1px solid #fed7cc", color: "#c2410c" }}
          >
            <p className="font-semibold mb-0.5">Face not detected</p>
            <p style={{ opacity: 0.85 }}>{error}</p>
          </div>
        )}

        {/* Results */}
        {hasSearched && !loading && !error && (
          <div className="fade-up">
            <div className="flex items-center gap-2 mb-4">
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: results.length > 0 ? "#15803d" : "var(--stone-400)" }}
              />
              <p className="text-sm font-semibold" style={{ color: "var(--ink-900)" }}>
                {results.length > 0
                  ? `${results.length} match${results.length > 1 ? "es" : ""} found`
                  : "No matches found"}
              </p>
              {hasFallback && (
                <span
                  className="ml-auto text-[11px] font-medium px-2.5 py-0.5 rounded-full"
                  style={{ background: "#fff7ed", color: "#c2410c", border: "1px solid #fed7cc" }}
                >
                  Low confidence
                </span>
              )}
            </div>

            {results.length === 0 ? (
              <div
                className="text-center py-12 rounded-2xl"
                style={{ background: "var(--cream-50)", border: "1px solid var(--border)" }}
              >
                <p className="font-medium" style={{ color: "var(--ink-900)" }}>No opted-in users matched</p>
                <p className="text-sm mt-1" style={{ color: "var(--stone-400)" }}>Try a clearer, front-facing photo</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {results.map((match, i) => (
                  <div
                    key={match.user_id}
                    className="flex items-center gap-4 p-4 rounded-2xl transition-all duration-150 fade-up"
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      animationDelay: `${i * 50}ms`,
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.borderColor = "var(--border-mid)";
                      // @ts-ignore
                      setHoveredFaceIndex(match.matched_face_index ?? null);
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
                      setHoveredFaceIndex(null);
                    }}
                  >
                    <Link href={`/${match.username}`}>
                      <div
                        className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 cursor-pointer"
                        style={{ border: "1.5px solid var(--border)" }}
                      >
                        {match.profile_picture
                          ? <img src={mediaUrl(match.profile_picture)} alt="" className="w-full h-full object-cover" />
                          : <div className="w-full h-full" style={{ background: "var(--cream-100)" }} />
                        }
                      </div>
                    </Link>
                    <div className="flex-1 min-w-0">
                      <Link href={`/${match.username}`}>
                        <p className="text-[14px] font-semibold cursor-pointer hover:underline" style={{ color: "var(--ink-900)" }}>
                          {match.username}
                        </p>
                      </Link>
                      <p className="text-[11px] mt-0.5 font-medium" style={{ color: matchAccent(match) }}>
                        {matchLabel(match)}
                      </p>
                      <ConfidenceMeter value={match.match_confidence} match={match} />
                    </div>
                    <Link href={`/${match.username}`} className="flex-shrink-0">
                      <button className="btn btn-outline text-[13px] py-1.5 px-4 rounded-lg">View</button>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Footer note */}
        <p
          className="text-xs text-center mt-8 leading-relaxed"
          style={{ color: "var(--stone-400)" }}
        >
          Powered by ArcFace. Only users who opted into facial recognition are searchable.
        </p>
      </div>
    </main>
  );
}
