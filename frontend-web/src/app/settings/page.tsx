"use client";

import { useSession, signOut } from "next-auth/react";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { apiUrl } from "@/lib/api";

export default function SettingsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  
  // Video recording states
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [optInLoading, setOptInLoading] = useState(false);

  useEffect(() => {
    if (session?.user?.name) {
      fetch(apiUrl(`/users/${session.user.name}`))
        .then(res => res.json())
        .then(data => { setProfile(data); setLoading(false); })
        .catch(() => setLoading(false));
    }
  }, [session]);

  const togglePrivacy = async () => {
    if (!profile || !session?.user?.email) return;
    const fd = new FormData();
    fd.append("email", session.user.email);
    fd.append("is_private", profile.is_private ? "false" : "true");
    try {
      const res = await fetch(apiUrl("/account/privacy"), {
        method: "POST",
        body: fd,
      });
      if (res.ok) {
        const data = await res.json();
        setProfile({ ...profile, is_private: data.is_private });
      }
    } catch {}
  };

  const handleDeleteAccount = async () => {
    if (!session?.user?.email) return;
    setDeleting(true);
    try {
      const fd = new FormData();
      fd.append("email", session.user.email);
      const res = await fetch(apiUrl("/account/delete"), {
        method: "DELETE",
        body: fd,
      });
      if (res.ok) {
        await signOut({ callbackUrl: "/login" });
      } else {
        alert("Failed to delete account");
      }
    } catch {
      alert("Network error");
    }
    setDeleting(false);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: "video/webm" });
        const file = new File([blob], "face_scan.webm", { type: "video/webm" });
        setVideoFile(file);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setTimeout(() => {
        mediaRecorder.stop();
        setIsRecording(false);
      }, 5000);
    } catch (err) {
      console.error("Camera access denied or error:", err);
    }
  };

  const retakeVideo = () => {
    setVideoFile(null);
    setRecordedChunks([]);
    setTimeout(() => startRecording(), 100);
  };

  const handleOptIn = async () => {
    if (!videoFile || !session?.user?.email) return;
    setOptInLoading(true);
    const formData = new FormData();
    formData.append("email", session.user.email);
    formData.append("video_file", videoFile);
    try {
      const res = await fetch(apiUrl("/opt-in"), { method: "POST", body: formData });
      if (res.ok) {
        setProfile({ ...profile, discoverable_by_image: true });
      }
    } catch {}
    setOptInLoading(false);
    setVideoFile(null);
  };

  if (loading) {
    return <div className="flex-1 flex justify-center pt-24"><div className="w-8 h-8 border-4 border-[var(--border)] border-t-[var(--stone-400)] rounded-full animate-spin"></div></div>;
  }

  return (
    <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-12 fade-up">
      <h1 className="text-2xl font-bold mb-8" style={{ color: "var(--ink-900)" }}>Settings</h1>
      
      <div className="mb-8 p-5 rounded-2xl border border-[var(--border)]" style={{ background: "var(--surface)" }}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-base" style={{ color: "var(--ink-900)" }}>Private account</p>
            <p className="text-sm mt-1" style={{ color: "var(--stone-500)" }}>Only approved followers can view your posts.</p>
          </div>
          <button
            onClick={togglePrivacy}
            className={`w-14 h-8 rounded-full p-1 transition-colors ${profile?.is_private ? "bg-black" : "bg-gray-200"}`}
          >
            <span className={`block w-6 h-6 rounded-full bg-white transition-transform ${profile?.is_private ? "translate-x-6" : ""}`} />
          </button>
        </div>
      </div>

      <div className="mb-8 p-6 rounded-2xl border border-[var(--border)]" style={{ background: "var(--surface)" }}>
        <h2 className="font-semibold text-base mb-4" style={{ color: "var(--ink-900)" }}>Facial Recognition Opt-in</h2>
        {profile?.discoverable_by_image ? (
          <div className="text-center py-6">
            <div className="text-4xl mb-3">✅</div>
            <h3 className="font-semibold text-green-600 mb-2">Facial Search Active</h3>
            <p className="text-sm text-[var(--stone-500)]">Your identity is secure and your friends can find you via image search.</p>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <p className="text-sm text-[var(--stone-500)] text-left w-full mb-6">
              To allow your friends to find you using "Search by Image", we need to create a secure mathematical representation of your face.
              <br/><br/>
              If you agree, please record a short 3-5 second video turning your head slightly left and right.
            </p>
            
            <div className="w-full max-w-md h-64 border-2 border-dashed border-[var(--border-mid)] flex items-center justify-center rounded-2xl relative overflow-hidden mb-6" style={{ background: "var(--cream-50)" }}>
              {videoFile ? (
                <video src={URL.createObjectURL(videoFile)} className="w-full h-full object-cover" autoPlay muted loop />
              ) : (
                <>
                  <video ref={videoRef} className="w-full h-full object-cover absolute inset-0" muted playsInline />
                  {!isRecording && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/10">
                      <button 
                        onClick={startRecording}
                        className="bg-red-500 hover:bg-red-600 w-14 h-14 rounded-full border-4 border-white mb-3 transition-transform hover:scale-105"
                      />
                      <span className="text-white text-sm font-bold drop-shadow-md">Start Recording</span>
                    </div>
                  )}
                  {isRecording && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/20">
                      <div className="absolute top-4 right-4 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded animate-pulse">
                        REC
                      </div>
                      <p className="text-white font-bold drop-shadow-md text-center mt-24">Turn your head slowly</p>
                    </div>
                  )}
                </>
              )}
            </div>
            
            {videoFile && (
              <button 
                onClick={retakeVideo}
                className="text-sm underline mb-6"
                style={{ color: "var(--stone-500)" }}
              >
                Retake Video
              </button>
            )}
            
            <div className="flex w-full gap-3">
              <button 
                disabled={optInLoading || !videoFile}
                onClick={handleOptIn}
                className="btn btn-dark w-full py-3"
              >
                {optInLoading ? "Processing..." : "Save Facial Data"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Delete Account */}
      <div className="p-6 rounded-2xl border border-red-200" style={{ background: "#fef2f2" }}>
        <h2 className="font-semibold text-base mb-2 text-red-700">Delete Account</h2>
        <p className="text-sm text-red-600 mb-4">This will permanently delete your account, posts, comments, and all data. This cannot be undone.</p>
        {!deleteConfirm ? (
          <button
            onClick={() => setDeleteConfirm(true)}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-red-700 border border-red-300 hover:bg-red-100 transition-colors"
          >
            Delete My Account
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <button
              onClick={handleDeleteAccount}
              disabled={deleting}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {deleting ? "Deleting..." : "Yes, Delete Everything"}
            </button>
            <button
              onClick={() => setDeleteConfirm(false)}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-[var(--stone-500)] hover:text-[var(--ink-900)] transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
