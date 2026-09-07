import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useState, FormEvent } from "react";
import { toast } from "sonner";

import { useProfileForm } from "./useProfileForm";
import { usePhotoUpload } from "./usePhotoUpload";
import { useLoadUser } from "./useLoadUser";
import { useUserStore } from "@/app/store/userStore";
import {
  deleteAccountRequest,
  fetchUser,
  mapUserToForm,
  requestPasswordReset,
  submitProfileUpdate,
  uploadProfilePhoto,
} from "../utils/settingsHelpers";

export function useSettings() {
  const router = useRouter();
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState("Profile");
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingPasswordReset, setIsSendingPasswordReset] = useState(false);
  const refreshProfileImage = useUserStore((state) => state.refreshProfileImage);

  const profile = useProfileForm(session);
  const photo = usePhotoUpload({ setForm: profile.setForm, setIsDirty: profile.setIsDirty });

  useLoadUser({
    session,
    setForm: profile.setForm,
    setOriginalForm: profile.setOriginalForm,
    setAvatar: photo.setAvatar,
  });

  const handleSave = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      let imageUrl = profile.form.image;

      if (photo.photoFile) {
        photo.setIsUploading(true);
        const result = await uploadProfilePhoto(photo.photoFile);
        if (!result.ok) {
          toast.error(result.error);
          photo.setIsUploading(false);
          setIsSaving(false);
          return;
        }
        imageUrl = result.url;
        photo.setIsUploading(false);
      }

      const { res, data } = await submitProfileUpdate(profile.form, imageUrl);

      if (res.ok) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        router.refresh();
        toast.success("Changes updated successfully!");
        profile.setIsDirty(false);
        profile.setOriginalForm({ ...profile.form, image: imageUrl });
        photo.setPhotoFile(null);
        photo.setAvatar(imageUrl || "");
        refreshProfileImage();
        if (photo.fileInputRef.current) {
          photo.fileInputRef.current.value = "";
        }
      } else {
        toast(`Update failed: ${data.error}`);
      }
    } catch {
      toast("Failed to save changes");
    } finally {
      setIsSaving(false);
      photo.setIsUploading(false);
    }
  };

  const handleCancel = async () => {
    const user = await fetchUser();
    if (user) {
      profile.setForm(mapUserToForm(user));
      photo.setAvatar(user.image || "");
      photo.setPhotoFile(null);
      profile.setIsDirty(false);
      if (photo.fileInputRef.current) {
        photo.fileInputRef.current.value = "";
      }
    }
  };

  const handleDeleteAccount = async () => {
    const confirmed = confirm(
      "Are you sure you want to delete your account? This action cannot be undone."
    );
    if (!confirmed) {
      return;
    }

    const { res, data } = await deleteAccountRequest();
    if (res.ok) {
      alert("Your account has been deleted.");
      signOut({ redirect: false }).then(() => window.location.assign("/"));
    } else {
      alert(`Failed to delete account: ${data.error}`);
    }
  };

  const handleSendPasswordReset = async () => {
    try {
      setIsSendingPasswordReset(true);
      const { res, data } = await requestPasswordReset();
      if (!res.ok) {
        toast.error(data?.error || "Failed to send reset email.");
        return;
      }
      toast.success("Password reset link sent to your email.");
    } catch (error) {
      console.error("Failed to send password reset:", error);
      toast.error("Failed to send reset email.");
    } finally {
      setIsSendingPasswordReset(false);
    }
  };

  return {
    activeTab,
    setActiveTab,
    isSaving,
    isSendingPasswordReset,
    handleSave,
    handleCancel,
    handleDeleteAccount,
    handleSendPasswordReset,
    ...profile,
    ...photo,
  };
}

export type UseSettingsReturn = ReturnType<typeof useSettings>;
