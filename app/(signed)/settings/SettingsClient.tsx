"use client";
import React, { useEffect, useMemo, useRef, useState, ChangeEvent, FormEvent } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { toast } from "sonner";
import Image from "next/image";
import SignedHeader from "@/app/components/SignedHeader";
import PhotoUploadModal from "@/app/components/PhotoUploadModal";
import {
  TABS,
  NOTIFICATION_SETTINGS,
  PRIVACY_SETTINGS,
  PREFERENCES_SETTINGS,
} from "../../lib/constants";

const SettingsPage = () => {
  const router = useRouter();
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState("Profile");
  const [form, setForm] = useState({
    firstName: session?.user?.name?.split(" ")[0] || "",
    lastName: session?.user?.name?.split(" ").slice(1).join(" ") || "",
    email: session?.user?.email || "",
    bio: "",
    location: "",
    website: "",
    timezone: "",
    image: "",
  });
  const [avatar, setAvatar] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isUploading, setIsUploading] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [originalForm, setOriginalForm] = useState({ ...form }); // Store original state
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const initials = useMemo(() => {
    if (session?.user?.name) {
      return session.user.name
        .split(" ")
        .map((part) => part[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    return session?.user?.email?.[0].toUpperCase() || "U";
  }, [session?.user]);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      firstName: session?.user?.name?.split(" ")[0] || "",
      lastName: session?.user?.name?.split(" ").slice(1).join(" ") || "",
      email: session?.user?.email || "",
    }));

    const fetchUser = async () => {
      const res = await fetch("/api/user/get");
      const data = await res.json();

      if (data.user) {
        const user = data.user;
        console.log(user.image, user.name);
        setAvatar(user.image || "");

        //  Update form fields from user data
        setForm((prev) => ({
          ...prev,
          bio: user.bio || "",
          location: user.location || "",
          website: user.website || "",
          timezone: user.timezone || "",
          image: user.image || "",
          firstName: user.name?.split(" ")[0] || "",
          lastName: user.name?.split(" ").slice(1).join(" ") || "",
          email: user.email || "",
        }));
      }
    };

    fetchUser();
  }, [session]);

  useEffect(() => {
    const fetchUser = async () => {
      const res = await fetch("/api/user/get");
      const data = await res.json();
      if (data.user) {
        const user = data.user;
        const userFormData = {
          firstName: user.name?.split(" ")[0] || "",
          lastName: user.name?.split(" ").slice(1).join(" ") || "",
          email: user.email || "",
          bio: user.bio || "",
          location: user.location || "",
          website: user.website || "",
          timezone: user.timezone || "",
          image: user.image || "",
        };
        setForm(userFormData);
        setOriginalForm(userFormData); // Set original state
      }
    };
    fetchUser();
  }, [session]);

  const hasChanges = useMemo(() => {
    return JSON.stringify(form) !== JSON.stringify(originalForm);
  }, [form, originalForm]);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    setIsDirty(true);
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handlePhotoChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file) {
        const preview = URL.createObjectURL(file);
        setImgFile(file);
        setPreviewImage(preview);
        setIsPhotoModalOpen(true);
      }
    }
  };

  const handlePhotoModalSave = async () => {
    if (imgFile && previewImage) {
      setIsUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", imgFile);
        formData.append("upload_preset", process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!);

        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });
        const uploadData = await uploadRes.json();

        if (uploadRes.ok && uploadData.secure_url) {
          const cloudinaryUrl = uploadData.secure_url;

          const res = await fetch("/api/user/update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              firstName: form.firstName,
              lastName: form.lastName,
              bio: form.bio,
              location: form.location,
              website: form.website,
              image: cloudinaryUrl,
            }),
          });

          const data = await res.json();
          if (res.ok) {
            const updatedForm = {
              ...form,
              image: cloudinaryUrl,
            };
            setAvatar(cloudinaryUrl);
            setForm(updatedForm);
            setOriginalForm(updatedForm);
            setImgFile(null);
            setPreviewImage(null);
            setIsDirty(false);

            toast.success("Photo updated successfully!");
            window.dispatchEvent(new Event("photoUpdated"));
          } else {
            toast.error(data.error || "Failed to update photo");
          }
        } else {
          toast.error(uploadData.error || "Failed to upload photo");
        }
      } catch (error) {
        console.error("Error uploading photo:", error);
        toast.error("Failed to upload photo");
      } finally {
        setIsUploading(false);
      }
    }
    setIsPhotoModalOpen(false);
  };

  const handlePhotoModalCancel = () => {
    setIsPhotoModalOpen(false);
    setImgFile(null);
    setPreviewImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRemovePhoto = async () => {
    setIsUploading(true);
    try {
      const res = await fetch("/api/user/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          bio: form.bio,
          location: form.location,
          website: form.website,
          image: null,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        const updatedForm = {
          ...form,
          image: "",
        };
        setAvatar("");
        setForm(updatedForm);
        setOriginalForm(updatedForm);
        setImgFile(null);
        setIsDirty(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }

        toast.success("Photo removed successfully!");
        window.dispatchEvent(new Event("photoUpdated"));
      } else {
        toast.error(data.error || "Failed to remove photo");
      }
    } catch (error) {
      console.error("Error removing photo:", error);
      toast.error("Failed to remove photo");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    let userProfileCloudUrl = form.image;
    if (imgFile) {
      setIsUploading(true);
      const formData = new FormData();
      formData.append("file", imgFile);
      formData.append("upload_preset", process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      console.log("data", data);
      setIsUploading(false);

      if (res.ok && data.secure_url) {
        userProfileCloudUrl = data.secure_url;
        setForm((prev) => ({ ...prev, image: data.secure_url }));
      } else {
        console.error("Cloudinary upload failed:", data);
        toast.error(data.error || "Failed to upload photo.");
        setIsUploading(false);
        setIsSaving(false);
        return;
      }
    }

    const res = await fetch("/api/user/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, image: userProfileCloudUrl || null }),
    });

    const data = await res.json();
    if (res.ok) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      router.refresh();
      toast.success("Changes updated successfully!");
      setIsDirty(false);
      setImgFile(null);
    } else {
      toast(`Update failed: ${data.error}`);
    }
    setIsSaving(false);
  };

  const handleCancel = async () => {
    const res = await fetch("/api/user/get");
    const data = await res.json();
    if (data.user) {
      const user = data.user;
      setForm({
        firstName: user.name?.split(" ")[0] || "",
        lastName: user.name?.split(" ").slice(1).join(" ") || "",
        email: user.email || "",
        bio: user.bio || "",
        location: user.location || "",
        website: user.website || "",
        timezone: user.timezone || "",
        image: user.image || "",
      });
      setAvatar(user.image || "");
      setIsDirty(false); //  reset dirty flag
    }
  };

  const handleDeleteAccount = async () => {
    const confirmed = confirm(
      "Are you sure you want to delete your account? This action cannot be undone."
    );
    if (!confirmed) {
      return;
    }

    const res = await fetch("/api/user/delete", {
      method: "DELETE",
    });

    const data = await res.json();

    if (res.ok) {
      alert("Your account has been deleted.");
      signOut({ callbackUrl: "/" });
    } else {
      alert(`Failed to delete account: ${data.error}`);
    }
  };

  return (
    <div className="min-h-screen bg-[#F3F0FC]">
      {/* HEADER BAR */}
      <SignedHeader titleText="Settings" iconSRC="/uil_setting.png" iconALT="settings_icon" />

      <div className="flex flex-wrap items-center gap-2 px-2 sm:px-4 md:px-8 pb-3 pt-4 bg-white border-b border-gray-200 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab}
            className={`flex-1 min-w-[120px] px-3 sm:px-6 py-2 border rounded-lg text-base sm:text-lg font-medium transition-colors focus:outline-none whitespace-nowrap ${
              activeTab === tab
                ? "bg-[#7C5CFC] text-white shadow"
                : "bg-transparent text-gray-500 hover:bg-[#ede7fa]"
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "Profile" && (
        <div className="px-2 sm:px-4 md:px-8 lg:px-16 xl:px-24">
          <div className="w-full mx-auto mt-8 mb-2">
            <h2 className="text-2xl font-bold mb-1">Profile Information</h2>
            <p className="text-gray-500 mb-6">Manage your profile settings here.</p>
          </div>
          <form
            className="w-full mx-auto mt-2 mb-12 bg-white rounded-xl border border-[#ede7fa] shadow-none p-4 sm:p-6 md:p-8 lg:p-10"
            onSubmit={handleSave}
            noValidate
          >
            <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 mb-8">
              <div
                className="w-24 h-24 rounded-full bg-[#F3F0FC] flex items-center justify-center text-3xl font-bold text-[#7C5CFC] border-2 border-[#E0D7FF] cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => isPhotoModalOpen && handlePhotoModalCancel()}
              >
                {avatar && avatar.trim() ? (
                  <Image
                    src={avatar}
                    alt="Avatar"
                    width={96}
                    height={96}
                    className="w-full h-full object-cover rounded-full"
                  />
                ) : (
                  initials
                )}
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 w-full sm:w-auto">
                {isUploading ? (
                  <div className="flex items-center gap-2 text-[#7C5CFC] font-medium px-4 py-2">
                    Uploading...
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={isUploading}
                      className="px-5 py-2 rounded-lg bg-[#7C5CFC] text-white font-semibold shadow hover:bg-[#8A76FC] transition w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Change Photo
                    </button>
                    {avatar && avatar.trim() && (
                      <button
                        type="button"
                        disabled={isUploading}
                        className="px-5 py-2 rounded-lg bg-white border border-[#8A76FC] text-[#8A76FC] font-semibold shadow hover:bg-[#F3F0FC] transition w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={handleRemovePhoto}
                      >
                        Remove Photo
                      </button>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      ref={fileInputRef}
                      className="hidden"
                      onChange={handlePhotoChange}
                    />
                  </>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-6">
              <div>
                <label className="block text-gray-600 mb-2">First Name</label>
                <input
                  type="text"
                  name="firstName"
                  value={form.firstName}
                  onChange={handleInputChange}
                  placeholder="Enter your first name here"
                  className="w-full px-4 py-3 rounded-lg border border-gray-200 bg-[#F8F6FF] text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#A594F9] shadow-sm"
                />
              </div>
              <div>
                <label className="block text-gray-600 mb-2">Last Name</label>
                <input
                  type="text"
                  name="lastName"
                  value={form.lastName}
                  onChange={handleInputChange}
                  placeholder="Enter your last name here"
                  className="w-full px-4 py-3 rounded-lg border border-gray-200 bg-[#F8F6FF] text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#A594F9] shadow-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-gray-600 mb-2">Email address</label>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleInputChange}
                  placeholder="Enter your email id here"
                  className="w-full px-4 py-3 rounded-lg border border-gray-200 bg-[#F8F6FF] text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#A594F9] shadow-sm"
                  disabled
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-gray-600 mb-2">Bio</label>
                <input
                  type="text"
                  name="bio"
                  value={form.bio}
                  onChange={handleInputChange}
                  placeholder="Tell us about yourself"
                  className="w-full px-4 py-3 rounded-lg border border-gray-200 bg-[#F8F6FF] text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#A594F9] shadow-sm"
                />
              </div>
              <div>
                <label className="block text-gray-600 mb-2">Location</label>
                <input
                  type="text"
                  name="location"
                  value={form.location}
                  onChange={handleInputChange}
                  placeholder="City, Country"
                  className="w-full px-4 py-3 rounded-lg border border-gray-200 bg-[#F8F6FF] text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#A594F9] shadow-sm"
                />
              </div>
              <div>
                <label className="block text-gray-600 mb-2">Website</label>
                <input
                  type="text"
                  name="website"
                  value={form.website}
                  onChange={handleInputChange}
                  placeholder="Paste your link here"
                  className="w-full px-4 py-3 rounded-lg border border-gray-200 bg-[#F8F6FF] text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#A594F9] shadow-sm"
                />
              </div>
              {/* <div className="sm:col-span-2">
                <label className="block text-gray-600 mb-2">Timezone</label>
                <input
                  type="text"
                  name="timezone"
                  value={form.timezone}
                  onChange={handleInputChange}
                  placeholder="UTC, Coordinated Universal Time"
                  className="w-full px-4 py-3 rounded-lg border border-gray-200 bg-[#F8F6FF] text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#A594F9] shadow-sm"
                />
              </div> */}
            </div>
            {isDirty && hasChanges && (
              <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-4 mt-8">
                <button
                  type="button"
                  className="px-8 py-3 cursor-pointer rounded-lg bg-white border border-gray-200 text-[#7C5CFC] font-semibold shadow hover:bg-[#ede7fa] transition w-full sm:w-auto"
                  onClick={handleCancel}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving || isUploading}
                  className="px-8 py-3 cursor-pointer rounded-lg bg-[#7C5CFC] text-white font-semibold shadow hover:bg-[#8A76FC] transition w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            )}
          </form>
        </div>
      )}
      {activeTab === "Notification" && (
        <div className="px-4 md:px-10 lg:px-16 xl:px-24">
          <div className="w-full mx-auto mt-8 mb-2">
            <h2 className="text-2xl font-bold mb-1">Notification</h2>
            <p className="text-gray-500 mb-6">Manage your notification settings here.</p>
          </div>
          <form className="w-full mx-auto mt-2 mb-12 bg-white rounded-xl border border-[#ede7fa] shadow-none p-8">
            <div className="flex flex-col gap-4 mb-8">
              {NOTIFICATION_SETTINGS.map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between bg-white border border-[#f3f0fc] rounded-lg px-6 py-4"
                >
                  <div>
                    <div className="font-semibold text-base text-[#1A0033]">{item.label}</div>
                    <div className="text-sm text-gray-400 mt-1">{item.desc}</div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer w-11 h-6">
                    <input type="checkbox" className="sr-only peer" defaultChecked={item.default} />
                    <div className="w-11 h-6 bg-gray-200 rounded-full peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#7C5CFC] peer-checked:bg-[#7C5CFC] transition-colors"></div>
                    <span className="absolute left-0.5 top-0.5 w-5 h-5 bg-white border border-gray-300 rounded-full transition-all duration-300 peer-checked:translate-x-5"></span>
                  </label>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-4 mt-8">
              <button
                type="button"
                className="px-8 py-3 rounded-lg bg-white border border-gray-200 text-[#7C5CFC] font-semibold shadow hover:bg-[#ede7fa] transition"
                onClick={handleCancel}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-8 py-3 rounded-lg bg-[#7C5CFC] text-white font-semibold shadow hover:bg-[#8A76FC] transition"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}
      {activeTab === "Privacy" && (
        <div className="px-4 md:px-10 lg:px-16 xl:px-24">
          <div className="w-full mx-auto mt-8 mb-2">
            <h2 className="text-2xl font-bold mb-1">Privacy and Security</h2>
            <p className="text-gray-500 mb-6">Manage your privacy and security settings here.</p>
          </div>
          <form className="w-full mx-auto mt-2 mb-12 bg-white rounded-xl border border-[#ede7fa] shadow-none p-8">
            <div className="flex flex-col gap-4 mb-8">
              <div className="flex items-center justify-between bg-white border border-[#f3f0fc] rounded-lg px-6 py-4">
                <div>
                  <div className="font-semibold text-base text-[#1A0033]">Public Visibility</div>
                  <div className="text-sm text-gray-400 mt-1">
                    Public - Anyone can see your profile
                  </div>
                </div>
                <button type="button" className="text-[#7C5CFC] text-2xl focus:outline-none">
                  <Image
                    src="/icons/chevron-down.png"
                    alt="Chevron Down"
                    width={24}
                    height={24}
                    className="feather feather-chevron-down"
                  />
                </button>
              </div>

              {PRIVACY_SETTINGS.map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between bg-white border border-[#f3f0fc] rounded-lg px-6 py-4"
                >
                  <div>
                    <div className="font-semibold text-base text-[#1A0033]">{item.label}</div>
                    <div className="text-sm text-gray-400 mt-1">{item.desc}</div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer w-11 h-6">
                    <input type="checkbox" className="sr-only peer" defaultChecked={item.default} />
                    <div className="w-11 h-6 bg-gray-200 rounded-full peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#7C5CFC] peer-checked:bg-[#7C5CFC] transition-colors"></div>
                    <span className="absolute left-0.5 top-0.5 w-5 h-5 bg-white border border-gray-300 rounded-full transition-all duration-300 peer-checked:translate-x-5"></span>
                  </label>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-4 mt-8">
              <button
                type="button"
                className="px-8 py-3 rounded-lg bg-white border border-gray-200 text-[#7C5CFC] font-semibold shadow hover:bg-[#ede7fa] transition"
                onClick={handleCancel}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-8 py-3 rounded-lg bg-[#7C5CFC] text-white font-semibold shadow hover:bg-[#8A76FC] transition"
              >
                Save Changes
              </button>
            </div>
          </form>
          <div className="w-full mx-auto mb-12 bg-white rounded-xl border border-[#ede7fa] shadow-none p-8">
            <h2 className="text-xl font-bold mb-6">Password and Security</h2>
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between bg-white border border-[#f3f0fc] rounded-lg px-6 py-4">
                <span className="font-medium text-base text-[#1A0033]">Change Passwords</span>
                <Image
                  src="/icons/purple-icon.png"
                  alt="Chevron Down"
                  width={24}
                  height={24}
                  className="feather feather-chevron-down"
                />
              </div>
              <div className="flex items-center justify-between bg-white border border-[#f3f0fc] rounded-lg px-6 py-4">
                <span className="font-medium text-base text-[#1A0033]">
                  Enable Two-factor authentication
                </span>
                <Image
                  src="/icons/shield.png"
                  alt="Chevron Down"
                  width={22}
                  height={22}
                  className="feather feather-chevron-down"
                />
              </div>
              <div className="flex items-center justify-between bg-white border border-[#f3f0fc] rounded-lg px-6 py-4">
                <span className="font-medium text-base text-[#1A0033]">
                  Download Recovery Codes
                </span>
                <Image
                  src="/icons/icon.png"
                  alt="Chevron Down"
                  width={22}
                  height={22}
                  className="feather feather-chevron-down"
                />
              </div>
            </div>
          </div>
        </div>
      )}
      {activeTab === "Preferences" && (
        <div className="px-4 md:px-10 lg:px-16 xl:px-24">
          <div className="w-full mx-auto mt-8 mb-2">
            <h2 className="text-2xl font-bold mb-1">Interface Preferences</h2>
            <p className="text-gray-500 mb-6">Manage your interface preferences settings here.</p>
          </div>
          <form className="w-full mx-auto mt-2 mb-12 bg-white rounded-xl border border-[#ede7fa] shadow-none p-8">
            <div className="flex flex-col gap-4 mb-8">
              <div className="flex items-center justify-between bg-white border border-[#f3f0fc] rounded-lg px-6 py-4">
                <div>
                  <div className="font-semibold text-base text-[#1A0033]">Theme</div>
                  <div className="text-sm text-gray-400 mt-1">Light mode</div>
                </div>
                <button type="button" className="text-[#7C5CFC] text-2xl focus:outline-none">
                  <Image
                    src="/icons/chevron-down.png"
                    alt="Chevron Down"
                    width={24}
                    height={24}
                    className="feather feather-chevron-down"
                  />
                </button>
              </div>
              <div className="flex items-center justify-between bg-white border border-[#f3f0fc] rounded-lg px-6 py-4">
                <div>
                  <div className="font-semibold text-base text-[#1A0033]">Language</div>
                  <div className="text-sm text-gray-400 mt-1">English</div>
                </div>
                <button type="button" className="text-[#7C5CFC] text-2xl focus:outline-none">
                  <Image
                    src="/icons/chevron-down.png"
                    alt="Chevron Down"
                    width={24}
                    height={24}
                    className="feather feather-chevron-down"
                  />
                </button>
              </div>
              {PREFERENCES_SETTINGS.map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between bg-white border border-[#f3f0fc] rounded-lg px-6 py-4"
                >
                  <div>
                    <div className="font-semibold text-base text-[#1A0033]">{item.label}</div>
                    <div className="text-sm text-gray-400 mt-1">{item.desc}</div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer w-11 h-6">
                    <input type="checkbox" className="sr-only peer" defaultChecked={item.default} />
                    <div className="w-11 h-6 bg-gray-200 rounded-full peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#7C5CFC] peer-checked:bg-[#7C5CFC] transition-colors"></div>
                    <span className="absolute left-0.5 top-0.5 w-5 h-5 bg-white border border-gray-300 rounded-full transition-all duration-300 peer-checked:translate-x-5"></span>
                  </label>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-4 mt-8">
              <button
                type="button"
                className="px-8 py-3 rounded-lg bg-white border border-gray-200 text-[#7C5CFC] font-semibold shadow hover:bg-[#ede7fa] transition"
                onClick={handleCancel}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-8 py-3 rounded-lg bg-[#7C5CFC] text-white font-semibold shadow hover:bg-[#8A76FC] transition"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}
      {activeTab === "Account" && (
        <div className="px-2 sm:px-4 md:px-8 lg:px-16 xl:px-24 flex flex-col">
          <div className="w-full mt-8 mb-2">
            <h2 className="text-xl sm:text-2xl font-bold mb-1">Plan and Billing</h2>
          </div>
          <div className="w-full mb-4 bg-[#F3F0FC] rounded-xl">
            <div className="p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div>
                  <div className="font-semibold text-base sm:text-lg text-[#1A0033]">Free Plan</div>
                  <div className="text-xs sm:text-sm text-gray-500">
                    Create up to 5 demos and basic features
                  </div>
                </div>
                <button className="px-4 sm:px-6 py-2 rounded-lg bg-[#7C5CFC] text-white text-sm sm:text-base font-semibold shadow hover:bg-[#8A76FC] transition whitespace-nowrap w-full sm:w-auto">
                  Upgrade to Pro
                </button>
              </div>
            </div>
            <div className="px-4 sm:px-6 pb-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 justify-start">
                <div className="bg-white rounded-lg p-4 sm:p-6 flex flex-col items-center justify-center">
                  <div className="text-gray-400 text-xs sm:text-sm mb-2">Demos created</div>
                  <div className="text-2xl sm:text-3xl font-bold text-[#7C5CFC]">5</div>
                </div>
                <div className="bg-white rounded-lg p-4 sm:p-6 flex flex-col items-center justify-center">
                  <div className="text-gray-400 text-xs sm:text-sm mb-2">Teams joined</div>
                  <div className="text-2xl sm:text-3xl font-bold text-[#7C5CFC]">1</div>
                </div>
                <div className="bg-white rounded-lg p-4 sm:p-6 flex flex-col items-center justify-center">
                  <div className="text-gray-400 text-xs sm:text-sm mb-2">Total views</div>
                  <div className="text-2xl sm:text-3xl font-bold text-[#7C5CFC]">25</div>
                </div>
              </div>
            </div>
          </div>
          <div className="w-full mb-12">
            <h2 className="text-xl sm:text-2xl font-bold mb-4">Data Management</h2>
            <div className="flex flex-col gap-3 sm:gap-4 px-4 sm:px-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-white rounded-lg border border-[#ede7fa] p-4 sm:px-6 sm:py-4 gap-3 sm:gap-4">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm sm:text-base text-[#1A0033]">
                    Export My Data
                  </div>
                  <div className="text-xs sm:text-sm text-gray-400 mt-1">
                    Download a copy of all your data including demos, teams and settings.
                  </div>
                </div>
                <button className="text-[#7C5CFC] text-xl sm:text-2xl focus:outline-none shrink-0">
                  <Image
                    src="/icons/icon1.png"
                    alt="Chevron Down"
                    width={24}
                    height={24}
                    className="feather feather-chevron-down"
                  />
                </button>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-red-50 rounded-lg border border-red-200 p-4 sm:px-6 sm:py-4 gap-3 sm:gap-4">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm sm:text-base text-[#E53E3E]">
                    Delete Account
                  </div>
                  <div className="text-xs sm:text-sm text-red-400 mt-1">
                    Once you delete the account, your data cannot be retrieved. Be Certain!
                  </div>
                </div>
                <button
                  onClick={handleDeleteAccount}
                  className="text-[#E53E3E] text-xl sm:text-2xl focus:outline-none shrink-0"
                >
                  <Image
                    src="/icons/icon2.png"
                    alt="Chevron Down"
                    width={24}
                    height={24}
                    className="feather feather-chevron-down"
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <PhotoUploadModal
        isOpen={isPhotoModalOpen}
        imagePreview={previewImage}
        onSave={handlePhotoModalSave}
        onCancel={handlePhotoModalCancel}
      />
      <ToastContainer position="top-right" autoClose={3000} />
    </div>
  );
};

export default SettingsPage;
