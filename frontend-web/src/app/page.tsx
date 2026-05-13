"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import StoriesBar from "@/components/StoriesBar";
import { useMyProfilePic } from "@/hooks/useMyProfilePic";
import { apiUrl, mediaUrl } from "@/lib/api";
import { timeAgo } from "@/lib/time";

// --- Skeleton Card ---
function PostSkeleton() {
  return (
    <div className="flex flex-col gap-3 pb-8 animate-pulse" style={{borderBottom:'1px solid var(--border)'}}>
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full" style={{background:'var(--cream-200)'}} />
        <div className="h-3 w-24 rounded" style={{background:'var(--cream-200)'}} />
      </div>
      <div className="w-full aspect-square rounded-sm" style={{background:'var(--cream-100)'}} />
      <div className="h-3 w-20 rounded" style={{background:'var(--cream-200)'}} />
      <div className="h-3 w-full rounded" style={{background:'var(--cream-200)'}} />
      <div className="h-3 w-3/4 rounded" style={{background:'var(--cream-200)'}} />
    </div>
  );
}

function MobileHomeHeader({ session }: { session: any }) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!session?.user?.email) return;
    const email = encodeURIComponent(session.user.email);
    fetch(apiUrl(`/notifications/unread-count?email=${email}`))
      .then(r => r.json())
      .then(d => setUnreadCount(d.count || 0))
      .catch(() => {});
  }, [session?.user?.email]);

  return (
    <div className="md:hidden flex items-center justify-between pt-1 pb-2">
      <Link href="/" className="text-[22px] font-black italic tracking-tight" style={{ color: "var(--ink-900)", fontFamily: "Georgia, serif" }}>
        velmoraa
      </Link>
      <div className="flex items-center gap-2">
        <Link href="/notifications" className="relative flex h-10 w-10 items-center justify-center rounded-xl" style={{ color: "var(--ink-900)" }} aria-label="Notifications">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.9}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
          </svg>
          {unreadCount > 0 && (
            <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full" style={{ background: "#dc2626" }} />
          )}
        </Link>
        <Link href="/messages" className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ color: "var(--ink-900)" }} aria-label="Messages">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.9}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
          </svg>
        </Link>
      </div>
    </div>
  );
}

// --- Post Modal ---
function PostModal({ post, onClose, session, onLike, onComment, onDelete }: any) {
  const [commentText, setCommentText] = useState("");
  const [fullPost, setFullPost] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function load() {
      const url = session?.user?.email
        ? apiUrl(`/posts/${post.id}?email=${encodeURIComponent(session.user.email)}`)
        : apiUrl(`/posts/${post.id}`);
      const res = await fetch(url);
      if (res.ok) setFullPost(await res.json());
    }
    load();
  }, [post.id, session]);

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user?.email || !commentText.trim()) return;
    try {
      const res = await fetch(apiUrl(`/posts/${post.id}/comment`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: session.user.email, content: commentText }),
      });
      const data = await res.json();
      setFullPost((prev: any) => ({ ...prev, comments: [...prev.comments, data.comment] }));
      onComment(post.id);
      setCommentText("");
    } catch (e) { console.error(e); }
  };

  const isOwnPost = session?.user?.name === post.username;

  const handleDelete = async () => {
    if (!isOwnPost || deleting) return;
    setDeleting(true);
    try {
      await onDelete(post.id);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-10" style={{background:'rgba(0,0,0,0.5)'}} onClick={onClose}>
      <button className="absolute top-4 right-4 text-3xl font-bold transition-colors" style={{color:'var(--stone-400)'}} onClick={onClose}>✕</button>
      <div className="flex flex-col md:flex-row w-full max-w-5xl h-full max-h-[90vh] overflow-hidden rounded-2xl" style={{background:'var(--surface)',border:'1px solid var(--border)',boxShadow:'var(--shadow-lg)'}} onClick={e => e.stopPropagation()}>
        {/* Image side */}
        <div className="w-full md:w-[60%] flex items-center justify-center" style={{background:'var(--cream-50)',borderRight:'1px solid var(--border)'}}>
          <img src={mediaUrl(post.media_url)} alt="Post" className="w-full h-full object-contain max-h-[50vh] md:max-h-full" />
        </div>
        {/* Details */}
        <div className="w-full md:w-[40%] flex flex-col h-[50vh] md:h-full" style={{background:'var(--surface)'}}>
          <div className="flex items-center gap-3 p-4" style={{borderBottom:'1px solid var(--border)'}}>
            <div className="w-8 h-8 rounded-full overflow-hidden" style={{background:'var(--cream-200)',border:'1px solid var(--border)'}}>
              {post.profile_picture ? <img src={mediaUrl(post.profile_picture)} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full" style={{background:'var(--cream-200)'}} />}
            </div>
            <Link href={`/${post.username}`} onClick={onClose} className="font-semibold text-sm hover:underline" style={{color:'var(--ink-900)'}}>{post.username}</Link>
            {isOwnPost && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="ml-auto text-sm font-semibold text-red-600 hover:text-red-700 disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 scrollbar-hide">
            {post.caption && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full overflow-hidden shrink-0" style={{background:'var(--cream-200)'}}>
                  {post.profile_picture ? <img src={mediaUrl(post.profile_picture)} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full" style={{background:'var(--cream-200)'}} />}
                </div>
                <p className="text-sm"><span className="font-semibold mr-2">{post.username}</span>{post.caption}</p>
              </div>
            )}
            {!fullPost ? (
              <div className="text-sm text-center py-4" style={{color:'var(--stone-400)'}}>Loading comments...</div>
            ) : fullPost.comments.length === 0 ? (
              <div className="text-sm text-center py-4" style={{color:'var(--stone-400)'}}>No comments yet. Be first!</div>
            ) : (
              fullPost.comments.map((c: any) => (
                <div key={c.id} className="flex gap-3">
                  <div className="w-8 h-8 rounded-full overflow-hidden shrink-0" style={{background:'var(--cream-200)'}}>
                    {c.profile_picture ? <img src={mediaUrl(c.profile_picture)} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full" style={{background:'var(--cream-200)'}} />}
                  </div>
                  <p className="text-sm"><span className="font-semibold mr-2">{c.username}</span>{c.content}</p>
                </div>
              ))
            )}
          </div>
          <div className="p-4" style={{borderTop:'1px solid var(--border)',background:'var(--surface)'}}>
            <div className="flex items-center gap-4 mb-2">
              <button onClick={() => onLike(post.id)} className="text-2xl hover:scale-110 transition-transform">
                {post.has_liked ? "❤" : "♡"}
              </button>
              <button className="text-2xl hover:scale-110 transition-transform" style={{color:'var(--ink-700)'}} onClick={() => document.getElementById("modal-comment")?.focus()}>&#x1f4ac;</button>
            </div>
            <div className="font-semibold text-sm mb-1" style={{color:'var(--ink-900)'}}>{post.likes_count} likes</div>
            <div className="text-xs mb-3" style={{color:'var(--stone-400)'}}>{timeAgo(post.created_at)}</div>
            <form onSubmit={handleComment} className="flex items-center pt-3 gap-2" style={{borderTop:'1px solid var(--border)'}}>
              <input id="modal-comment" type="text" placeholder="Add a comment..." className="input flex-1 py-2 text-sm" value={commentText} onChange={e => setCommentText(e.target.value)} />
              <button type="submit" disabled={!commentText.trim()} className="font-semibold text-sm disabled:opacity-40 transition-opacity" style={{color:'var(--ink-900)'}}>Post</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Post Card ---
function PostCard({ post, onLike, onComment, onOpenModal, onDelete, session }: any) {
  const lastTap = useRef(0);
  const [heartPop, setHeartPop] = useState(false);
  const [muted, setMuted] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const isVideo = (url: string) => url && ['.mp4', '.webm', '.mov', '.avi'].some(ext => url.toLowerCase().endsWith(ext));
  const isOwnPost = session?.user?.name === post.username;

  const handleDelete = async () => {
    if (!isOwnPost || deleting) return;
    setDeleting(true);
    try {
      await onDelete(post.id);
    } finally {
      setDeleting(false);
    }
  };

  const handleDoubleTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      if (!post.has_liked) {
        onLike(post.id);
        setHeartPop(true);
        setTimeout(() => setHeartPop(false), 800);
      }
    }
    lastTap.current = now;
  };

  return (
    <div className="flex flex-col gap-2 pb-8" style={{borderBottom:'1px solid var(--border)'}}>
      {/* Header */}
      <div className="flex items-center justify-between py-2">
        <div className="flex items-center gap-3">
          <Link href={`/${post.username}`}>
            <div className="w-9 h-9 rounded-full overflow-hidden cursor-pointer hover:opacity-80 transition-opacity" style={{background:'var(--cream-200)',border:'1.5px solid var(--border)'}}>
              {post.profile_picture ? (
                <img src={mediaUrl(post.profile_picture)} alt={post.username} className="w-full h-full object-cover" />
              ) : <div className="w-full h-full" style={{background:'var(--cream-200)'}} />}
            </div>
          </Link>
          <div>
            <Link href={`/${post.username}`}>
              <span className="font-semibold text-sm cursor-pointer transition-colors" style={{color:'var(--ink-900)'}}>{post.username}</span>
            </Link>
            <span className="text-xs ml-2" style={{color:'var(--stone-400)'}}>{timeAgo(post.created_at)}</span>
          </div>
        </div>
        {isOwnPost ? (
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-50"
          >
            {deleting ? "Deleting..." : "Delete"}
          </button>
        ) : (
          <button className="transition-colors px-2 py-1 text-lg font-bold" style={{color:'var(--stone-400)'}}>···</button>
        )}
      </div>

      {/* Media */}
      <div className="relative w-full rounded-lg overflow-hidden select-none" style={{background:'var(--cream-100)'}} onClick={handleDoubleTap}>
        {isVideo(post.media_url) ? (
        <>
          <video
            src={mediaUrl(post.media_url)}
            className="w-full object-cover max-h-[600px]"
            autoPlay
            muted={muted}
            loop
            playsInline
          />
          <button
            className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1.5 transition-colors z-10"
            onClick={e => { e.stopPropagation(); setMuted(m => !m); }}
          >
            {muted ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 001.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06zM17.78 9.22a.75.75 0 10-1.06 1.06L18.44 12l-1.72 1.72a.75.75 0 001.06 1.06l1.72-1.72 1.72 1.72a.75.75 0 101.06-1.06L20.56 12l1.72-1.72a.75.75 0 00-1.06-1.06l-1.72 1.72-1.72-1.72z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 001.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06zM18.584 5.106a.75.75 0 011.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 11-1.06-1.06 8.25 8.25 0 000-11.668.75.75 0 010-1.06z" />
                <path d="M15.932 7.757a.75.75 0 011.061 0 6 6 0 010 8.486.75.75 0 01-1.06-1.061 4.5 4.5 0 000-6.364.75.75 0 010-1.06z" />
              </svg>
            )}
          </button>
        </>

        ) : (
          <img src={mediaUrl(post.media_url)} alt="Post" className="w-full object-cover max-h-[600px]" />
        )}
        {heartPop && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-6xl animate-ping" style={{ animationDuration: "0.4s" }}>❤️</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-between items-center mt-1">
        <div className="flex gap-4">
          <button onClick={() => onLike(post.id)} className={`text-2xl transition-transform active:scale-90 ${post.has_liked ? "text-red-500" : ""}`} style={{color: post.has_liked ? undefined : 'var(--ink-700)'}}>
            {post.has_liked ? "♥" : "♡"}
          </button>
          <button className="text-2xl transition-colors" style={{color:'var(--ink-700)'}} onClick={() => onOpenModal(post)}>&#x1f4ac;</button>
          <button className="text-2xl transition-colors" style={{color:'var(--ink-700)'}}>↗</button>
        </div>
        <button className="text-2xl transition-colors" style={{color:'var(--ink-700)'}}>⚑</button>
      </div>

      {/* Info */}
      <div className="text-sm">
        <span className="font-semibold block mb-1">{post.likes_count} {post.likes_count === 1 ? "like" : "likes"}</span>
        {post.caption && (
          <p className="mb-1">
            <Link href={`/${post.username}`}>
              <span className="font-semibold mr-2 cursor-pointer" style={{color:'var(--ink-900)'}}>{post.username}</span>
            </Link>
            {post.caption}
          </p>
        )}
        {post.comments?.length > 0 && (
          <div className="mt-1 flex flex-col gap-0.5" style={{color:'var(--ink-700)'}}>
            {post.comments.map((c: any) => (
              <p key={c.id}>
                <Link href={`/${c.username}`}>
                  <span className="font-semibold mr-1 cursor-pointer" style={{color:'var(--ink-900)'}}>{c.username}</span>
                </Link>
                {c.content}
              </p>
            ))}
          </div>
        )}
        <button className="mt-1 text-sm transition-colors" style={{color:'var(--stone-400)'}} onClick={() => onOpenModal(post)}>
          View all comments
        </button>
      </div>

      {/* Comment input */}
      <form
        className="flex items-center pb-2 mt-1 gap-2"
        style={{borderBottom:'1px solid var(--border)'}}
        onSubmit={(e) => {
          const input = (e.currentTarget.elements.namedItem("comment") as HTMLInputElement);
          onComment(e, post.id, input.value);
          input.value = "";
        }}
      >
        <input type="text" name="comment" placeholder="Add a comment..." className="bg-transparent flex-1 outline-none text-sm" style={{color:'var(--ink-900)'}} autoComplete="off" />
        <button type="submit" className="font-semibold text-sm transition-colors" style={{color:'var(--ink-900)'}}>Post</button>
      </form>
    </div>
  );
}

// --- Stories Row ---
function StoriesRow({ session }: { session: any }) {
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    if (!session?.user?.email) return;
    fetch(apiUrl(`/suggestions?email=${encodeURIComponent(session.user.email)}&limit=8`))
      .then(r => r.json()).then(setUsers).catch(() => {});
  }, [session]);

  const gradients = ["from-pink-500 via-red-500 to-yellow-500", "from-purple-500 via-pink-500 to-red-500", "from-blue-500 via-cyan-400 to-teal-400", "from-orange-400 via-red-500 to-pink-500"];

  if (!users.length) return null;

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide mb-4" style={{borderBottom:'1px solid var(--border)'}}>
      {users.map((u, i) => (
        <Link href={`/${u.username}`} key={u.username} className="flex flex-col items-center gap-1.5 min-w-[72px] cursor-pointer">
          <div className={`w-16 h-16 rounded-full bg-gradient-to-tr ${gradients[i % gradients.length]} p-[2px] hover:scale-105 transition-transform`}>
            <div className="w-full h-full rounded-full overflow-hidden" style={{background:'var(--surface)',border:'2px solid var(--bg)'}}>
              {u.profile_picture ? (
                <img src={mediaUrl(u.profile_picture)} alt={u.username} className="w-full h-full object-cover" />
              ) : <div className="w-full h-full" style={{background:'var(--cream-200)'}} />}
            </div>
          </div>
          <span className="text-xs truncate max-w-[68px] text-center" style={{color:'var(--stone-500)'}}>{u.username}</span>
        </Link>
      ))}
    </div>
  );
}

// --- Right Sidebar ---
function RightSidebar({ session }: { session: any }) {
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [following, setFollowing] = useState<Record<string, boolean>>({});
  const myPic = useMyProfilePic();

  useEffect(() => {
    if (!session?.user?.email) return;
    fetch(apiUrl(`/suggestions?email=${encodeURIComponent(session.user.email)}&limit=5`))
      .then(r => r.json()).then(setSuggestions).catch(() => {});
  }, [session]);

  const handleFollow = async (username: string) => {
    if (!session?.user?.email) return;
    setFollowing(prev => ({ ...prev, [username]: true }));
    const fd = new FormData();
    fd.append("email", session.user.email);
    await fetch(apiUrl(`/users/${username}/follow`), { method: "POST", body: fd });
  };

  return (
    <aside className="hidden xl:flex flex-col w-80 pl-8 mt-10 shrink-0">
      {/* Current user */}
      {session?.user && (
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full overflow-hidden" style={{background:'var(--cream-200)',border:'1.5px solid var(--border)'}}>
              {myPic ? (
                <img src={myPic} alt="profile" className="w-full h-full object-cover" />
              ) : <div className="w-full h-full" style={{background:'var(--cream-200)'}} />}
            </div>
            <div>
              <Link href={`/${session.user.name}`}>
                <p className="font-semibold text-sm hover:underline cursor-pointer">{session.user.name}</p>
              </Link>
              <p className="text-xs truncate max-w-[160px]" style={{color:'var(--stone-400)'}}>{session.user.email}</p>
            </div>
          </div>
          <Link href={`/${session.user.name}`}>
            <span className="text-xs font-semibold cursor-pointer transition-colors" style={{color:'var(--stone-500)'}}>Switch</span>
          </Link>
        </div>
      )}

      {suggestions.length > 0 && (
        <>
          <div className="flex justify-between items-center mb-4">
            <span className="font-semibold text-sm" style={{color:'var(--stone-500)'}}>Suggested for you</span>
          </div>
          <div className="flex flex-col gap-4">
            {suggestions.map(s => (
              <div key={s.username} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Link href={`/${s.username}`}>
                    <div className="w-9 h-9 rounded-full overflow-hidden cursor-pointer hover:opacity-80 transition-opacity" style={{background:'var(--cream-200)',border:'1.5px solid var(--border)'}}>
                      {s.profile_picture ? (
                        <img src={mediaUrl(s.profile_picture)} alt={s.username} className="w-full h-full object-cover" />
                      ) : <div className="w-full h-full" style={{background:'var(--cream-200)'}} />}
                    </div>
                  </Link>
                  <div>
                    <Link href={`/${s.username}`}>
                      <p className="font-semibold text-sm hover:underline cursor-pointer">{s.username}</p>
                    </Link>
                    <p className="text-xs" style={{color:'var(--stone-400)'}}>Suggested for you</p>
                  </div>
                </div>
                {following[s.username] ? (
                  <span className="text-xs font-semibold" style={{color:'var(--stone-400)'}}>Following</span>
                ) : (
                  <button onClick={() => handleFollow(s.username)} className="text-xs font-semibold transition-colors" style={{color:'var(--ink-900)'}}>Follow</button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </aside>
  );
}

// --- Main Page ---
export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalPost, setModalPost] = useState<any>(null);

  // Redirect unauthenticated users to login
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  const fetchFeed = useCallback(async () => {
    try {
      const url = session?.user?.email
        ? apiUrl(`/feed?email=${encodeURIComponent(session.user.email)}`)
        : apiUrl("/feed");
      const res = await fetch(url);
      const data = await res.json();
      setPosts(data.posts || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [session]);

  // Wait until session is resolved (not loading) before fetching
  useEffect(() => {
    if (status === "loading" || status === "unauthenticated") return;
    fetchFeed();
  }, [fetchFeed, status]);

  // Show nothing while redirecting
  if (status === "loading" || status === "unauthenticated") {
    return <main className="flex-1" />;
  }



  const toggleLike = async (postId: number) => {
    if (!session?.user?.email) return alert("Please log in to like posts");
    setPosts(cur => cur.map(p => p.id === postId ? { ...p, has_liked: !p.has_liked, likes_count: p.has_liked ? p.likes_count - 1 : p.likes_count + 1 } : p));
    if (modalPost?.id === postId) {
      setModalPost((prev: any) => ({ ...prev, has_liked: !prev.has_liked, likes_count: prev.has_liked ? prev.likes_count - 1 : prev.likes_count + 1 }));
    }
    const fd = new FormData();
    fd.append("email", session.user.email);
    await fetch(apiUrl(`/posts/${postId}/like`), { method: "POST", body: fd });
  };

  const handleComment = async (e: React.FormEvent, postId: number, text: string) => {
    e.preventDefault();
    if (!session?.user?.email || !text.trim()) return;
    try {
      const res = await fetch(apiUrl(`/posts/${postId}/comment`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: session.user.email, content: text }),
      });
      const data = await res.json();
      setPosts(cur => cur.map(p => p.id === postId ? { ...p, comments: [...p.comments, data.comment] } : p));
    } catch (e) { console.error(e); }
  };

  const deletePost = async (postId: number) => {
    if (!session?.user?.email) return;
    if (!confirm("Delete this post? This cannot be undone.")) return;

    const res = await fetch(apiUrl(`/posts/${postId}?email=${encodeURIComponent(session.user.email)}`), {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.detail || "Failed to delete post");
      return;
    }

    setPosts((cur) => cur.filter((p) => p.id !== postId));
    if (modalPost?.id === postId) setModalPost(null);
  };

  return (
    <main className="flex-1 flex justify-center min-h-screen">
      <div className="w-full max-w-lg mt-0 md:mt-8 flex flex-col gap-5 md:gap-6 px-4 pb-24">
        <MobileHomeHeader session={session} />
        <StoriesBar session={session} />


        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <PostSkeleton key={i} />)
        ) : posts.length === 0 ? (
          <div className="text-center py-20">
            <p className="font-semibold text-lg mb-2" style={{color:'var(--ink-900)'}}>Your feed is empty</p>
            <p className="text-sm" style={{color:'var(--stone-400)'}}>Follow some users to see their posts here.</p>
          </div>
        ) : (
          posts.map(post => (
            <PostCard
              key={post.id}
              post={post}
              session={session}
              onLike={toggleLike}
              onComment={handleComment}
              onOpenModal={setModalPost}
              onDelete={deletePost}
            />
          ))
        )}
      </div>

      <RightSidebar session={session} />

      {modalPost && (
        <PostModal
          post={modalPost}
          session={session}
          onClose={() => setModalPost(null)}
          onLike={(id: number) => { toggleLike(id); setModalPost((prev: any) => ({ ...prev, has_liked: !prev.has_liked, likes_count: prev.has_liked ? prev.likes_count - 1 : prev.likes_count + 1 })); }}
          onComment={(postId: number) => setPosts(cur => cur.map(p => p.id === postId ? { ...p, comments_count: (p.comments_count || 0) + 1 } : p))}
          onDelete={deletePost}
        />
      )}
    </main>
  );
}
