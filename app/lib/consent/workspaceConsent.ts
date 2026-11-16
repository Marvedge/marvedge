import { prisma } from "../prisma";

export const VOICE_CLONING_CONSENT_REQUIRED = "VOICE_CLONING_CONSENT_REQUIRED";

export class VoiceCloningConsentError extends Error {
  readonly code = VOICE_CLONING_CONSENT_REQUIRED;

  constructor(
    message = "VOICE_CLONING_CONSENT_REQUIRED: Voice cloning consent is required to perform dubbing or voice synthesis."
  ) {
    super(message);
    this.name = "VoiceCloningConsentError";
  }
}

export interface WorkspaceConsentState {
  voiceCloningConsent: boolean;
  faceTrackingConsent: boolean;
  voiceCloningConsentAt: Date | null;
  faceTrackingConsentAt: Date | null;
}

/**
 * Reads the latest persisted consent state for a user.
 * Defaults to false if no record exists.
 */
export async function getWorkspaceConsent(userId: string): Promise<WorkspaceConsentState> {
  if (!userId) {
    return {
      voiceCloningConsent: false,
      faceTrackingConsent: false,
      voiceCloningConsentAt: null,
      faceTrackingConsentAt: null,
    };
  }

  const consent = await prisma.workspaceConsent.findUnique({
    where: { userId },
    select: {
      voiceCloningConsent: true,
      faceTrackingConsent: true,
      voiceCloningConsentAt: true,
      faceTrackingConsentAt: true,
    },
  });

  return {
    voiceCloningConsent: consent?.voiceCloningConsent ?? false,
    faceTrackingConsent: consent?.faceTrackingConsent ?? false,
    voiceCloningConsentAt: consent?.voiceCloningConsentAt ?? null,
    faceTrackingConsentAt: consent?.faceTrackingConsentAt ?? null,
  };
}

/**
 * Fails closed if voice cloning consent is absent, revoked, or cannot be verified.
 */
export async function assertVoiceCloningConsent(userId: string): Promise<void> {
  if (!userId) {
    throw new VoiceCloningConsentError(
      "VOICE_CLONING_CONSENT_REQUIRED: Missing user ID for consent verification"
    );
  }

  let consent: WorkspaceConsentState;
  try {
    consent = await getWorkspaceConsent(userId);
  } catch (error) {
    // Fail closed if cannot be verified
    throw new VoiceCloningConsentError(
      `VOICE_CLONING_CONSENT_REQUIRED: Consent verification failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  if (!consent.voiceCloningConsent) {
    throw new VoiceCloningConsentError(
      "VOICE_CLONING_CONSENT_REQUIRED: Explicit voice cloning consent has not been granted by this workspace."
    );
  }
}
