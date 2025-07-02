"use client";
import React, { useState, useRef } from "react";
import { useSession, signOut } from "next-auth/react";
import { FaPlayCircle } from "react-icons/fa";
import Image from "next/image";

const TABS = ["Profile", "Notification", "Privacy", "Preferences", "Account"];

const SettingsPage = () => {
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
  });
  const [avatar, setAvatar] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [topSearch, setTopSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  const initials = React.useMemo(() => {
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

  React.useEffect(() => {
    setForm((prev) => ({
      ...prev,
      firstName: session?.user?.name?.split(" ")[0] || "",
      lastName: session?.user?.name?.split(" ").slice(1).join(" ") || "",
      email: session?.user?.email || "",
    }));
  }, [session]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const imageUrl = URL.createObjectURL(file);
      setAvatar(imageUrl);
    }
  };

  const handleEdit = () => {};

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
  };

  const handleCancel = () => {};

  return (
    <div className="min-h-screen bg-[#F3F0FC]">
      <div className="w-full bg-white border-b border-gray-200 flex items-center justify-between px-8 py-4">
        <div className="flex items-center gap-3">
          <FaPlayCircle className="text-[#A594F9] text-2xl" />
          <span className="text-lg text-gray-400 font-medium">My Demos</span>
        </div>

        <div className="hidden md:flex justify-center flex-1">
          <input
            type="text"
            placeholder="Search"
            value={topSearch}
            onChange={(e) => setTopSearch(e.target.value)}
            className="px-4 py-2 rounded-full border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#6356D7] bg-white text-gray-700 w-56 shadow-sm transition-all"
          />
        </div>

        <div className="flex items-center gap-6">
          <span className="text-gray-500 text-lg">
            Welcome{" "}
            <span className="text-[#7C5CFC] font-semibold">
              {session?.user?.name?.split(" ")[0] ||
                session?.user?.email?.split("@")[0] ||
                "User"}
            </span>{" "}
            <span className="inline-block">👋</span>
          </span>
          <button
            className="relative p-2 rounded-full hover:bg-[#F1ECFF] transition-colors focus:outline-none"
            title="Notifications"
          >
            <Image
              src="/icons/bell.png"
              alt="Notifications"
              width={24}
              height={24}
              className="w-6 h-6"
            />
          </button>
          <div className="relative" ref={dropdownRef}>
            <button
              className="w-10 h-10 rounded-full bg-[#7C5CFC] text-white flex items-center justify-center text-lg font-bold shadow cursor-pointer border-4 border-white hover:scale-105 transition-all"
              onClick={() => setShowDropdown((v) => !v)}
              title={session?.user?.name || session?.user?.email || undefined}
            >
              {initials}
            </button>
            {showDropdown && (
              <div className="absolute right-0 mt-2 w-56 bg-whit635e rounded-lg shadow-lg p-3 z-50 border border-gray-200 animate-fade-in">
                <div className="mb-2 text-base font-bold text-[#6D7]">
                  {session?.user?.name || "User"}
                </div>
                <div className="mb-1 text-gray-700 text-xs font-semibold">
                  {session?.user?.email}
                </div>
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="mt-3 w-full px-3 py-2 bg-[#6356D7] text-white rounded hover:bg-[#7E5FFF] font-semibold transition-all text-sm"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 px-8 pb-5  pt-6 bg-white border-b border-gray-200">
        {TABS.map((tab) => (
          <button
            key={tab}
            className={`px-8 py-2 w-60 border  rounded-lg text-lg font-medium transition-colors focus:outline-none ${
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
        <div className="px-4 md:px-10 lg:px-16 xl:px-24">
          <div className="w-full mx-auto mt-8 mb-2">
            <h2 className="text-2xl font-bold mb-1">Profile Information</h2>
            <p className="text-gray-500 mb-6">
              Manage your profile settings here.
            </p>
          </div>
          <form
            className="w-full mx-auto mt-2 mb-12 bg-white rounded-xl border border-[#ede7fa] shadow-none p-10"
            onSubmit={handleSave}
          >
            <div className="flex items-center gap-6 mb-8">
              <div className="w-24 h-24 rounded-full bg-[#F3F0FC] flex items-center justify-center text-3xl font-bold text-[#7C5CFC] border-2 border-[#E0D7FF]">
                {avatar ? (
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
              <div className="flex flex-row gap-4">
                <button
                  type="button"
                  className="px-5 py-2 rounded-lg bg-[#7C5CFC] text-white font-semibold shadow hover:bg-[#8A76FC] transition"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Change Photo
                </button>
                <input
                  type="file"
                  accept="image/*"
                  ref={fileInputRef}
                  className="hidden"
                  onChange={handlePhotoChange}
                />
                <button
                  type="button"
                  className="px-5 py-2 min-w-[120px] rounded-lg bg-white border border-gray-200 text-[#7C5CFC] font-semibold shadow hover:bg-[#ede7fa] transition"
                  onClick={handleEdit}
                >
                  Edit
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
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
              <div className="md:col-span-2">
                <label className="block text-gray-600 mb-2">
                  Email address
                </label>
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
              <div className="md:col-span-2">
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
              <div className="md:col-span-2">
                <label className="block text-gray-600 mb-2">Timezone</label>
                <input
                  type="text"
                  name="timezone"
                  value={form.timezone}
                  onChange={handleInputChange}
                  placeholder="UTC, Coordinated Universal Time"
                  className="w-full px-4 py-3 rounded-lg border border-gray-200 bg-[#F8F6FF] text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#A594F9] shadow-sm"
                />
              </div>
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
      {activeTab === "Notification" && (
        <div className="px-4 md:px-10 lg:px-16 xl:px-24">
          <div className="w-full mx-auto mt-8 mb-2">
            <h2 className="text-2xl font-bold mb-1">Notification</h2>
            <p className="text-gray-500 mb-6">
              Manage your notification settings here.
            </p>
          </div>
          <form className="w-full mx-auto mt-2 mb-12 bg-white rounded-xl border border-[#ede7fa] shadow-none p-8">
            <div className="flex flex-col gap-4 mb-8">
              {[
                {
                  label: "Email Notification",
                  desc: "Receive notification via mail.",
                  key: "emailNotification",
                  default: true,
                },
                {
                  label: "Demo Shares",
                  desc: "Receive notification when someone shares your demo.",
                  key: "demoShares",
                  default: true,
                },
                {
                  label: "Team Invitations",
                  desc: "Receive notification when you are invited to a team.",
                  key: "teamInvitations",
                  default: true,
                },
                {
                  label: "Weekly Digest",
                  desc: "Receive notification of the summary of your demo performance.",
                  key: "weeklyDigest",
                  default: false,
                },
                {
                  label: "Marketing Email",
                  desc: "Receive notification of the product updates and feature announcements.",
                  key: "marketingEmail",
                  default: false,
                },
                {
                  label: "Security Alerts",
                  desc: "Important security notification.",
                  key: "securityAlerts",
                  default: false,
                },
              ].map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between bg-white border border-[#f3f0fc] rounded-lg px-6 py-4"
                >
                  <div>
                    <div className="font-semibold text-base text-[#1A0033]">
                      {item.label}
                    </div>
                    <div className="text-sm text-gray-400 mt-1">
                      {item.desc}
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer w-11 h-6">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      defaultChecked={item.default}
                    />
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
            <p className="text-gray-500 mb-6">
              Manage your privacy and security settings here.
            </p>
          </div>
          <form className="w-full mx-auto mt-2 mb-12 bg-white rounded-xl border border-[#ede7fa] shadow-none p-8">
            <div className="flex flex-col gap-4 mb-8">
              <div className="flex items-center justify-between bg-white border border-[#f3f0fc] rounded-lg px-6 py-4">
                <div>
                  <div className="font-semibold text-base text-[#1A0033]">
                    Public Visibility
                  </div>
                  <div className="text-sm text-gray-400 mt-1">
                    Public - Anyone can see your profile
                  </div>
                </div>
                <button
                  type="button"
                  className="text-[#7C5CFC] text-2xl focus:outline-none"
                >
                  <svg
                    width="24"
                    height="24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="feather feather-chevron-down"
                  >
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </button>
              </div>

              {[
                {
                  label: "Show email address",
                  desc: "Display your email on public profile.",
                  key: "showEmail",
                  default: true,
                },
                {
                  label: "Show Location",
                  desc: "Display your location on public profile.",
                  key: "showLocation",
                  default: true,
                },
                {
                  label: "Allow Demo Indexing",
                  desc: "Let Search engines index your public demos.",
                  key: "allowDemoIndexing",
                  default: false,
                },
                {
                  label: "Analytics and Usage Data",
                  desc: "Help to improve Marvedge by sharing usage data.",
                  key: "analyticsUsageData",
                  default: false,
                },
              ].map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between bg-white border border-[#f3f0fc] rounded-lg px-6 py-4"
                >
                  <div>
                    <div className="font-semibold text-base text-[#1A0033]">
                      {item.label}
                    </div>
                    <div className="text-sm text-gray-400 mt-1">
                      {item.desc}
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer w-11 h-6">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      defaultChecked={item.default}
                    />
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
                <span className="font-medium text-base text-[#1A0033]">
                  Change Passwords
                </span>
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M15.75 1.5C14.6959 1.49976 13.6565 1.74642 12.7149 2.22023C11.7734 2.69404 10.9559 3.38181 10.328 4.22844C9.7001 5.07506 9.27925 6.057 9.09917 7.09555C8.91909 8.13411 8.98479 9.20041 9.291 10.209L1.5 18V22.5H6L13.791 14.709C14.7194 14.9908 15.6977 15.0692 16.6591 14.9387C17.6206 14.8083 18.5426 14.4721 19.3624 13.953C20.1821 13.434 20.8804 12.7444 21.4095 11.9311C21.9386 11.1178 22.2862 10.2 22.4285 9.24025C22.5709 8.28049 22.5046 7.30132 22.2343 6.36948C21.964 5.43764 21.496 4.57502 20.8622 3.84042C20.2283 3.10582 19.4436 2.51649 18.5614 2.11261C17.6792 1.70872 16.7203 1.49978 15.75 1.5ZM15.75 13.5C15.2336 13.4999 14.7201 13.4235 14.226 13.2735L13.3657 13.0125L12.7305 13.6478L10.3448 16.0335L9.3105 15L8.25 16.0605L9.28425 17.0947L8.09475 18.2843L7.0605 17.25L6 18.3105L7.03425 19.3447L5.379 21H3V18.621L10.3515 11.2695L10.9875 10.6342L10.7265 9.774C10.4059 8.71724 10.4268 7.58631 10.786 6.54207C11.1453 5.49784 11.8247 4.59347 12.7275 3.95762C13.6304 3.32177 14.7108 2.98681 15.815 3.0004C16.9192 3.01398 17.9911 3.37542 18.878 4.03329C19.765 4.69116 20.4219 5.61197 20.7554 6.66473C21.0888 7.71749 21.0818 8.84859 20.7354 9.89714C20.3889 10.9457 19.7206 11.8583 18.8256 12.5051C17.9305 13.152 16.8543 13.5001 15.75 13.5Z"
                    fill="#8A76FC"
                  />
                  <path
                    d="M16.5 9C17.3284 9 18 8.32843 18 7.5C18 6.67157 17.3284 6 16.5 6C15.6716 6 15 6.67157 15 7.5C15 8.32843 15.6716 9 16.5 9Z"
                    fill="#8A76FC"
                  />
                </svg>
              </div>
              <div className="flex items-center justify-between bg-white border border-[#f3f0fc] rounded-lg px-6 py-4">
                <span className="font-medium text-base text-[#1A0033]">
                  Enable Two- factor authentication
                </span>
                <svg
                  width="22"
                  height="22"
                  fill="none"
                  stroke="#A594F9"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="feather feather-shield"
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <div className="flex items-center justify-between bg-white border border-[#f3f0fc] rounded-lg px-6 py-4">
                <span className="font-medium text-base text-[#1A0033]">
                  Download Recovery Codes
                </span>
                <svg
                  width="22"
                  height="22"
                  fill="none"
                  stroke="#A594F9"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="feather feather-download"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      )}
      {activeTab === "Preferences" && (
        <div className="px-4 md:px-10 lg:px-16 xl:px-24">
          <div className="w-full mx-auto mt-8 mb-2">
            <h2 className="text-2xl font-bold mb-1">Interface Preferences</h2>
            <p className="text-gray-500 mb-6">
              Manage your interface preferences settings here.
            </p>
          </div>
          <form className="w-full mx-auto mt-2 mb-12 bg-white rounded-xl border border-[#ede7fa] shadow-none p-8">
            <div className="flex flex-col gap-4 mb-8">
              <div className="flex items-center justify-between bg-white border border-[#f3f0fc] rounded-lg px-6 py-4">
                <div>
                  <div className="font-semibold text-base text-[#1A0033]">
                    Theme
                  </div>
                  <div className="text-sm text-gray-400 mt-1">Light mode</div>
                </div>
                <button
                  type="button"
                  className="text-[#7C5CFC] text-2xl focus:outline-none"
                >
                  <svg
                    width="24"
                    height="24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="feather feather-chevron-down"
                  >
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </button>
              </div>
              <div className="flex items-center justify-between bg-white border border-[#f3f0fc] rounded-lg px-6 py-4">
                <div>
                  <div className="font-semibold text-base text-[#1A0033]">
                    Language
                  </div>
                  <div className="text-sm text-gray-400 mt-1">English</div>
                </div>
                <button
                  type="button"
                  className="text-[#7C5CFC] text-2xl focus:outline-none"
                >
                  <svg
                    width="24"
                    height="24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="feather feather-chevron-down"
                  >
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </button>
              </div>
              {[
                {
                  label: "Auto Save",
                  desc: "Automatically save your work.",
                  key: "autoSave",
                  default: true,
                },
                {
                  label: "Show Tutorials",
                  desc: "Display helpful tips and tutorials.",
                  key: "showTutorials",
                  default: false,
                },
                {
                  label: "Compact mode",
                  desc: "Use smaller interface elements.",
                  key: "compactMode",
                  default: false,
                },
                {
                  label: "Animations",
                  desc: "Enable smooth transitions and animations.",
                  key: "animations",
                  default: false,
                },
              ].map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between bg-white border border-[#f3f0fc] rounded-lg px-6 py-4"
                >
                  <div>
                    <div className="font-semibold text-base text-[#1A0033]">
                      {item.label}
                    </div>
                    <div className="text-sm text-gray-400 mt-1">
                      {item.desc}
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer w-11 h-6">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      defaultChecked={item.default}
                    />
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
        <div className="px-4 md:px-10 lg:px-16 xl:px-24">
          <div className="w-full mx-auto mt-8 mb-2">
            <h2 className="text-2xl font-bold mb-1">Plan and Billing</h2>
          </div>
          <div className="w-full mx-auto mb-8 bg-[#F3F0FC] rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="font-semibold text-lg text-[#1A0033]">
                  Free Plan
                </div>
                <div className="text-sm text-gray-500">
                  Create up to 5 demos and basic features
                </div>
              </div>
              <button className="px-6 py-2 rounded-lg bg-[#7C5CFC] text-white font-semibold shadow hover:bg-[#8A76FC] transition">
                Upgrade to Pro
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-lg p-6 flex flex-col items-center justify-center">
                <div className="text-gray-400 text-sm mb-2">Demos created</div>
                <div className="text-3xl font-bold text-[#7C5CFC]">5</div>
              </div>
              <div className="bg-white rounded-lg p-6 flex flex-col items-center justify-center">
                <div className="text-gray-400 text-sm mb-2">Teams joined</div>
                <div className="text-3xl font-bold text-[#7C5CFC]">1</div>
              </div>
              <div className="bg-white rounded-lg p-6 flex flex-col items-center justify-center">
                <div className="text-gray-400 text-sm mb-2">Total views</div>
                <div className="text-3xl font-bold text-[#7C5CFC]">25</div>
              </div>
            </div>
          </div>
          <div className="w-full mx-auto mb-12">
            <h2 className="text-2xl font-bold mb-4">Data Management</h2>
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between bg-white rounded-lg border border-[#ede7fa] px-6 py-4">
                <div>
                  <div className="font-semibold text-base text-[#1A0033]">
                    Export My Data
                  </div>
                  <div className="text-sm text-gray-400 mt-1">
                    Download a copy of all your data including demos, teams and
                    settings.
                  </div>
                </div>
                <button className="text-[#7C5CFC] text-2xl focus:outline-none">
                  <svg
                    width="24"
                    height="24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="feather feather-download"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </button>
              </div>
              <div className="flex items-center justify-between bg-red-50 rounded-lg border border-red-200 px-6 py-4">
                <div>
                  <div className="font-semibold text-base text-[#E53E3E]">
                    Delete Account
                  </div>
                  <div className="text-sm text-red-400 mt-1">
                    Once you delete the account, your data cannot be retrieved.
                    Be Certain!
                  </div>
                </div>
                <button className="text-[#E53E3E] text-2xl focus:outline-none">
                  <svg
                    width="24"
                    height="24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="feather feather-trash-2"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m5 0V4a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v2" />
                    <line x1="10" y1="11" x2="10" y2="17" />
                    <line x1="14" y1="11" x2="14" y2="17" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
