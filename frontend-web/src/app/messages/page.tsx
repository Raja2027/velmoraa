"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useMyProfilePic } from "@/hooks/useMyProfilePic";
import { apiUrl, mediaUrl, wsUrl } from "@/lib/api";
import { timeAgo } from "@/lib/time";

// ── Icons ────────────────────────────────────────────────────────────────────
const ComposeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
  </svg>
);

const PaperPlaneIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-12 h-12">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
  </svg>
);

const SendIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
  </svg>
);

export default function MessagesPage() {
  const { data: session } = useSession();
  const myPic = useMyProfilePic();
  const [users, setUsers] = useState<any[]>([]);
  const [activeChat, setActiveChat] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState("");
  const [searchText, setSearchText] = useState("");
  const [followingUsers, setFollowingUsers] = useState<any[]>([]);
  const [showCompose, setShowCompose] = useState(false);
  const [loadingFollowing, setLoadingFollowing] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const ws = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const myUsername = session?.user?.name || session?.user?.email?.split("@")[0];

  // Load inbox
  useEffect(() => {
    if (!myUsername) return;
    const initialUser = new URLSearchParams(window.location.search).get("user");

    fetch(apiUrl(`/messages/${myUsername}/inbox`))
      .then(r => r.json())
      .then(data => {
        let inbox = (data || []).filter((u: any) => u.username !== myUsername);
        if (initialUser && !inbox.find((u: any) => u.username === initialUser)) {
          inbox = [{ username: initialUser, profile_picture: null, last_message: null, last_time: null }, ...inbox];
        }
        setUsers(inbox);
        if (initialUser) {
          const u = inbox.find((u: any) => u.username === initialUser);
          if (u) setActiveChat(u);
        }
      })
      .catch(() => {});
  }, [myUsername]);

  // Always ensure activeChat has a profile_picture
  useEffect(() => {
    if (!activeChat?.username) return;
    fetch(apiUrl(`/users/${activeChat.username}`))
      .then(r => r.json())
      .then(d => {
        if (d.profile_picture) {
          setActiveChat((prev: any) => ({ ...prev, profile_picture: d.profile_picture }));
        }
      })
      .catch(() => {});
  }, [activeChat?.username]);

  // Load messages for active chat
  useEffect(() => {
    if (!activeChat || !myUsername) return;
    setLoadingMessages(true);
    setMessages([]);

    fetch(apiUrl(`/messages/${myUsername}/${activeChat.username}`))
      .then(r => r.json())
      .then(d => setMessages(d.messages || []))
      .catch(() => {})
      .finally(() => setLoadingMessages(false));

    // WebSocket
    if (ws.current) ws.current.close();
    const socket = new WebSocket(wsUrl(`/ws/${myUsername}`));
    ws.current = socket;
    socket.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      // Accept message if it involves the active chat partner
      if (msg.sender === activeChat.username || msg.sender === myUsername) {
        setMessages(prev => [...prev, msg]);
      }
    };
    return () => socket.close();
  }, [activeChat, myUsername]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const openCompose = async () => {
    if (!myUsername || !session?.user?.email) return;
    setShowCompose(true);
    setLoadingFollowing(true);
    try {
      const res = await fetch(apiUrl(`/users/${myUsername}/following?email=${encodeURIComponent(session.user.email)}`));
      const data = await res.json();
      setFollowingUsers(Array.isArray(data) ? data : []);
    } catch {
      setFollowingUsers([]);
    } finally {
      setLoadingFollowing(false);
    }
  };

  const startChat = (user: any) => {
    setUsers(cur => cur.find(u => u.username === user.username)
      ? cur
      : [{ ...user, last_message: null, last_time: null, unread: 0 }, ...cur]
    );
    setActiveChat(user);
    setShowCompose(false);
  };

  const sendMessage = async () => {
    if (!inputText.trim() || !activeChat || !myUsername) return;
    const text = inputText.trim();
    setInputText("");
    const optimistic = { sender: myUsername, content: text, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, optimistic]);
    setUsers(cur => cur.map(u => u.username === activeChat.username ? {
      ...u,
      last_message: text,
      last_time: optimistic.timestamp,
    } : u));

    try {
      const fd = new FormData();
      fd.append("email", session?.user?.email || "");
      fd.append("receiver", activeChat.username);
      fd.append("content", text);
      const res = await fetch(apiUrl("/messages/send"), { method: "POST", body: fd });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to send message");
      }
    } catch (e) {
      setMessages(prev => prev.filter(msg => msg !== optimistic));
      alert(e instanceof Error ? e.message : "Failed to send message");
    }
  };

  const visibleUsers = users.filter(u => u.username.toLowerCase().includes(searchText.toLowerCase()));
  const visibleFollowing = followingUsers.filter(u => u.username.toLowerCase().includes(searchText.toLowerCase()));

  if (!session) {
    return (
      <main className="flex-1 flex items-center justify-center text-[var(--stone-500)]">
        Please log in to view messages.
      </main>
    );
  }

  return (
    <main className="flex-1 flex h-screen overflow-hidden border-l border-[var(--border)]">
      {/* ── Left Panel ─────────────────────────────────────────────────── */}
      <div className={`flex flex-col w-full md:w-[360px] border-r border-[var(--border)] shrink-0 ${activeChat ? "hidden md:flex" : "flex"}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <button className="flex items-center gap-2 font-bold text-base hover:text-[var(--ink-700)] transition-colors">
            {myUsername}
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-[var(--stone-400)]">
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
            </svg>
          </button>
          <button onClick={openCompose} className="text-[var(--ink-900)] hover:text-[var(--ink-700)] transition-colors"><ComposeIcon /></button>
        </div>

        {/* Search */}
        <div className="px-4 py-3">
          <div className="flex items-center gap-2 rounded-full px-4 py-2.5">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-[var(--stone-500)]">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
            </svg>
            <input
              className="bg-transparent outline-none text-sm placeholder-[var(--stone-400)] flex-1 text-[var(--ink-900)]"
              placeholder={showCompose ? "Search following" : "Search"}
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
            />
          </div>
        </div>

        {/* Messages / Requests tabs */}
        <div className="flex items-center justify-between px-5 py-2">
          <span className="font-bold text-sm">Messages</span>
          <button className="text-[var(--stone-400)] text-sm hover:text-[var(--ink-900)] transition-colors">Requests</button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {showCompose ? (
            loadingFollowing ? (
              <div className="text-center text-[var(--stone-500)] text-sm py-10 px-4">Loading following...</div>
            ) : visibleFollowing.length === 0 ? (
              <div className="text-center text-[var(--stone-500)] text-sm py-10 px-4">
                You are not following anyone yet.
              </div>
            ) : (
              visibleFollowing.map(u => (
                <button
                  key={u.username}
                  onClick={() => startChat(u)}
                  className="w-full flex items-center gap-3 px-4 py-3 transition-colors text-left hover:bg-[var(--cream-50)]"
                >
                  <div className="w-14 h-14 rounded-full overflow-hidden border border-[var(--border)] shrink-0">
                    {u.profile_picture
                      ? <img src={mediaUrl(u.profile_picture)} alt={u.username} className="w-full h-full object-cover" />
                      : <span className="flex items-center justify-center w-full h-full text-xl">👤</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{u.username}</p>
                    <p className="text-[var(--stone-500)] text-xs truncate mt-0.5">Start a conversation</p>
                  </div>
                </button>
              ))
            )
          ) : visibleUsers.length === 0 ? (
            <div className="text-center text-[var(--stone-500)] text-sm py-10 px-4">
              No conversations yet.<br />Start a chat with someone you follow.
            </div>
          ) : (
            visibleUsers.map(u => {
              const isActive = activeChat?.username === u.username;
              return (
                <button
                  key={u.username}
                  onClick={() => setActiveChat(u)}
                  className={`w-full flex items-center gap-3 px-4 py-3 transition-colors text-left ${isActive ? "bg-[var(--cream-100)]" : "hover:bg-[var(--cream-50)]"}`}
                >
                  {/* Avatar */}
                  <div className="relative shrink-0">
                    <div className="w-14 h-14 rounded-full overflow-hidden border border-[var(--border)]">
                      {u.profile_picture
                        ? <img src={mediaUrl(u.profile_picture)} alt={u.username} className="w-full h-full object-cover" />
                        : <span className="flex items-center justify-center w-full h-full text-xl">👤</span>}
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{u.username}</p>
                    <p className="text-[var(--stone-500)] text-xs truncate mt-0.5">
                      {u.last_message
                        ? `${u.last_message.substring(0, 30)}${u.last_message.length > 30 ? "…" : ""}`
                        : "Say hi 👋"}
                      {u.last_time && <span className="ml-1">· {timeAgo(u.last_time)}</span>}
                    </p>
                  </div>

                  {/* Unread dot */}
                  {u.unread > 0 && (
                    <div className="w-2 h-2 bg-[var(--ink-900)] rounded-full shrink-0" />
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Right Panel ────────────────────────────────────────────────── */}
      <div className={`flex-1 flex flex-col ${activeChat ? "flex" : "hidden md:flex"}`}>
        {activeChat ? (
          <>
            {/* Chat header */}
            <div className="flex items-center gap-3 px-5 py-3 border-b border-[var(--border)]">
              <button
                onClick={() => setActiveChat(null)}
                className="md:hidden text-[var(--ink-900)] mr-1"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </button>
              <Link href={`/${activeChat.username}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                <div className="w-10 h-10 rounded-full overflow-hidden border border-[var(--border)]">
                  {activeChat.profile_picture
                    ? <img src={mediaUrl(activeChat.profile_picture)} alt={activeChat.username} className="w-full h-full object-cover" />
                    : <span className="flex items-center justify-center w-full h-full">👤</span>}
                </div>
                <div>
                  <p className="font-bold text-sm">{activeChat.username}</p>
                  <p className="text-[var(--stone-500)] text-xs">View profile</p>
                </div>
              </Link>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-1">
              {loadingMessages ? (
                <div className="flex-1 flex items-center justify-center text-[var(--stone-500)] text-sm">Loading...</div>
              ) : messages.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3">
                  <div className="w-16 h-16 rounded-full overflow-hidden border border-[var(--border)]">
                    {activeChat.profile_picture
                      ? <img src={mediaUrl(activeChat.profile_picture)} className="w-full h-full object-cover" alt="" />
                      : <span className="flex items-center justify-center w-full h-full text-2xl">👤</span>}
                  </div>
                  <p className="font-bold">{activeChat.username}</p>
                  <p className="text-[var(--stone-500)] text-sm">Say hi 👋</p>
                </div>
              ) : (
                messages.map((msg, i) => {
                  const isMe = msg.sender === myUsername;
                  return (
                    <div key={i} className={`flex ${isMe ? "justify-end" : "justify-start"} mb-0.5`}>
                      <div className={`max-w-[70%] px-4 py-2.5 rounded-3xl text-sm ${
                        isMe
                          ? "bg-[var(--ink-900)] text-white rounded-br-md"
                          : "text-[var(--ink-900)] rounded-bl-md"
                      }`}>
                        {msg.content}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input bar */}
            <div className="border-t border-[var(--border)] px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full overflow-hidden border border-[var(--border)] shrink-0">
                {myPic
                  ? <img src={myPic} alt="me" className="w-full h-full object-cover" />
                  : <span className="flex items-center justify-center w-full h-full text-sm">👤</span>}
              </div>
              <div className="flex-1 flex items-center bg-transparent border border-[var(--border)] rounded-full px-4 py-2.5 gap-2 focus-within:border-[var(--border-mid)] transition-colors">
                <input
                  className="flex-1 bg-transparent outline-none text-sm placeholder-[var(--stone-400)] text-[var(--ink-900)]"
                  placeholder={`Message ${activeChat.username}...`}
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                />
                {inputText.trim() && (
                  <button onClick={sendMessage} className="text-[var(--ink-800)] hover:text-[var(--ink-700)] transition-colors">
                    <SendIcon />
                  </button>
                )}
              </div>
            </div>
          </>
        ) : (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div className="w-24 h-24 rounded-full border-2 border-[var(--border-mid)] flex items-center justify-center text-[var(--ink-900)]">
              <PaperPlaneIcon />
            </div>
            <p className="font-bold text-xl">Your messages</p>
            <p className="text-[var(--stone-500)] text-sm">Send a message to start a chat.</p>
            <button onClick={openCompose} className="btn-dark text-[var(--ink-900)] text-sm font-semibold px-5 py-2 rounded-lg transition-colors">
              Send message
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
