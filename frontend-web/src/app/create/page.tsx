"use client";

import { useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useMyProfilePic } from "@/hooks/useMyProfilePic";
import { apiUrl } from "@/lib/api";

export default function CreatePost() {
  const { data: session } = useSession();
  const router = useRouter();
  const myPic = useMyProfilePic();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isVideo, setIsVideo] = useState(false);
  const [caption, setCaption] = useState("");
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const processFile = (selected: File) => {
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
    setIsVideo(selected.type.startsWith("video/"));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) processFile(selected);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const selected = e.dataTransfer.files?.[0];
    if (selected && (selected.type.startsWith("image/") || selected.type.startsWith("video/"))) {
      processFile(selected);
    }
  };

  const handlePost = async () => {
    if (!file || !session?.user?.email) return;
    setLoading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("email", session.user.email);
    formData.append("caption", caption);
    try {
      const res = await fetch(apiUrl("/posts"), { method: "POST", body: formData });
      if (!res.ok) throw new Error("Failed to create post");
      router.push("/");
    } catch (error) {
      console.error(error);
      alert("Error creating post. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!session) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p style={{ color: "var(--stone-400)" }}>You need to be logged in to create a post.</p>
      </div>
    );
  }

  return (
    <main className="flex-1 flex flex-col items-center pt-10 px-4 pb-24">
      <div
        className="w-full max-w-2xl rounded-2xl overflow-hidden fade-up"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-md)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3.5"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          {file ? (
            <button
              onClick={() => { setFile(null); setPreview(null); setCaption(""); }}
              className="text-sm font-medium transition-colors"
              style={{ color: "var(--stone-500)" }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "var(--ink-900)"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "var(--stone-500)"}
            >
              Discard
            </button>
          ) : <div />}
          <h1 className="font-bold text-base" style={{ color: "var(--ink-900)" }}>Create new post</h1>
          {file ? (
            <button
              onClick={handlePost}
              disabled={loading}
              className="text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2"
              style={{ color: "var(--ink-900)" }}
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Sharing...
                </>
              ) : "Share"}
            </button>
          ) : <div style={{width: 60}} />}
        </div>

        <div className="flex flex-col md:flex-row" style={{ minHeight: "420px" }}>
          {/* Upload / Preview */}
          <div
            className="flex-1 flex items-center justify-center relative transition-colors"
            style={{
              background: dragOver ? "var(--cream-100)" : "var(--cream-50)",
              borderRight: "1px solid var(--border)",
            }}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            {!preview ? (
              <label
                className="flex flex-col items-center justify-center cursor-pointer w-full h-full min-h-[320px] gap-4 px-8 text-center"
                htmlFor="post-file-input"
              >
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center"
                  style={{ background: "var(--cream-200)", border: "1px solid var(--border)" }}
                >
                  <svg className="w-7 h-7" style={{ color: "var(--stone-500)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-base mb-1" style={{ color: "var(--ink-900)" }}>
                    Drag photos and videos here
                  </p>

                  <span className="btn btn-dark text-sm px-5 py-2.5 rounded-xl cursor-pointer inline-flex">
                    Select from computer
                  </span>
                </div>
                <input id="post-file-input" ref={fileRef} type="file" className="hidden" onChange={handleFileChange} />
              </label>
            ) : (
              <div className="w-full h-full min-h-[320px] flex items-center justify-center">
                {isVideo ? (
                  <video src={preview} autoPlay muted loop playsInline className="w-full max-h-[480px] object-contain" />
                ) : (
                  <img src={preview} alt="Preview" className="w-full max-h-[480px] object-contain" />
                )}
                <button
                  onClick={() => fileRef.current?.click()}
                  className="absolute top-3 right-3 btn btn-outline text-xs px-3 py-1.5 rounded-lg"
                  style={{ background: "rgba(255,255,255,0.85)", backdropFilter: "blur(8px)" }}
                >
                  Change
                </button>
                <input ref={fileRef} type="file" className="hidden" accept="image/*,video/*" onChange={handleFileChange} />
              </div>
            )}
          </div>

          {/* Caption */}
          {preview && (
            <div className="w-full md:w-80 flex flex-col" style={{ background: "var(--surface)" }}>
              {/* Author */}
              <div
                className="flex items-center gap-3 p-4"
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                <div
                  className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0"
                  style={{ border: "1.5px solid var(--border)" }}
                >
                  {myPic
                    ? <img src={myPic} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full" style={{ background: "var(--cream-200)" }} />
                  }
                </div>
                <span className="font-semibold text-sm" style={{ color: "var(--ink-900)" }}>
                  {session.user?.name || session.user?.email}
                </span>
              </div>

              {/* Caption input */}
              <div className="flex-1 p-4">
                <textarea
                  placeholder="Write a caption..."
                  value={caption}
                  onChange={e => setCaption(e.target.value)}
                  maxLength={2200}
                  className="w-full h-40 bg-transparent resize-none outline-none text-sm leading-relaxed"
                  style={{ color: "var(--ink-900)" }}
                />
                <div className="text-right text-xs" style={{ color: "var(--stone-400)" }}>
                  {caption.length}/2,200
                </div>
              </div>

              {/* Info */}
              <div className="p-4 text-xs" style={{ borderTop: "1px solid var(--border)", color: "var(--stone-400)" }}>
                {isVideo
                  ? "A frame from this video will be used to update your facial identity."
                  : "This image will be scanned to update your facial identity."}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
