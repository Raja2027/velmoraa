"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { apiUrl, mediaUrl } from "@/lib/api";
import { timeAgo } from "@/lib/time";
const isVideo = (url: string) => url && [".mp4", ".webm", ".mov", ".avi"].some(e => url.toLowerCase().endsWith(e));

const TYPE_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  like:                     { label: "liked your post",               color: "#dc2626", bg: "#fef2f2" },
  comment:                  { label: "commented:",                    color: "#2563eb", bg: "#eff6ff" },
  follow:                   { label: "started following you",         color: "#7c3aed", bg: "#f5f3ff" },
  follow_request:           { label: "requested to follow you",       color: "#2563eb", bg: "#eff6ff" },
  follow_request_accepted:  { label: "accepted your follow request",  color: "#15803d", bg: "#f0fdf4" },
  face_search_view:         { label: "viewed your profile via face search", color: "#c2410c", bg: "#fff7ed" },
  story_like:               { label: "liked your story",              color: "#db2777", bg: "#fdf2f8" },
  story_comment:            { label: "commented on your story:",      color: "#4f46e5", bg: "#eef2ff" },
  ghost_tag:                { label: "ghost-tagged you",              color: "#059669", bg: "#ecfdf5" },
};

export default function NotificationsPage() {
  const { data: session } = useSession();
  const [notifs, setNotifs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.user?.email) return;
    const email = encodeURIComponent(session.user.email);
    fetch(apiUrl(`/notifications?email=${email}`))
      .then(r => r.json())
      .then(d => setNotifs(d.notifications || []))
      .finally(() => setLoading(false));
    const fd = new FormData();
    fd.append("email", session.user.email);
    fetch(apiUrl("/notifications/mark-read"), { method: "POST", body: fd });
  }, [session]);

  const respondToFollowRequest = async (actor: string, action: "accept" | "decline") => {
    if (!session?.user?.email) return;
    const fd = new FormData();
    fd.append("email", session.user.email);
    const res = await fetch(apiUrl(`/follow-requests/${encodeURIComponent(actor)}/${action}`), { method: "POST", body: fd });
    if (res.ok) {
      setNotifs(items => items.map(n =>
        n.type === "follow_request" && n.actor_username === actor ? { ...n, follow_request_status: "handled" } : n
      ));
    }
  };

  if (!session) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p style={{ color: "var(--stone-400)" }}>Please log in to view notifications.</p>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col items-center pt-8 px-4 pb-24">
      <div className="w-full max-w-xl fade-up">
        <h1 className="text-xl font-bold mb-6" style={{ color: "var(--ink-900)" }}>Notifications</h1>

        {loading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-4 rounded-2xl animate-pulse"
                style={{ background: "var(--cream-100)", animationDelay: `${i * 60}ms` }}
              >
                <div className="w-11 h-11 rounded-full" style={{ background: "var(--cream-200)" }} />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-3/4 rounded-lg" style={{ background: "var(--cream-200)" }} />
                  <div className="h-2 w-1/3 rounded-lg" style={{ background: "var(--cream-200)" }} />
                </div>
              </div>
            ))}
          </div>
        ) : notifs.length === 0 ? (
          <div className="text-center py-20">
            <p className="font-semibold mb-1" style={{ color: "var(--ink-900)" }}>No notifications yet</p>
            <p className="text-sm" style={{ color: "var(--stone-400)" }}>
              When someone interacts with your posts, you'll see it here.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {notifs.map(n => {
              const cfg = TYPE_STYLE[n.type] || TYPE_STYLE.like;
              return (
                <Link
                  key={n.id}
                  href={n.post_id ? `/${session?.user?.name}?post=${n.post_id}` : `/${n.actor_username}`}
                  className="flex items-center gap-3 p-3.5 rounded-2xl transition-all duration-150 group"
                  style={{
                    background: n.is_read ? "var(--surface)" : cfg.bg,
                    border: `1px solid ${n.is_read ? "var(--border)" : "transparent"}`,
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = n.is_read ? "var(--cream-50)" : cfg.bg}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = n.is_read ? "var(--surface)" : cfg.bg}
                >
                  {/* Avatar */}
                  <div
                    className="w-11 h-11 rounded-full overflow-hidden flex-shrink-0"
                    style={{ border: "1.5px solid var(--border)" }}
                  >
                    {n.actor_profile_picture
                      ? <img src={mediaUrl(n.actor_profile_picture)} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full" style={{ background: "var(--cream-200)" }} />
                    }
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-snug" style={{ color: "var(--ink-900)" }}>
                      <span className="font-semibold">{n.actor_username}</span>{" "}
                      {n.type === "comment" && (
                        <>{cfg.label} <span style={{ color: "var(--stone-500)" }}>"{n.content_preview}"</span></>
                      )}
                      {n.type === "story_comment" && (
                        <>{cfg.label} <span style={{ color: "var(--stone-500)" }}>"{n.content_preview}"</span></>
                      )}
                      {n.type !== "comment" && n.type !== "story_comment" && cfg.label}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--stone-400)" }}>{timeAgo(n.created_at, " ago")}</p>

                    {n.type === "follow_request" && n.follow_request_status === "pending" && (
                      <div className="flex gap-2 mt-2.5">
                        <button
                          onClick={e => { e.preventDefault(); e.stopPropagation(); respondToFollowRequest(n.actor_username, "accept"); }}
                          className="btn btn-dark text-xs py-1.5 px-4 rounded-lg"
                        >
                          Accept
                        </button>
                        <button
                          onClick={e => { e.preventDefault(); e.stopPropagation(); respondToFollowRequest(n.actor_username, "decline"); }}
                          className="btn btn-outline text-xs py-1.5 px-4 rounded-lg"
                        >
                          Decline
                        </button>
                      </div>
                    )}
                    {n.type === "follow_request" && n.follow_request_status === "handled" && (
                      <p className="text-xs mt-1.5" style={{ color: "var(--stone-400)" }}>Request handled</p>
                    )}
                  </div>

                  {/* Post Thumbnail */}
                  {n.post_media_url && (
                    <div className="w-12 h-12 rounded overflow-hidden flex-shrink-0 ml-2" style={{ border: "1px solid var(--border)" }}>
                      {isVideo(n.post_media_url) ? (
                        <video src={mediaUrl(n.post_media_url)} className="w-full h-full object-cover" muted playsInline />
                      ) : (
                        <img src={mediaUrl(n.post_media_url)} alt="" className="w-full h-full object-cover" />
                      )}
                    </div>
                  )}

                  {/* Unread indicator */}
                  {!n.is_read && (
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cfg.color }} />
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
