"use client";

import { useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";

export default function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "loading") return;

    const isOnboarded = (session as any)?.isOnboarded;
    const isAuthPage = pathname === "/login" || pathname === "/signup";
    const isOnboardingPage = pathname === "/onboarding";

    if (session && !isOnboarded && !isOnboardingPage && !isAuthPage) {
      router.replace("/onboarding");
    } else if (session && isOnboarded && isOnboardingPage) {
      router.replace("/");
    }
  }, [session, status, pathname, router]);

  return <>{children}</>;
}
