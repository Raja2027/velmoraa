"use client";

import { signIn, useSession } from "next-auth/react";
import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { apiUrl } from "@/lib/api";

import { Suspense } from "react";

function RegisterForm() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const prefillEmail = searchParams.get("email") || "";
  const prefillName = searchParams.get("name") || "";
  const prefillImage = searchParams.get("image") || "";
  const googleEmail = prefillEmail || session?.user?.email || "";
  const googleName = prefillName || session?.user?.name || "";
  const googleImage = prefillImage || session?.user?.image || "";
  const fromGoogle = !!googleEmail;

  const [form, setForm] = useState({
    email: googleEmail,
    name: googleName,
    username: "",
    password: "",
    dob: "",
  });
  
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [discoverable, setDiscoverable] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const googleImageLoadedRef = useRef(false);
  const [isRecording, setIsRecording] = useState(false);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    if (!googleEmail && !googleName) return;
    setForm(f => ({
      ...f,
      email: f.email || googleEmail,
      name: f.name || googleName,
    }));
  }, [googleEmail, googleName]);

  useEffect(() => {
    if (!googleImage || googleImageLoadedRef.current) return;
    googleImageLoadedRef.current = true;
    setFilePreview(current => current || googleImage);

    fetch(googleImage)
      .then(res => {
        if (!res.ok) throw new Error("Failed to load Google profile image");
        return res.blob();
      })
      .then(blob => {
        const imageFile = new File([blob], "google-profile-photo.jpg", {
          type: blob.type || "image/jpeg",
        });
        setFile(current => current || imageFile);
      })
      .catch(() => {
        // Keep the preview if Google blocks downloading the avatar; user can upload manually.
      });
  }, [googleImage]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      
      setIsRecording(true);
      setVideoFile(null);
      setError("");

      // Warm-up delay to let camera adjust exposure/focus
      setTimeout(() => {
        const mediaRecorder = new MediaRecorder(stream, { mimeType: "video/webm" });
        mediaRecorderRef.current = mediaRecorder;

        const chunks: Blob[] = [];
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
          const blob = new Blob(chunks, { type: "video/webm" });
          const file = new File([blob], "verification.webm", { type: "video/webm" });
          setVideoFile(file);
          setIsRecording(false);
          stream.getTracks().forEach(t => t.stop());
        };

        mediaRecorder.start();
        
        // Record for 5 seconds to ensure enough good frames
        setTimeout(() => {
          if (mediaRecorder.state === "recording") {
            mediaRecorder.stop();
          }
        }, 5000);
      }, 1000);
      
    } catch (err) {
      setError("Camera access denied or unavailable.");
      setIsRecording(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.email || !form.name || !form.username || !form.password || !file) {
      setError("All fields and a profile picture are required");
      return;
    }
    if (form.password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (discoverable && !videoFile) {
      startRecording();
      return;
    }
    
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("email", form.email);
      fd.append("name", form.name);
      fd.append("username", form.username.toLowerCase().replace(/\s/g, ""));
      fd.append("password", form.password);
      fd.append("date_of_birth", form.dob);
      fd.append("file", file);
      fd.append("discoverable_by_image", discoverable ? "true" : "false");
      if (discoverable && videoFile) {
        fd.append("video_file", videoFile);
      }

      const res = await fetch(apiUrl("/auth/register"), {
        method: "POST",
        body: fd,
      });
      
      if (!res.ok) {
        const data = await res.json();
        setError(data.detail || "Registration failed");
        setLoading(false);
        if (discoverable && data.detail && data.detail.toLowerCase().includes("video")) {
          setVideoFile(null); // Clear bad video so they must retake
        }
        return;
      }
      
      // Auto-login after registration
      const loginRes = await signIn("credentials", {
        email: form.email,
        password: form.password,
        redirect: false,
      });
      
      if (loginRes?.error) {
        setError("Account created but login failed. Go to login page.");
        setLoading(false);
        return;
      }
      
      window.location.href = "/";
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div
      className="flex-1 flex items-center justify-center min-h-screen px-4 py-8"
      style={{ background: "var(--bg)" }}
    >
      <div className="w-full max-w-[400px] flex flex-col gap-3">

        {/* Main Card */}
        <div
          className="rounded-2xl px-10 pt-10 pb-8 flex flex-col items-center"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <h1
            className="text-2xl font-bold mb-2"
            style={{ color: "var(--ink-900)" }}
          >
            {fromGoogle ? "Complete your registration" : "Create your account"}
          </h1>
          <p
            className="text-sm mb-6 text-center"
            style={{ color: "var(--stone-500)" }}
          >
            {fromGoogle
              ? "We've filled in your Google info. Just pick a username and password."
              : "Sign up to see photos and videos from your friends."
            }
          </p>

          {error && (
            <div
              className="w-full text-center text-sm py-2.5 px-4 rounded-xl mb-4"
              style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleRegister} className="w-full flex flex-col gap-3">
            
            {/* Profile Picture Upload */}
            <div className="flex flex-col items-center gap-2 mb-2">
              <label htmlFor="pfp-upload" className="cursor-pointer relative group">
                <div 
                  className="w-20 h-20 rounded-full overflow-hidden flex items-center justify-center transition-all group-hover:opacity-80"
                  style={{ background: "var(--cream-200)", border: "2px dashed var(--stone-400)" }}
                >
                  {filePreview ? (
                    <img src={filePreview} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl" style={{ color: "var(--stone-500)" }}>+</span>
                  )}
                </div>
                <div className="text-xs text-center mt-1 font-medium" style={{ color: "var(--stone-500)" }}>
                  Upload Photo
                </div>
              </label>
              <input 
                id="pfp-upload" 
                type="file" 
                accept="image/*" 
                className="hidden" 
                onChange={e => {
                  if (e.target.files && e.target.files[0]) {
                    setFile(e.target.files[0]);
                    setFilePreview(URL.createObjectURL(e.target.files[0]));
                  }
                }}
              />
            </div>

            <input
              type="email"
              required
              placeholder="Email address"
              value={form.email}
              onChange={set("email")}
              readOnly={fromGoogle}
              className="input"
              style={{ padding: "14px 16px", borderRadius: "var(--radius-xl)" }}
            />
            <input
              type="text"
              required
              placeholder="Full name"
              value={form.name}
              onChange={set("name")}
              className="input"
              style={{ padding: "14px 16px", borderRadius: "var(--radius-xl)" }}
            />
            <input
              type="text"
              required
              placeholder="Username"
              value={form.username}
              onChange={set("username")}
              className="input"
              style={{ padding: "14px 16px", borderRadius: "var(--radius-xl)" }}
            />
            <input
              type="password"
              required
              placeholder="Password"
              value={form.password}
              onChange={set("password")}
              className="input"
              style={{ padding: "14px 16px", borderRadius: "var(--radius-xl)" }}
              minLength={6}
            />
            <div>
              <label
                className="text-xs font-medium block mb-1.5 ml-1"
                style={{ color: "var(--stone-500)" }}
              >
                Date of birth
              </label>
              <input
                type="date"
                value={form.dob}
                onChange={set("dob")}
                className="input"
                style={{ padding: "14px 16px", borderRadius: "var(--radius-xl)" }}
              />
            </div>

            {/* Biometric Opt-in */}
            <div className="flex flex-col gap-2 mt-2">
              <label className="flex items-center gap-2 cursor-pointer text-sm font-medium" style={{ color: "var(--ink-900)" }}>
                <input 
                  type="checkbox" 
                  checked={discoverable} 
                  onChange={e => setDiscoverable(e.target.checked)} 
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Enable Find by Face / Ghost-Tagging
              </label>
              {discoverable && (
                <div className="pl-6 flex flex-col gap-2 mt-1">
                  <p className="text-xs" style={{ color: "var(--stone-500)" }}>We need a quick 4-second face video.</p>
                  
                  {/* Camera Preview */}
                  <div className={`relative w-full overflow-hidden rounded-xl bg-black ${isRecording ? 'h-40' : 'h-0'}`} style={{ transition: 'height 0.3s' }}>
                    <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
                    {isRecording && (
                      <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-black/50 px-2 py-1 rounded-md">
                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        <span className="text-xs text-white font-medium">Recording...</span>
                      </div>
                    )}
                  </div>
                  
                  {videoFile && (
                    <div className="flex items-center justify-between bg-green-50 px-3 py-2 rounded-lg border border-green-200">
                      <span className="text-xs text-green-700 font-medium">✅ Video Captured</span>
                      <button type="button" onClick={startRecording} className="text-xs text-blue-600 font-semibold hover:underline">Retake</button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || isRecording}
              className="w-full py-3.5 rounded-full font-bold text-sm text-white transition-all disabled:opacity-60 mt-1"
              style={{
                background: "linear-gradient(135deg, #4facfe 0%, #7eb7f7 100%)",
                border: "none",
                cursor: "pointer",
              }}
            >
              {loading ? "Creating account..." : isRecording ? "Recording..." : (discoverable && !videoFile) ? "Next: Record Video" : "Sign up"}
            </button>
          </form>

          <p
            className="text-xs text-center mt-5 leading-relaxed"
            style={{ color: "var(--stone-400)" }}
          >
            By signing up, you agree to our Terms, Privacy Policy, and Cookies Policy.
          </p>
        </div>

        {/* Login link Card */}
        <div
          className="rounded-2xl px-10 py-5 text-center"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow-xs)",
          }}
        >
          <p className="text-sm" style={{ color: "var(--stone-500)" }}>
            Have an account?{" "}
            <Link
              href="/login"
              className="font-semibold transition-colors"
              style={{ color: "#4facfe" }}
            >
              Log in
            </Link>
          </p>
        </div>

      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading...</div>}>
      <RegisterForm />
    </Suspense>
  );
}
