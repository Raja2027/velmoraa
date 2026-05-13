"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { useMyProfilePic } from "@/hooks/useMyProfilePic";
import { apiUrl } from "@/lib/api";

const HomeIcon = ({ active }: { active?: boolean }) => (
  <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? 0 : 1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
  </svg>
);
const SearchIcon = ({ active }: { active?: boolean }) => (
  <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? 0 : 1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 0z" />
  </svg>
);
const MessageIcon = ({ active }: { active?: boolean }) => (
  <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? 0 : 1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
  </svg>
);
const BellIcon = ({ active }: { active?: boolean }) => (
  <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? 0 : 1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
  </svg>
);
const CreateIcon = ({ active }: { active?: boolean }) => (
  <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? 0 : 1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);
const ProfileIcon = ({ active }: { active?: boolean }) => (
  <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? 0 : 1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);
const SettingsIcon = ({ active }: { active?: boolean }) => (
  <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.66.84.078.034.154.07.23.107.325.158.705.138 1.01-.068l1.08-.73a1.125 1.125 0 011.45.12l1.833 1.833c.389.389.44 1.003.12 1.45l-.73 1.08c-.206.305-.226.685-.068 1.01.037.076.073.152.107.23.154.347.466.597.84.66l1.281.213c.542.09.94.56.94 1.11v2.593c0 .55-.398 1.02-.94 1.11l-1.281.213c-.374.063-.686.313-.84.66a6.78 6.78 0 01-.107.23c-.158.325-.138.705.068 1.01l.73 1.08c.32.447.269 1.061-.12 1.45l-1.833 1.833a1.125 1.125 0 01-1.45.12l-1.08-.73c-.305-.206-.685-.226-1.01-.068a6.78 6.78 0 01-.23.107c-.347.154-.597.466-.66.84l-.213 1.281c-.09.542-.56.94-1.11.94h-2.593c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.063-.374-.313-.686-.66-.84a6.78 6.78 0 01-.23-.107c-.325-.158-.705-.138-1.01.068l-1.08.73a1.125 1.125 0 01-1.45-.12l-1.833-1.833a1.125 1.125 0 01-.12-1.45l.73-1.08c.206-.305.226-.685.068-1.01a6.78 6.78 0 01-.107-.23c-.154-.347-.466-.597-.84-.66l-1.281-.213a1.125 1.125 0 01-.94-1.11v-2.593c0-.55.398-1.02.94-1.11l1.281-.213c.374-.063.686-.313.84-.66.034-.078.07-.154.107-.23.158-.325.138-.705-.068-1.01l-.73-1.08a1.125 1.125 0 01.12-1.45L4.95 5.49a1.125 1.125 0 011.45-.12l1.08.73c.305.206.685.226 1.01.068.076-.037.152-.073.23-.107.347-.154.597-.466.66-.84l.213-1.281z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);
const ScanFaceIcon = () => (
  <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 3.75H6A2.25 2.25 0 003.75 6v1.5M16.5 3.75H18A2.25 2.25 0 0120.25 6v1.5m0 9V18A2.25 2.25 0 0118 20.25h-1.5m-9 0H6A2.25 2.25 0 013.75 18v-1.5M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);
const ChevronRight = () => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
  </svg>
);

export default function Sidebar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);
  const myPic = useMyProfilePic();

  useEffect(() => {
    if (!session?.user?.email) return;
    const email = encodeURIComponent(session.user.email);
    const fetch_ = () =>
      fetch(apiUrl(`/notifications/unread-count?email=${email}`))
        .then(r => r.json()).then(d => setUnreadCount(d.count || 0)).catch(() => {});
    fetch_();
    const t = setInterval(fetch_, 30000);
    return () => clearInterval(t);
  }, [session]);

  useEffect(() => { if (pathname === "/notifications") setUnreadCount(0); }, [pathname]);

  // Hide sidebar on login/onboarding pages or when not authenticated
  if (!session || pathname === "/login" || pathname === "/register" || pathname.startsWith("/onboarding")) {
    return null;
  }

  const profileHref = session?.user?.name ? `/${session.user.name}` : "/login";
  const isActive = (href: string) => href === "/" ? pathname === "/" : pathname.startsWith(href);

  const navItems = [
    { name: "Home",          href: "/",              Icon: HomeIcon },
    { name: "Search",        href: "/search",        Icon: SearchIcon },
    { name: "Messages",      href: "/messages",      Icon: MessageIcon },
    { name: "Notifications", href: "/notifications", Icon: BellIcon, badge: unreadCount },
    { name: "Create",        href: "/create",        Icon: CreateIcon },
    { name: "Profile",       href: profileHref,      Icon: ProfileIcon },
  ];
  const mobileNavItems = [
    { name: "Home",          href: "/",              Icon: HomeIcon },
    { name: "Search",        href: "/search",        Icon: SearchIcon },
    { name: "Face",          href: "/search-image",  Icon: ScanFaceIcon },
    { name: "Create",        href: "/create",        Icon: CreateIcon },
    { name: "Profile",       href: profileHref,      Icon: ProfileIcon },
  ];

  return (
    <>
      {/* ── Desktop Sidebar ─────────────────────────── */}
      <nav
        className="hidden md:flex flex-col w-60 p-4 sticky top-0 h-screen"
        style={{
          background: "var(--surface)",
          borderRight: "1px solid var(--border)",
        }}
      >
        {/* Logo */}
        <div className="px-2 mb-8 mt-3">
          <Link href="/">
            <span
              className="text-[22px] font-black italic tracking-tight cursor-pointer select-none"
              style={{ color: "var(--ink-900)", fontFamily: "Georgia, serif", letterSpacing: "-0.03em" }}
            >
              velmoraa
            </span>
          </Link>
        </div>

        {/* Nav */}
        <ul className="flex flex-col gap-0.5 flex-1">
          {navItems.map(({ name, href, Icon, badge }: any) => {
            const active = isActive(href);
            return (
              <Link href={href} key={name}>
                <li
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-150 relative"
                  style={{
                    background: active ? "var(--cream-100)" : "transparent",
                    color: active ? "var(--ink-900)" : "var(--stone-500)",
                    fontWeight: active ? 600 : 400,
                  }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "var(--cream-50)"; }}
                  onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  {name === "Profile" && myPic ? (
                    <div className="w-[20px] h-[20px] rounded-full overflow-hidden flex-shrink-0">
                      <img src={myPic} alt="Profile" className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <Icon active={active} />
                  )}
                  <span className="text-[14px]">{name}</span>
                  {badge > 0 && (
                    <span
                      className="ml-auto text-[10px] font-bold text-white rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1"
                      style={{ background: "#dc2626" }}
                    >
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </li>
              </Link>
            );
          })}

          {/* Find by Face */}
          <div className="mt-6 px-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider px-2 mb-2" style={{ color: "var(--stone-400)" }}>
              Discovery
            </p>
            <Link href="/search-image">
              <div
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-150"
                style={{
                  background: pathname === "/search-image" ? "var(--ink-900)" : "var(--cream-100)",
                  color: pathname === "/search-image" ? "#fff" : "var(--ink-800)",
                  border: "1px solid transparent",
                }}
                onMouseEnter={e => {
                  if (pathname !== "/search-image") {
                    const el = e.currentTarget as HTMLElement;
                    el.style.background = "var(--cream-200)";
                    el.style.borderColor = "var(--border-mid)";
                  }
                }}
                onMouseLeave={e => {
                  if (pathname !== "/search-image") {
                    const el = e.currentTarget as HTMLElement;
                    el.style.background = "var(--cream-100)";
                    el.style.borderColor = "transparent";
                  }
                }}
              >
                <ScanFaceIcon />
                <span className="text-[14px] font-medium flex-1">Find by Face</span>
                <ChevronRight />
              </div>
            </Link>
          </div>
        </ul>

        {/* Footer */}
        <div className="pt-4" style={{ borderTop: "1px solid var(--border)" }}>
          {session?.user && (
            <Link href="/settings">
              <div
                className="flex items-center gap-3 px-2 py-2 rounded-xl cursor-pointer transition-all duration-150 mb-1"
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--cream-100)"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
              >
                <div
                  className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center"
                  style={{ border: "1.5px solid var(--border-mid)", background: "var(--cream-200)" }}
                >
                  <span className="text-[14px]">⚙️</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold truncate" style={{ color: "var(--ink-900)" }}>
                    Settings
                  </p>
                </div>
              </div>
            </Link>
          )}
          {session ? (
            <button
              onClick={() => signOut()}
              className="w-full flex items-center gap-3 px-2 py-2 rounded-xl cursor-pointer transition-all duration-150 text-left"
              style={{ color: "var(--stone-400)" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#dc2626"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--stone-400)"; }}
            >
              <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
              </svg>
              <span className="text-[14px]">Sign out</span>
            </button>
          ) : (
            <Link href="/login">
              <div className="btn btn-dark w-full text-[14px] py-2.5 rounded-xl">Sign in</div>
            </Link>
          )}
        </div>
      </nav>

      {/* ── Mobile Bottom Nav ────────────────────────── */}
      <nav
        className="md:hidden fixed bottom-0 w-full flex justify-around items-center px-2 py-2 z-50"
        style={{
          background: "rgba(250,248,245,0.95)",
          backdropFilter: "blur(12px)",
          borderTop: "1px solid var(--border)",
        }}
      >
        {mobileNavItems.map(({ name, href, Icon, badge }: any) => {
          const active = isActive(href);
          return (
            <Link href={href} key={name} className="flex min-w-[54px] flex-col items-center gap-1 py-1">
              <div
                className="relative flex items-center justify-center w-9 h-9 rounded-xl transition-all duration-150"
                style={{
                  background: active ? "var(--cream-200)" : "transparent",
                  color: active ? "var(--ink-900)" : "var(--stone-400)",
                }}
              >
                {name === "Profile" && myPic ? (
                  <div className="w-[20px] h-[20px] rounded-full overflow-hidden flex-shrink-0">
                    <img src={myPic} alt="Profile" className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <Icon active={active} />
                )}
                {badge > 0 && (
                  <span
                    className="absolute top-0.5 right-0.5 text-[9px] font-bold text-white rounded-full min-w-[14px] h-[14px] flex items-center justify-center"
                    style={{ background: "#dc2626" }}
                  >
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </div>
              <span className="text-[10px]" style={{ color: active ? "var(--ink-900)" : "var(--stone-400)" }}>
                {name}
              </span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
