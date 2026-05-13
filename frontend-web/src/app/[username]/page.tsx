"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { apiUrl, mediaUrl } from "@/lib/api";
import { timeAgo } from "@/lib/time";

const isVideo = (url: string) =>
  url && [".mp4", ".webm", ".mov", ".avi"].some((e) => url.toLowerCase().endsWith(e));

// ─── Post Modal ───────────────────────────────────────────────────────────────
function PostModal({ post, onClose, onLike, onDelete, session }: any) {
  const [fullPost, setFullPost] = useState<any>(null);
  const [muted, setMuted] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const url = session?.user?.email
      ? apiUrl(`/posts/${post.id}?email=${encodeURIComponent(session.user.email)}`)
      : apiUrl(`/posts/${post.id}`);
    fetch(url).then((r) => r.json()).then(setFullPost);
  }, [post.id, session]);

  const handleLike = () => {
    if (fullPost) {
      setFullPost((p: any) => ({
        ...p,
        has_liked: !p.has_liked,
        likes_count: p.has_liked ? p.likes_count - 1 : p.likes_count + 1,
      }));
    }
    onLike();
  };

  const displayed = fullPost || post;
  const isOwnPost = session?.user?.name === displayed.username;

  const handleDelete = async () => {
    if (!isOwnPost || deleting) return;
    if (!confirm("Delete this post? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await onDelete(displayed.id);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 md:p-8" onClick={onClose}>
      <button className="absolute top-5 right-5 text-white text-2xl hover:text-[var(--stone-300)] transition-colors z-10" onClick={onClose}>✕</button>
      <div
        className="border border-[var(--border)] flex flex-col w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-xl shadow-2xl"
        style={{ background: "var(--surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* User */}
        <div className="flex items-center gap-3 p-4 border-b border-[var(--border)]">
          <div className="w-10 h-10 rounded-full overflow-hidden border border-[var(--border)]">
            {displayed.profile_picture ? (
              <img src={mediaUrl(displayed.profile_picture)} alt="" className="w-full h-full object-cover" />
            ) : <span className="flex items-center justify-center w-full h-full text-xs">User</span>}
          </div>
          <Link href={`/${displayed.username}`} onClick={onClose} className="font-semibold text-sm hover:underline">{displayed.username}</Link>
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

        {/* Media */}
        <div className="w-full flex items-center justify-center border-b border-[var(--border)]" style={{ background: "var(--cream-50)" }}>
          {isVideo(displayed.media_url) ? (
            <div className="relative w-full flex items-center justify-center">
              <video
                src={mediaUrl(displayed.media_url)}
                className="w-full max-h-[70vh] object-contain"
                autoPlay
                muted={muted}
                loop
                playsInline
              />
              <button
                className="absolute top-3 right-3/50 hover:bg-black/40 text-[var(--ink-900)] rounded-full p-1.5 transition-colors"
                onClick={() => setMuted(m => !m)}
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
            </div>
          ) : (
            <img src={mediaUrl(displayed.media_url)} alt="Post" className="w-full max-h-[70vh] object-contain" />
          )}
        </div>

        {/* Details */}
        <div className="w-full flex flex-col">
          {/* Header */}
          <div className="hidden items-center gap-3 p-4 border-b border-[var(--border)]">
            <div className="w-9 h-9 rounded-full overflow-hidden ">
              {displayed.profile_picture ? (
                <img src={mediaUrl(displayed.profile_picture)} alt="" className="w-full h-full object-cover" />
              ) : <span className="flex items-center justify-center w-full h-full text-xs">👤</span>}
            </div>
            <Link href={`/${displayed.username}`} onClick={onClose} className="font-semibold text-sm hover:underline">{displayed.username}</Link>
          </div>

          {/* Comments scroll */}
          <div id="profile-post-comments" className="order-2 p-4 flex flex-col gap-3 scrollbar-hide border-t border-[var(--border)]">
            {displayed.caption && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full overflow-hidden shrink-0">
                  {displayed.profile_picture ? <img src={mediaUrl(displayed.profile_picture)} alt="" className="w-full h-full object-cover" /> : <span className="flex items-center justify-center w-full h-full text-xs">👤</span>}
                </div>
                <p className="text-sm"><span className="font-semibold mr-2">{displayed.username}</span>{displayed.caption}</p>
              </div>
            )}
            <div className="font-semibold text-sm mt-1">Comments</div>
            {!fullPost ? (
              <div className="text-[var(--stone-500)] text-sm text-center py-6">Loading...</div>
            ) : fullPost.comments.length === 0 ? (
              <div className="text-[var(--stone-500)] text-sm text-center py-6">No comments yet.</div>
            ) : (
              fullPost.comments.map((c: any) => (
                <div key={c.id} className="flex gap-3">
                  <div className="w-8 h-8 rounded-full overflow-hidden shrink-0">
                    {c.profile_picture ? <img src={mediaUrl(c.profile_picture)} alt="" className="w-full h-full object-cover" /> : <span className="flex items-center justify-center w-full h-full text-xs">👤</span>}
                  </div>
                  <p className="text-sm"><span className="font-semibold mr-2">{c.username}</span>{c.content}</p>
                </div>
              ))
            )}
          </div>

          {/* Actions */}
          <div className="order-1 p-4">
            <div className="flex items-center gap-4 mb-2">
              <button onClick={handleLike} className="text-2xl hover:scale-110 transition-transform">{displayed.has_liked ? "♥" : "♡"}</button>
              <button className="text-2xl hover:scale-110 transition-transform" onClick={() => document.getElementById("profile-post-comments")?.scrollIntoView({ behavior: "smooth" })}>💬</button>
            </div>
            <div className="font-semibold text-sm mb-0.5">{displayed.likes_count} {displayed.likes_count === 1 ? "like" : "likes"}</div>
            <div className="text-xs text-[var(--stone-500)]">{timeAgo(displayed.created_at)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Followers/Following Modal ────────────────────────────────────────────────
function UserListModal({ title, users, loading, onClose }: any) {
  return (
    <div className="fixed inset-0/80 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div 
        className="border border-[var(--border)] rounded-xl w-full max-w-sm max-h-[70vh] flex flex-col overflow-hidden shadow-2xl" 
        style={{ background: "var(--surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
          <h2 className="font-bold text-base capitalize">{title}</h2>
          <button onClick={onClose} className="text-[var(--stone-400)] hover:text-[var(--ink-900)] transition-colors text-xl font-bold">✕</button>
        </div>
        <div className="overflow-y-auto p-2 flex-1 scrollbar-hide">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3 animate-pulse">
                <div className="w-11 h-11 rounded-full shrink-0" />
                <div className="h-3 w-32 rounded" />
              </div>
            ))
          ) : users.length === 0 ? (
            <p className="text-[var(--stone-500)] text-sm text-center py-8">No {title} yet.</p>
          ) : (
            users.map((u: any) => (
              <Link key={u.username} href={`/${u.username}`} onClick={onClose}>
                <div className="flex items-center gap-3 hover:bg-[var(--cream-100)]/60 p-3 rounded-xl transition-colors cursor-pointer">
                  <div className="w-11 h-11 rounded-full overflow-hidden border border-[var(--border)] shrink-0">
                    {u.profile_picture ? (
                      <img src={mediaUrl(u.profile_picture)} alt={u.username} className="w-full h-full object-cover" />
                    ) : <span className="flex items-center justify-center w-full h-full">👤</span>}
                  </div>
                  <span className="font-semibold text-sm">{u.username}</span>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Profile Skeleton ─────────────────────────────────────────────────────────
function ProfileSkeleton() {
  return (
    <div className="w-full max-w-4xl animate-pulse">
      <div className="flex flex-col md:flex-row items-center md:items-start gap-8 mb-12 border-b border-[var(--border)] pb-12">
        <div className="w-36 h-36 rounded-full " />
        <div className="flex-1 flex flex-col gap-4 pt-2">
          <div className="h-6 w-40 rounded" />
          <div className="flex gap-8">
            <div className="h-4 w-16 rounded" />
            <div className="h-4 w-20 rounded" />
            <div className="h-4 w-20 rounded" />
          </div>
          <div className="h-3 w-48 rounded" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1 md:gap-1">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="aspect-square " />
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
function ProfileContent() {
  const { data: session } = useSession();
  const { username } = useParams();
  const searchParams = useSearchParams();
  const [profile, setProfile] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState(false);
  const [listModal, setListModal] = useState<{ type: "followers" | "following"; users: any[]; loading: boolean } | null>(null);
  const [selectedPost, setSelectedPost] = useState<any>(null);


  useEffect(() => {
    if (!username) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (session?.user?.email) params.set("email", session.user.email);
    if (searchParams.get("source") === "face_search") params.set("source", "face_search");
    const query = params.toString() ? `?${params.toString()}` : "";

    fetch(apiUrl(`/users/${username}${query}`))
      .then((r) => r.json())
      .then(async (profileData) => {
      setProfile(profileData);
      if (!profileData.can_view_profile) {
        setPosts([]);
        return;
      }
      const postParams = new URLSearchParams();
      if (session?.user?.email) postParams.set("email", session.user.email);
      const postQuery = postParams.toString() ? `?${postParams.toString()}` : "";
      const postsRes = await fetch(apiUrl(`/users/${username}/posts${postQuery}`));
      if (postsRes.ok) {
        const postsData = await postsRes.json();
        setPosts(postsData.posts || []);
      } else {
        setPosts([]);
      }
    }).finally(() => setLoading(false));
  }, [username, session, searchParams]);

  useEffect(() => {
    const postId = searchParams.get("post");
    if (postId && !loading) {
      openPostModal(parseInt(postId));
    }
  }, [searchParams, loading]);

  const openListModal = async (type: "followers" | "following") => {
    setListModal({ type, users: [], loading: true });
    const params = new URLSearchParams();
    if (session?.user?.email) params.set("email", session.user.email);
    const query = params.toString() ? `?${params.toString()}` : "";
    const res = await fetch(apiUrl(`/users/${username}/${type}${query}`));
    if (!res.ok) {
      setListModal({ type, users: [], loading: false });
      return;
    }
    const data = await res.json();
    setListModal({ type, users: data, loading: false });
  };

  const openPostModal = async (postId: number) => {
    const url = session?.user?.email
      ? apiUrl(`/posts/${postId}?email=${encodeURIComponent(session.user.email)}`)
      : apiUrl(`/posts/${postId}`);
    const res = await fetch(url);
    if (res.ok) setSelectedPost(await res.json());
  };



  const toggleLike = async () => {
    if (!session?.user?.email || !selectedPost) return;
    setSelectedPost((p: any) => ({ ...p, has_liked: !p.has_liked, likes_count: p.has_liked ? p.likes_count - 1 : p.likes_count + 1 }));
    const fd = new FormData();
    fd.append("email", session.user.email);
    await fetch(apiUrl(`/posts/${selectedPost.id}/like`), { method: "POST", body: fd });
  };

  const deletePost = async (postId: number) => {
    if (!session?.user?.email) return;
    const res = await fetch(apiUrl(`/posts/${postId}?email=${encodeURIComponent(session.user.email)}`), {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.detail || "Failed to delete post");
      return;
    }
    setPosts((cur) => cur.filter((p) => p.id !== postId));
    setProfile((p: any) => p ? { ...p, posts_count: Math.max(0, (p.posts_count || 1) - 1) } : p);
    setSelectedPost(null);
  };

  const toggleFollow = async () => {
    if (!session?.user?.email) return alert("Please log in");
    setFollowLoading(true);
    const fd = new FormData();
    fd.append("email", session.user.email);
    const res = await fetch(apiUrl(`/users/${username}/follow`), { method: "POST", body: fd });
    if (res.ok) {
      const data = await res.json();
      setProfile((p: any) => {
        const wasFollowing = p.is_following;
        const isFollowing = data.is_following;
        const followerDelta = wasFollowing === isFollowing ? 0 : isFollowing ? 1 : -1;
        return {
          ...p,
          is_following: isFollowing,
          follow_request_status: data.follow_request_status,
          followers_count: Math.max(0, p.followers_count + followerDelta),
          can_view_profile: isOwnProfile || isFollowing || !p.is_private,
        };
      });
      if (profile?.is_private && !data.is_following && !isOwnProfile) setPosts([]);
    }
    setFollowLoading(false);
  };

  const isOwnProfile = session?.user?.name === profile?.username;

  if (loading) return <main className="flex-1 flex flex-col items-center pt-10 px-4 pb-20"><ProfileSkeleton /></main>;
  if (!profile || profile.detail) return <main className="flex-1 flex items-center justify-center"><p className="text-[var(--stone-500)]">User not found.</p></main>;

  const isPrivateLocked = profile.is_private && !profile.can_view_profile && !isOwnProfile;
  const followButtonText = followLoading
    ? "..."
    : profile.is_following
      ? "Following"
      : profile.follow_request_status === "pending"
        ? "Requested"
        : profile.is_private
          ? "Request Follow"
          : "Follow";

  return (
    <main className="relative flex-1 flex flex-col items-center pt-10 px-4 pb-24">
      {isOwnProfile && (
        <Link
          href="/settings"
          className="md:hidden absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ color: "var(--ink-900)", background: "var(--cream-100)", border: "1px solid var(--border)" }}
          aria-label="Settings"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.9}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.66.84.078.034.154.07.23.107.325.158.705.138 1.01-.068l1.08-.73a1.125 1.125 0 011.45.12l1.833 1.833c.389.389.44 1.003.12 1.45l-.73 1.08c-.206.305-.226.685-.068 1.01.037.076.073.152.107.23.154.347.466.597.84.66l1.281.213c.542.09.94.56.94 1.11v2.593c0 .55-.398 1.02-.94 1.11l-1.281.213c-.374.063-.686.313-.84.66a6.78 6.78 0 01-.107.23c-.158.325-.138.705.068 1.01l.73 1.08c.32.447.269 1.061-.12 1.45l-1.833 1.833a1.125 1.125 0 01-1.45.12l-1.08-.73c-.305-.206-.685-.226-1.01-.068a6.78 6.78 0 01-.23.107c-.347.154-.597.466-.66.84l-.213 1.281c-.09.542-.56.94-1.11.94h-2.593c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.063-.374-.313-.686-.66-.84a6.78 6.78 0 01-.23-.107c-.325-.158-.705-.138-1.01.068l-1.08.73a1.125 1.125 0 01-1.45-.12l-1.833-1.833a1.125 1.125 0 01-.12-1.45l.73-1.08c.206-.305.226-.685.068-1.01a6.78 6.78 0 01-.107-.23c-.154-.347-.466-.597-.84-.66l-1.281-.213a1.125 1.125 0 01-.94-1.11v-2.593c0-.55.398-1.02.94-1.11l1.281-.213c.374-.063.686-.313.84-.66.034-.078.07-.154.107-.23.158-.325.138-.705-.068-1.01l-.73-1.08a1.125 1.125 0 01.12-1.45L4.95 5.49a1.125 1.125 0 011.45-.12l1.08.73c.305.206.685.226 1.01.068.076-.037.152-.073.23-.107.347-.154.597-.466.66-.84l.213-1.281z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </Link>
      )}
      <div className="w-full max-w-4xl">

        {/* ── Profile Header ── */}
        <div className="flex flex-col md:flex-row items-center md:items-start gap-8 mb-10 pb-10 border-b border-[var(--border)]">
          {/* Avatar with gradient ring */}
          <div className="p-[3px] rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 shrink-0">
            <div className="w-32 h-32 md:w-36 md:h-36 rounded-full overflow-hidden border-2 border-black">
              {profile.profile_picture ? (
                <img src={mediaUrl(profile.profile_picture)} alt={profile.username} className="w-full h-full object-cover" />
              ) : <span className="flex items-center justify-center w-full h-full text-5xl text-[var(--stone-500)]">👤</span>}
            </div>
          </div>

          {/* Info */}
          <div className="flex-1 text-center md:text-left">
            <div className="flex flex-col md:flex-row items-center md:items-center gap-3 mb-5">
              <h1 className="text-xl font-light">{profile.username}</h1>
              {isOwnProfile ? (
                <div className="flex gap-2">
                  <button className="px-4 py-1.5 hover:bg-zinc-700 text-[var(--ink-900)] font-semibold rounded-lg text-sm transition-colors">
                    Edit Profile
                  </button>

                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={toggleFollow}
                    disabled={followLoading}
                    className={`px-5 py-1.5 font-semibold rounded-lg text-sm transition-all ${profile.is_following ? "hover:bg-red-900/40 hover:text-red-400 text-[var(--ink-900)]" : profile.follow_request_status === "pending" ? "hover:bg-zinc-700 text-[var(--ink-900)]" : "btn-dark text-[var(--ink-900)]"}`}
                  >
                    {followButtonText}
                  </button>
                  {!isPrivateLocked && (
                    <Link href={`/messages?user=${profile.username}`}>
                      <button className="px-5 py-1.5 hover:bg-zinc-700 text-[var(--ink-900)] font-semibold rounded-lg text-sm transition-colors">Message</button>
                    </Link>
                  )}
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="flex justify-center md:justify-start gap-8 mb-5">
              <span><strong className="font-semibold">{profile.posts_count}</strong> <span className="text-[var(--stone-400)]">posts</span></span>
              <button onClick={() => !isPrivateLocked && openListModal("followers")} className={isPrivateLocked ? "cursor-default" : "hover:underline cursor-pointer"}>
                <strong className="font-semibold">{profile.followers_count}</strong> <span className="text-[var(--stone-400)]">followers</span>
              </button>
              <button onClick={() => !isPrivateLocked && openListModal("following")} className={isPrivateLocked ? "cursor-default" : "hover:underline cursor-pointer"}>
                <strong className="font-semibold">{profile.following_count}</strong> <span className="text-[var(--stone-400)]">following</span>
              </button>
            </div>

            <div className="text-sm">
              <p className="font-semibold">{profile.username}</p>
              {profile.is_private && <p className="text-xs text-[var(--stone-500)] mt-1">Private account</p>}
              {profile.bio && <p className="text-[var(--ink-700)] mt-1 whitespace-pre-wrap">{profile.bio}</p>}
            </div>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex justify-center gap-10 text-xs font-semibold tracking-widest text-[var(--stone-500)] uppercase mb-1 border-t border-[var(--border)] -mt-[1px]">
          <button className="flex items-center gap-2 pt-3 text-[var(--ink-900)] border-t border-white -mt-[1px] pb-1">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
            </svg>
            Posts
          </button>
        </div>

        {/* ── Post Grid ── */}
        {isPrivateLocked ? (
          <div className="text-center py-20 text-[var(--stone-500)] border border-[var(--border)] rounded-2xl">
            <div className="text-5xl mb-4">🔒</div>
            <h2 className="text-lg font-semibold text-[var(--ink-900)] mb-1">This Account is Private</h2>
            <p className="text-sm">Send a follow request to see this profile&apos;s posts.</p>
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-20 text-[var(--stone-500)]">
            <div className="text-5xl mb-4">📷</div>
            <h2 className="text-lg font-semibold text-[var(--ink-900)] mb-1">No Posts Yet</h2>
            {isOwnProfile && <Link href="/create"><span className="text-[var(--ink-800)] text-sm cursor-pointer hover:underline">Share your first photo</span></Link>}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-[2px] md:gap-1">
            {posts.map((post) => (
              <div
                key={post.id}
                onClick={() => openPostModal(post.id)}
                className="aspect-square overflow-hidden relative group cursor-pointer"
              >
                {isVideo(post.media_url) ? (
                  <video src={mediaUrl(post.media_url)} className="w-full h-full object-cover group-hover:brightness-75 transition-all" muted playsInline />
                ) : (
                  <img src={mediaUrl(post.media_url)} alt="Post" className="w-full h-full object-cover group-hover:brightness-75 transition-all duration-200" />
                )}
                {/* Video indicator */}
                {isVideo(post.media_url) && (
                  <div className="absolute top-2 right-2 text-[var(--ink-900)]">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 drop-shadow">
                      <path d="M4 4h16l-8 16-8-16z" />
                    </svg>
                  </div>
                )}
                <div className="absolute inset-0 flex items-center justify-center gap-6 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <span className="text-[var(--ink-900)] font-bold text-sm drop-shadow">♥ {post.likes_count}</span>
                  <span className="text-[var(--ink-900)] font-bold text-sm drop-shadow">💬 {post.comments_count}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {listModal && (
        <UserListModal
          title={listModal.type}
          users={listModal.users}
          loading={listModal.loading}
          onClose={() => setListModal(null)}
        />
      )}

      {selectedPost && (
        <PostModal
          post={selectedPost}
          session={session}
          onClose={() => setSelectedPost(null)}
          onLike={toggleLike}
          onDelete={deletePost}
        />
      )}


    </main>
  );
}

import { Suspense } from "react";
export default function ProfilePage() {
  return (
    <Suspense fallback={<div className="flex-1 flex flex-col items-center pt-10 px-4 pb-20"><ProfileSkeleton /></div>}>
      <ProfileContent />
    </Suspense>
  );
}
