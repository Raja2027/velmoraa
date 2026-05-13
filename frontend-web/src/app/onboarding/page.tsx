"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { apiUrl } from "@/lib/api";

export default function OnboardingPage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [username, setUsername] = useState("");
  const [isUsernameAvailable, setIsUsernameAvailable] = useState<boolean | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);

  const [dob, setDob] = useState("");
  const [nationality, setNationality] = useState("");
  const [language, setLanguage] = useState("");
  
  const [file, setFile] = useState<File | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [discoverable, setDiscoverable] = useState(false);
  const [loading, setLoading] = useState(false);

  // Live video capture states
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          setRecordedChunks((prev) => [...prev, e.data]);
        }
      };
      
      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
      };
      
      setRecordedChunks([]);
      mediaRecorder.start();
      setIsRecording(true);
      
      // Auto-stop after 4 seconds
      setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
          setIsRecording(false);
        }
      }, 4000);
      
    } catch (err) {
      console.error("Error accessing camera", err);
      alert("Could not access camera. Please grant permissions.");
    }
  };

  useEffect(() => {
    if (!isRecording && recordedChunks.length > 0) {
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const file = new File([blob], 'recording.webm', { type: 'video/webm' });
      setVideoFile(file);
    }
  }, [isRecording, recordedChunks]);

  const retakeVideo = () => {
    setVideoFile(null);
    setRecordedChunks([]);
  };

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  // Debounced username check
  useEffect(() => {
    if (!username) {
      setIsUsernameAvailable(null);
      return;
    }
    
    const timeout = setTimeout(async () => {
      setCheckingUsername(true);
      try {
        const res = await fetch(apiUrl(`/auth/check-username?username=${username}`));
        const data = await res.json();
        setIsUsernameAvailable(data.available);
      } catch (e) {
        setIsUsernameAvailable(null);
      } finally {
        setCheckingUsername(false);
      }
    }, 500);

    return () => clearTimeout(timeout);
  }, [username]);

  if (status === "loading") return <div className="p-10">Loading...</div>;

  const handleComplete = async () => {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("email", session?.user?.email || "");
      formData.append("username", username);
      formData.append("date_of_birth", dob);
      formData.append("nationality", nationality);
      formData.append("language", language);
      if (file) {
        formData.append("file", file);
      }
      
      formData.append("discoverable", discoverable ? "true" : "false");
      if (discoverable && videoFile) {
        formData.append("video_file", videoFile);
      }

      const res = await fetch(apiUrl("/onboarding"), {
        method: "POST",
        body: formData
      });

      if (res.ok) {
        // Update next-auth session
        await update({ isOnboarded: true, username: username });
        router.push("/");
      } else {
        alert("Failed to complete onboarding");
      }
    } catch (e) {
      console.error(e);
      alert("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 py-12">
      <div className="w-full max-w-md border border-[var(--border)] p-8 rounded-xl shadow-2xl">
        <h1 className="text-3xl font-bold font-serif italic mb-2 text-center">velmoraa</h1>
        <p className="text-[var(--stone-400)] text-center text-sm mb-8">Let's finish setting up your account.</p>

        {step === 1 && (
          <div className="flex flex-col gap-4">
            <h2 className="font-semibold text-lg">Choose a Username</h2>
            <div className="relative">
              <input 
                type="text" 
                placeholder="Username" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full border border-[var(--border)] p-3 rounded-md focus:outline-none focus:border-zinc-500"
              />
              <div className="absolute right-3 top-3">
                {checkingUsername && <span className="text-[var(--stone-500)] text-xs">Checking...</span>}
                {!checkingUsername && isUsernameAvailable === true && <span className="text-green-500">✓</span>}
                {!checkingUsername && isUsernameAvailable === false && <span className="text-red-500">✗ Taken</span>}
              </div>
            </div>
            <button 
              disabled={!isUsernameAvailable}
              onClick={() => setStep(2)}
              className="w-full bg-[var(--ink-900)] disabled:bg-blue-900 hover:bg-blue-600 text-[var(--ink-900)] font-semibold py-2 rounded-lg mt-4 transition-colors"
            >
              Next
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-4">
            <h2 className="font-semibold text-lg">Demographics</h2>
            
            <label className="text-sm text-[var(--stone-400)]">Date of Birth</label>
            <input 
              type="date" 
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              className="w-full border border-[var(--border)] p-3 rounded-md focus:outline-none focus:border-zinc-500 text-[var(--ink-900)]"
            />

            <label className="text-sm text-[var(--stone-400)]">Nationality</label>
            <select 
              value={nationality}
              onChange={(e) => setNationality(e.target.value)}
              className="w-full border border-[var(--border)] p-3 rounded-md focus:outline-none focus:border-zinc-500"
            >
              <option value="">Select Country</option>
              <option value="US">United States</option>
              <option value="UK">United Kingdom</option>
              <option value="CA">Canada</option>
              <option value="IN">India</option>
              <option value="AU">Australia</option>
            </select>

            <label className="text-sm text-[var(--stone-400)]">Preferred Language</label>
            <select 
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full border border-[var(--border)] p-3 rounded-md focus:outline-none focus:border-zinc-500"
            >
              <option value="">Select Language</option>
              <option value="en">English</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="hi">Hindi</option>
            </select>

            <div className="flex gap-3 mt-4">
              <button 
                onClick={() => setStep(1)}
                className="w-1/3 border border-[var(--border)] hover:font-semibold py-2 rounded-lg transition-colors"
              >
                Back
              </button>
              <button 
                disabled={!dob || !nationality || !language}
                onClick={() => setStep(3)}
                className="flex-1 bg-[var(--ink-900)] disabled:bg-blue-900 hover:bg-blue-600 text-[var(--ink-900)] font-semibold py-2 rounded-lg transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-4 items-center">
            <h2 className="font-semibold text-lg w-full text-left">Profile Picture</h2>
            
            <div className="w-32 h-32 rounded-full border-2 border-dashed border-zinc-600 flex items-center justify-center overflow-hidden relative cursor-pointer hover:border-zinc-400 transition-colors">
              {file ? (
                <img src={URL.createObjectURL(file)} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <span className="text-[var(--stone-500)] text-sm text-center px-4">Upload<br/>Photo</span>
              )}
              <input 
                type="file" 
                accept="image/*"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </div>

            <p className="text-xs text-[var(--stone-500)] text-center">Add a profile picture to help your friends find you.</p>

            <div className="flex w-full gap-3 mt-4">
              <button 
                onClick={() => setStep(2)}
                className="w-1/3 border border-[var(--border)] hover:font-semibold py-2 rounded-lg transition-colors"
              >
                Back
              </button>
              <button 
                onClick={() => setStep(4)}
                className="flex-1 btn-dark text-[var(--ink-900)] font-semibold py-2 rounded-lg transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-4 items-center">
            <h2 className="font-semibold text-lg w-full text-left">Facial Search Opt-In</h2>
            <p className="text-sm text-[var(--stone-400)] text-left">
              To allow your friends to find you using "Search by Image", we need to create a secure mathematical representation of your face.
              <br/><br/>
              If you agree, please record a short 3-5 second video turning your head slightly left and right. This helps us create a highly accurate and secure profile.
            </p>

            {discoverable ? (
              <div className="w-full mt-4 flex flex-col items-center">
                <div className="w-full h-48 border-2 border-dashed border-zinc-600 flex items-center justify-center rounded-xl relative overflow-hidden mb-4">
                  {videoFile ? (
                    <video src={URL.createObjectURL(videoFile)} className="w-full h-full object-cover rounded-xl" autoPlay muted loop />
                  ) : (
                    <>
                      <video ref={videoRef} className="w-full h-full object-cover rounded-xl" muted playsInline />
                      {!isRecording && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center/50">
                          <button 
                            onClick={startRecording}
                            className="bg-red-500 hover:bg-red-600 w-12 h-12 rounded-full border-4 border-white mb-2 transition-transform hover:scale-105"
                          />
                          <span className="text-[var(--ink-700)] text-sm font-semibold">Start Recording</span>
                        </div>
                      )}
                      {isRecording && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <div className="absolute top-2 right-2 bg-red-500 text-[var(--ink-900)] text-xs font-bold px-2 py-1 rounded animate-pulse">
                            REC
                          </div>
                          <p className="text-[var(--ink-900)] font-bold drop-shadow-md text-center mt-20">Turn your head slowly</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
                
                {videoFile && (
                  <button 
                    onClick={retakeVideo}
                    className="text-[var(--stone-400)] hover:text-[var(--ink-900)] text-sm underline mb-4"
                  >
                    Retake Video
                  </button>
                )}
                
                <div className="flex w-full gap-3 mt-2">
                  <button 
                    onClick={() => { setDiscoverable(false); setVideoFile(null); setRecordedChunks([]); }}
                    className="w-1/3 border border-[var(--border)] hover:font-semibold py-2 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    disabled={loading || !videoFile}
                    onClick={handleComplete}
                    className="flex-1 bg-[var(--ink-900)] disabled:bg-blue-900 hover:bg-blue-600 text-[var(--ink-900)] font-semibold py-2 rounded-lg transition-colors"
                  >
                    {loading ? "Saving..." : "Complete Setup"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col w-full gap-3 mt-6">
                <button 
                  onClick={() => setDiscoverable(true)}
                  className="w-full btn-dark text-[var(--ink-900)] font-semibold py-3 rounded-lg transition-colors"
                >
                  I Agree (Upload Video)
                </button>
                <button 
                  disabled={loading}
                  onClick={() => {
                    setDiscoverable(false);
                    handleComplete();
                  }}
                  className="w-full border border-[var(--border)] hover:text-[var(--ink-700)] font-semibold py-3 rounded-lg transition-colors"
                >
                  {loading ? "Saving..." : "Skip & Keep Private"}
                </button>
                <button 
                  onClick={() => setStep(3)}
                  className="w-full text-[var(--stone-500)] text-sm mt-2 hover:text-[var(--ink-900)] transition-colors"
                >
                  Back to Profile Picture
                </button>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
