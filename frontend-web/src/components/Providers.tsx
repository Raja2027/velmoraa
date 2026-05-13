"use client";

import { SessionProvider } from "next-auth/react";
import OnboardingGuard from "./OnboardingGuard";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <OnboardingGuard>
        {children}
      </OnboardingGuard>
    </SessionProvider>
  );
}
