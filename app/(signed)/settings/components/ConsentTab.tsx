"use client";

import { useEffect, useState } from "react";
import { toast } from "react-toastify";

interface WorkspaceConsentData {
  voiceCloningConsent: boolean;
  faceTrackingConsent: boolean;
  voiceCloningConsentAt: string | null;
  faceTrackingConsentAt: string | null;
  updatedAt: string | null;
}

export default function ConsentTab() {
  const [loading, setLoading] = useState(true);
  const [updatingVoice, setUpdatingVoice] = useState(false);
  const [updatingFace, setUpdatingFace] = useState(false);
  const [consent, setConsent] = useState<WorkspaceConsentData>({
    voiceCloningConsent: false,
    faceTrackingConsent: false,
    voiceCloningConsentAt: null,
    faceTrackingConsentAt: null,
    updatedAt: null,
  });

  const fetchConsent = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/workspace/consent");
      if (!res.ok) {
        throw new Error(`Failed to load consent settings (${res.status})`);
      }
      const data = await res.json();
      if (data.consent) {
        setConsent(data.consent);
      } else {
        setConsent({
          voiceCloningConsent: data.voiceCloningConsent ?? false,
          faceTrackingConsent: data.faceTrackingConsent ?? false,
          voiceCloningConsentAt: data.voiceCloningConsentAt ?? null,
          faceTrackingConsentAt: data.faceTrackingConsentAt ?? null,
          updatedAt: data.updatedAt ?? null,
        });
      }
    } catch (err) {
      console.error("Error loading workspace consent:", err);
      toast.error(err instanceof Error ? err.message : "Failed to load consent settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConsent();
  }, []);

  const handleToggleVoiceCloning = async () => {
    const nextVal = !consent.voiceCloningConsent;
    try {
      setUpdatingVoice(true);
      const res = await fetch("/api/workspace/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceCloningConsent: nextVal }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to update voice cloning consent");
      }
      // Reflect authoritative backend state
      if (data.consent) {
        setConsent(data.consent);
      } else {
        setConsent((prev) => ({
          ...prev,
          voiceCloningConsent: data.voiceCloningConsent,
          voiceCloningConsentAt: data.voiceCloningConsentAt,
          updatedAt: data.updatedAt,
        }));
      }
      toast.success(
        nextVal
          ? "Voice cloning consent granted successfully."
          : "Voice cloning consent revoked successfully."
      );
    } catch (err) {
      console.error("Failed to toggle voice cloning consent:", err);
      toast.error(err instanceof Error ? err.message : "Failed to update voice cloning consent");
    } finally {
      setUpdatingVoice(false);
    }
  };

  const handleToggleFaceTracking = async () => {
    const nextVal = !consent.faceTrackingConsent;
    try {
      setUpdatingFace(true);
      const res = await fetch("/api/workspace/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ faceTrackingConsent: nextVal }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to update face tracking consent");
      }
      // Reflect authoritative backend state
      if (data.consent) {
        setConsent(data.consent);
      } else {
        setConsent((prev) => ({
          ...prev,
          faceTrackingConsent: data.faceTrackingConsent,
          faceTrackingConsentAt: data.faceTrackingConsentAt,
          updatedAt: data.updatedAt,
        }));
      }
      toast.success(
        nextVal
          ? "Face tracking consent granted successfully."
          : "Face tracking consent revoked successfully."
      );
    } catch (err) {
      console.error("Failed to toggle face tracking consent:", err);
      toast.error(err instanceof Error ? err.message : "Failed to update face tracking consent");
    } finally {
      setUpdatingFace(false);
    }
  };

  const formatTimestamp = (iso: string | null) => {
    if (!iso) {
      return "Not yet configured (defaults to disabled)";
    }
    try {
      const date = new Date(iso);
      return date.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="text-[#7C5CFC] text-xl animate-pulse font-medium">
          Loading consent settings...
        </div>
      </div>
    );
  }

  return (
    <div className="px-2 sm:px-4 md:px-8 lg:px-16 xl:px-24 max-w-7xl mx-auto mt-8 mb-12 flex flex-col">
      <div className="w-full mb-8">
        <h2 className="text-xl sm:text-2xl font-bold mb-2 text-[#1A0033]">
          Workspace Consent &amp; Privacy Controls
        </h2>
        <p className="text-sm sm:text-base text-gray-600">
          Control workspace-level explicit consent for automated voice cloning and face-tracking
          capabilities. Both features are disabled by default until explicit authorization is
          granted.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        {/* Voice Cloning Card */}
        <div className="card bg-white rounded-xl border border-[#ede7fa] p-6 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <h3 className="font-bold text-base sm:text-lg text-[#1A0033]">
                Voice Cloning &amp; Likeness Synthesis
              </h3>
              <span
                className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                  consent.voiceCloningConsent
                    ? "bg-green-100 text-green-800 border border-green-200"
                    : "bg-gray-100 text-gray-700 border border-gray-200"
                }`}
              >
                {consent.voiceCloningConsent ? "Granted" : "Disabled (Default)"}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-gray-600 mb-3 leading-relaxed">
              Authorizes Marvedge to synthesize, match, and clone vocal characteristics from
              uploaded video and audio sources using ElevenLabs or VoiceStudio neural dubbing
              pipelines. When disabled, dubbing jobs fail closed with a descriptive authorization
              requirement.
            </p>
            <div className="text-xs text-gray-500 flex items-center gap-1.5">
              <span className="font-medium text-gray-700">Status Timestamp:</span>
              <span>{formatTimestamp(consent.voiceCloningConsentAt)}</span>
            </div>
          </div>

          <div className="shrink-0 flex items-center">
            <button
              onClick={handleToggleVoiceCloning}
              disabled={updatingVoice}
              className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
                consent.voiceCloningConsent
                  ? "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"
                  : "bg-[#7C5CFC] text-white hover:bg-[#6846f9] shadow-sm"
              }`}
            >
              {updatingVoice
                ? "Updating..."
                : consent.voiceCloningConsent
                  ? "Revoke Consent"
                  : "Grant Consent"}
            </button>
          </div>
        </div>

        {/* Face Tracking Card */}
        <div className="card bg-white rounded-xl border border-[#ede7fa] p-6 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <h3 className="font-bold text-base sm:text-lg text-[#1A0033]">
                Face Tracking &amp; Speaker Detection
              </h3>
              <span
                className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                  consent.faceTrackingConsent
                    ? "bg-green-100 text-green-800 border border-green-200"
                    : "bg-gray-100 text-gray-700 border border-gray-200"
                }`}
              >
                {consent.faceTrackingConsent ? "Granted" : "Disabled (Default)"}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-gray-600 mb-3 leading-relaxed">
              Authorizes active speaker facial detection (TalkNet) and facial crop fusion during
              video reframing. When disabled, video reframing safely uses content saliency
              (AutoFlip) without facial tracking or biometrics, preserving ordinary reframing
              capabilities without disruption.
            </p>
            <div className="text-xs text-gray-500 flex items-center gap-1.5">
              <span className="font-medium text-gray-700">Status Timestamp:</span>
              <span>{formatTimestamp(consent.faceTrackingConsentAt)}</span>
            </div>
          </div>

          <div className="shrink-0 flex items-center">
            <button
              onClick={handleToggleFaceTracking}
              disabled={updatingFace}
              className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
                consent.faceTrackingConsent
                  ? "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"
                  : "bg-[#7C5CFC] text-white hover:bg-[#6846f9] shadow-sm"
              }`}
            >
              {updatingFace
                ? "Updating..."
                : consent.faceTrackingConsent
                  ? "Revoke Consent"
                  : "Grant Consent"}
            </button>
          </div>
        </div>

        {/* Explanatory Policy Notice */}
        <div className="bg-[#ede7fa]/60 border border-[#d9d1fb] rounded-lg p-4 text-xs text-gray-600">
          <p className="font-semibold text-[#1A0033] mb-1">
            Notice on AI Processing &amp; Workspace Consent
          </p>
          <p>
            Workspace consent settings take effect immediately for new jobs and worker executions.
            Enabling consent indicates permission for Marvedge to process media under these
            parameters and does not independently constitute regulatory compliance. Ensure
            appropriate underlying rights and permissions for any voices or faces submitted for
            processing.
          </p>
        </div>
      </div>
    </div>
  );
}
