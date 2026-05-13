"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { apiUrl, mediaUrl } from "@/lib/api";
import { localTime } from "@/lib/time";

// ── Story Viewer (velmoraa web style) ──────────────────────────────────────
function StoryViewer({ group, onClose, onNext, onPrev, hasPrev, hasNext, onDelete, isOwn, prevGroup, nextGroup }: any) {
  const [idx, setIdx] = useState(0);
  const { data: session } = useSession();
  const timerRef = useRef<any>(null);
  const [progress, setProgress] = useState(0);
  const [details, setDetails] = useState<any>({ likes_count: 0, has_liked: false, comments: [] });
  const [commentText, setCommentText] = useState("");
  const [paused, setPaused] = useState(false);

  const story = group?.stories?.[idx];

  useEffect(() => {
    if (!story) return;
    const email = session?.user?.email ? `?email=${encodeURIComponent(session.user.email)}` : "";
    fetch(apiUrl(`/stories/${story.id}/details${email}`))
      .then(r => r.json()).then(setDetails).catch(() => {});
  }, [story, session]);

  useEffect(() => {
    if (paused) { clearInterval(timerRef.current); return; }
    setProgress(0);
    const start = Date.now();
    const dur = 5000;
    timerRef.current = setInterval(() => {
      const p = Math.min(100, ((Date.now() - start) / dur) * 100);
      setProgress(p);
      if (p >= 100) {
        clearInterval(timerRef.current);
        if (idx < group.stories.length - 1) setIdx(i => i + 1);
        else onNext?.();
      }
    }, 50);
    return () => clearInterval(timerRef.current);
  }, [idx, group, paused]);

  useEffect(() => {
    if (!session?.user?.email || !story || isOwn) return;
    const fd = new FormData();
    fd.append("email", session.user.email);
    fetch(apiUrl(`/stories/${story.id}/view`), { method: "POST", body: fd }).catch(() => {});
  }, [story, session, isOwn]);

  const handleLike = async () => {
    if (!session?.user?.email || !story) return;
    const optimistic = !details.has_liked;
    setDetails((d: any) => ({ ...d, has_liked: optimistic, likes_count: optimistic ? d.likes_count + 1 : d.likes_count - 1 }));
    const fd = new FormData();
    fd.append("email", session.user.email);
    const res = await fetch(apiUrl(`/stories/${story.id}/like`), { method: "POST", body: fd });
    const data = await res.json();
    setDetails((d: any) => ({ ...d, has_liked: data.has_liked, likes_count: data.likes_count }));
  };

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user?.email || !commentText.trim() || !story) return;
    const fd = new FormData();
    fd.append("email", session.user.email);
    fd.append("content", commentText);
    const res = await fetch(apiUrl(`/stories/${story.id}/comment`), { method: "POST", body: fd });
    const data = await res.json();
    setDetails((d: any) => ({ ...d, comments: [...d.comments, data.comment] }));
    setCommentText("");
  };

  const handleDelete = async () => {
    if (!session?.user?.email || !story) return;
    await fetch(apiUrl(`/stories/${story.id}?email=${encodeURIComponent(session.user.email)}`), { method: "DELETE" });
    onDelete(story.id);
    if (group.stories.length === 1) { onClose(); return; }
    if (idx >= group.stories.length - 1) setIdx(idx - 1);
  };

  const handleCardTap = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const w = rect.width;
    if (x < w / 3) {
      if (idx > 0) setIdx(i => i - 1); else onPrev?.();
    } else if (x > (w * 2) / 3) {
      if (idx < group.stories.length - 1) setIdx(i => i + 1); else onNext?.();
    }
  };

  if (!story) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/95">
      {/* Close button */}
      <button onClick={onClose}
        className="absolute top-5 right-5 text-white/70 hover:text-white text-3xl z-20 transition-colors">✕</button>

      {/* Prev user peek */}
      {hasPrev && (
        <button onClick={onPrev}
          className="absolute left-4 md:left-8 flex flex-col items-center gap-1.5 z-20 opacity-50 hover:opacity-100 transition-opacity">
          {prevGroup && (
            <>
              <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-white/40">
                {prevGroup.profile_picture
                  ? <img src={mediaUrl(prevGroup.profile_picture)} className="w-full h-full object-cover" alt="" />
                  : <span className="flex items-center justify-center w-full h-full bg-zinc-800">👤</span>}
              </div>
              <span className="text-white text-xs hidden md:block">{prevGroup.username}</span>
            </>
          )}
          <span className="text-white text-4xl">‹</span>
        </button>
      )}

      {/* Main story card */}
      <div className="flex flex-col w-full max-w-[380px]" style={{ height: "min(88vh, 680px)" }}>
        {/* Progress bars */}
        <div className="flex gap-1 mb-2 px-1">
          {group.stories.map((_: any, i: number) => (
            <div key={i} className="flex-1 h-[2px] bg-white/30 rounded-full overflow-hidden">
              <div className="h-full bg-white rounded-full"
                style={{ width: i < idx ? "100%" : i === idx ? `${progress}%` : "0%" }} />
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="flex items-center gap-3 mb-2 px-1">
          <div className="w-9 h-9 rounded-full overflow-hidden border-2 border-white shrink-0">
            {group.profile_picture
              ? <img src={mediaUrl(group.profile_picture)} className="w-full h-full object-cover" alt="" />
              : <span className="flex items-center justify-center w-full h-full bg-zinc-800 text-xs">👤</span>}
          </div>
          <span className="font-semibold text-white text-sm">{group.username}</span>
          <span className="text-white/50 text-xs">
            {localTime(story.created_at)}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {isOwn && (
              <button onClick={handleDelete}
                className="text-red-400 text-xs bg-black/40 px-2.5 py-1 rounded-full border border-red-400/30 hover:bg-red-900/30 transition-colors">
                🗑 Delete
              </button>
            )}
          </div>
        </div>

        {/* Media */}
        <div className="flex-1 rounded-2xl overflow-hidden bg-zinc-900 cursor-pointer relative"
          onClick={handleCardTap}>
          <img src={mediaUrl(story.media_url)} alt="Story"
            className="w-full h-full object-cover select-none" draggable={false} />
        </div>

        {/* Bottom bar */}
        <div className="mt-3 px-1">
          {isOwn ? (
            <div className="flex items-center gap-5">
              <span className="text-white text-sm flex items-center gap-1.5">
                ❤️ <strong>{details.likes_count}</strong>
              </span>
              <span className="text-white text-sm flex items-center gap-1.5">
                💬 <strong>{details.comments.length}</strong> {details.comments.length === 1 ? "reply" : "replies"}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              {/* Reply input */}
              <form onSubmit={handleComment}
                className="flex-1 flex items-center border border-white/30 rounded-full px-4 py-2.5 gap-2 bg-transparent focus-within:border-white/60 transition-colors">
                <input
                  type="text"
                  placeholder={`Reply to ${group.username}...`}
                  className="flex-1 bg-transparent outline-none text-sm placeholder-white/50 text-white"
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  onFocus={() => setPaused(true)}
                  onBlur={() => setPaused(false)}
                />
                {commentText.trim() && (
                  <button type="submit" className="text-blue-400 font-semibold text-sm whitespace-nowrap">Send</button>
                )}
              </form>

              {/* Like */}
              <button onClick={handleLike}
                className="text-3xl transition-transform hover:scale-110 active:scale-125 shrink-0"
                style={{ filter: details.has_liked ? "drop-shadow(0 0 6px rgba(239,68,68,0.8))" : "none" }}>
                {details.has_liked ? "❤️" : "🤍"}
              </button>

              {/* Share */}
              <button className="text-white/70 hover:text-white transition-colors shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-7 h-7">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Next user peek */}
      {hasNext && (
        <button onClick={onNext}
          className="absolute right-4 md:right-8 flex flex-col items-center gap-1.5 z-20 opacity-50 hover:opacity-100 transition-opacity">
          {nextGroup && (
            <>
              <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-white/40">
                {nextGroup.profile_picture
                  ? <img src={mediaUrl(nextGroup.profile_picture)} className="w-full h-full object-cover" alt="" />
                  : <span className="flex items-center justify-center w-full h-full bg-zinc-800">👤</span>}
              </div>
              <span className="text-white text-xs hidden md:block">{nextGroup.username}</span>
            </>
          )}
          <span className="text-white text-4xl">›</span>
        </button>
      )}
    </div>
  );
}

// ── Add Story Modal ─────────────────────────────────────────────────────────
function AddStoryModal({ onClose, onUploaded }: { onClose: () => void; onUploaded: () => void }) {
  const { data: session } = useSession();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = (f: File) => { setFile(f); setPreview(URL.createObjectURL(f)); };

  const handleUpload = async () => {
    if (!file || !session?.user?.email) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("email", session.user.email);
    fd.append("file", file);
    await fetch(apiUrl("/stories"), { method: "POST", body: fd });
    setUploading(false);
    onUploaded();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="rounded-2xl w-full max-w-sm" style={{background:'var(--surface)',border:'1px solid var(--border)',boxShadow:'var(--shadow-lg)'}} onClick={e => e.stopPropagation()}>
        <div className="p-4 flex items-center justify-between" style={{borderBottom:'1px solid var(--border)'}}>
          <h2 className="font-bold text-base" style={{color:'var(--ink-900)'}}>Add to Your Story</h2>
          <button onClick={onClose} className="text-xl" style={{color:'var(--stone-400)'}}>✕</button>
        </div>
        <div className="p-4 flex flex-col gap-4">
          {preview ? (
            <>
              <img src={preview} alt="preview" className="w-full h-64 object-cover rounded-xl" />
              <div className="flex gap-2">
                <button onClick={() => { setFile(null); setPreview(null); }}
                  className="btn btn-outline flex-1 py-2 rounded-xl text-sm">
                  Change
                </button>
                <button onClick={handleUpload} disabled={uploading}
                  className="btn btn-dark flex-1 py-2 rounded-xl text-sm disabled:opacity-50">
                  {uploading ? "Uploading..." : "Share Story"}
                </button>
              </div>
            </>
          ) : (
            <label className="flex flex-col items-center justify-center h-48 border-2 border-dashed rounded-xl cursor-pointer transition-colors" style={{borderColor:'var(--border-mid)'}}>
              <svg className="w-8 h-8 mb-2" style={{color:'var(--stone-400)'}} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
              <span className="text-sm" style={{color:'var(--stone-400)'}}>Tap to choose a photo or video</span>
              <input type="file" className="hidden" accept="image/*,video/*"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </label>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Stories Bar ─────────────────────────────────────────────────────────────
export default function StoriesBar({ session }: { session: any }) {
  const [groups, setGroups] = useState<any[]>([]);
  const [viewerGroup, setViewerGroup] = useState<any>(null);
  const [viewerGroupIdx, setViewerGroupIdx] = useState<number | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [myProfilePic, setMyProfilePic] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.user?.name) return;
    fetch(apiUrl(`/users/${session.user.name}`))
      .then(r => r.json())
      .then(d => { if (d.profile_picture) setMyProfilePic(mediaUrl(d.profile_picture)); })
      .catch(() => {});
  }, [session]);

  const fetchStories = async () => {
    if (!session?.user?.email) return;
    try {
      const res = await fetch(apiUrl(`/stories?email=${encodeURIComponent(session.user.email)}`));
      if (res.ok) { const d = await res.json(); setGroups(d.story_groups || []); }
    } catch {}
  };

  useEffect(() => { fetchStories(); }, [session]);

  const ownGroup = groups.find(g => g.is_own);
  const othersGroups = groups.filter(g => !g.is_own);
  const allViewed = (g: any) => g.stories.every((s: any) => s.has_viewed);

  const handleDeleteStory = (storyId: number) => {
    setGroups(prev => prev.map(g => !g.is_own ? g : { ...g, stories: g.stories.filter((s: any) => s.id !== storyId) }));
    fetchStories();
  };

  return (
    <>
      <div className="flex gap-4 overflow-x-auto pb-3 scrollbar-hide mb-2" style={{borderBottom:'1px solid var(--border)'}}>
        {/* Your Story */}
        {session?.user && (
          <div className="flex flex-col items-center gap-1.5 min-w-[72px]">
            <div className="relative cursor-pointer"
              onClick={() => ownGroup ? setViewerGroup(ownGroup) : setShowAddModal(true)}>
              <div className={`p-[2px] rounded-full ${ownGroup ? "bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600" : ""}`} style={{background: ownGroup ? undefined : 'var(--cream-300)'}}>
                <div className="w-[60px] h-[60px] rounded-full overflow-hidden" style={{border:'2px solid var(--bg)',background:'var(--cream-200)'}}>
                  {myProfilePic
                    ? <img src={myProfilePic} alt="me" className="w-full h-full object-cover" />
                    : <div className="w-full h-full" style={{background:'var(--cream-200)'}} />}
                </div>
              </div>
              <button onClick={e => { e.stopPropagation(); setShowAddModal(true); }}
                className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold transition-colors" style={{background:'var(--ink-900)',border:'2px solid var(--bg)'}}>
                +
              </button>
            </div>
            <span className="text-xs truncate max-w-[68px] text-center" style={{color:'var(--stone-500)'}}>
              {ownGroup ? "Your story" : "Add story"}
            </span>
          </div>
        )}

        {/* Others' stories */}
        {othersGroups.map((group, i) => {
          const viewed = allViewed(group);
          return (
            <button key={group.user_id}
              onClick={() => { setViewerGroupIdx(i); setViewerGroup(group); }}
              className="flex flex-col items-center gap-1.5 min-w-[72px]">
              <div className={`p-[2px] rounded-full ${viewed ? "" : "bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600"}`} style={{background: viewed ? 'var(--cream-300)' : undefined}}>
                <div className="w-[60px] h-[60px] rounded-full overflow-hidden" style={{border:'2px solid var(--bg)',background:'var(--cream-200)'}}>
                  {group.profile_picture
                    ? <img src={mediaUrl(group.profile_picture)} alt={group.username} className="w-full h-full object-cover" />
                    : <div className="w-full h-full" style={{background:'var(--cream-200)'}} />}
                </div>
              </div>
              <span className={`text-xs truncate max-w-[68px]`} style={{color: viewed ? 'var(--stone-400)' : 'var(--ink-800)'}}>
                {group.username}
              </span>
            </button>
          );
        })}
      </div>

      {/* Own Story Viewer */}
      {viewerGroup?.is_own && (
        <StoryViewer
          group={viewerGroup}
          isOwn={true}
          onClose={() => setViewerGroup(null)}
          onNext={() => { if (othersGroups.length > 0) { setViewerGroupIdx(0); setViewerGroup(othersGroups[0]); } else setViewerGroup(null); }}
          onPrev={() => setViewerGroup(null)}
          hasPrev={false}
          hasNext={othersGroups.length > 0}
          nextGroup={othersGroups[0] || null}
          prevGroup={null}
          onDelete={handleDeleteStory}
        />
      )}

      {/* Others' Story Viewer */}
      {viewerGroup && !viewerGroup.is_own && viewerGroupIdx !== null && (
        <StoryViewer
          group={viewerGroup}
          isOwn={false}
          onClose={() => { setViewerGroup(null); setViewerGroupIdx(null); }}
          onNext={() => {
            if (viewerGroupIdx < othersGroups.length - 1) {
              const next = viewerGroupIdx + 1;
              setViewerGroupIdx(next); setViewerGroup(othersGroups[next]);
            } else { setViewerGroup(null); setViewerGroupIdx(null); }
          }}
          onPrev={() => {
            if (viewerGroupIdx > 0) {
              const prev = viewerGroupIdx - 1;
              setViewerGroupIdx(prev); setViewerGroup(othersGroups[prev]);
            } else if (ownGroup) { setViewerGroup(ownGroup); setViewerGroupIdx(null); }
          }}
          hasPrev={viewerGroupIdx > 0 || !!ownGroup}
          hasNext={viewerGroupIdx < othersGroups.length - 1}
          prevGroup={viewerGroupIdx > 0 ? othersGroups[viewerGroupIdx - 1] : ownGroup || null}
          nextGroup={viewerGroupIdx < othersGroups.length - 1 ? othersGroups[viewerGroupIdx + 1] : null}
          onDelete={() => {}}
        />
      )}

      {showAddModal && (
        <AddStoryModal
          onClose={() => setShowAddModal(false)}
          onUploaded={() => { fetchStories(); setShowAddModal(false); }}
        />
      )}
    </>
  );
}
