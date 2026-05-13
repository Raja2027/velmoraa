import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { apiUrl, mediaUrl } from "@/lib/api";

/**
 * Returns the actual DB profile picture for the logged-in user.
 * Falls back to null if not loaded yet.
 */
export function useMyProfilePic(): string | null {
  const { data: session } = useSession();
  const [profilePic, setProfilePic] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.user?.name) return;
    fetch(apiUrl(`/users/${session.user.name}`))
      .then(r => r.json())
      .then(d => { if (d.profile_picture) setProfilePic(mediaUrl(d.profile_picture)); })
      .catch(() => {});
  }, [session?.user?.name]);

  return profilePic;
}
