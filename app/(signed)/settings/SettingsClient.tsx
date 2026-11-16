"use client";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import { useSettings } from "./hooks/useSettings";
import SettingsTabs from "./components/SettingsTabs";
import ProfileTab from "./components/ProfileTab";
import AccountTab from "./components/AccountTab";
import BrandingTab from "./components/BrandingTab";
import CrmTab from "./components/CrmTab";
import ConsentTab from "./components/ConsentTab";
import { TABS } from "../../lib/constants";
import { isOverlaysPanelEnabled } from "@/app/lib/overlays/flags";

export const metadata = {
  titleText: "Analytics",
  iconSRC: "/majesticons_analytics.png",
};

/**
 * Task-00133 adds a dedicated Consent tab.
 * OVL (#302 §2.1) adds a CRM-delivery tab.
 */
const CONSENT_TAB = "Consent";
const CRM_TAB = "Integrations";
const BASE_TABS = [...TABS, CONSENT_TAB];
const TAB_LIST = isOverlaysPanelEnabled() ? [...BASE_TABS, CRM_TAB] : BASE_TABS;

const SettingsPage = () => {
  const settings = useSettings();

  return (
    <div className="settings-page min-h-screen bg-[#F3F0FC]">
      <SettingsTabs
        activeTab={settings.activeTab}
        setActiveTab={settings.setActiveTab}
        tabs={TAB_LIST}
      />

      {settings.activeTab === "Profile" && <ProfileTab settings={settings} />}

      {settings.activeTab === "Account" && <AccountTab settings={settings} />}

      {settings.activeTab === "Branding" && <BrandingTab />}

      {settings.activeTab === CONSENT_TAB && <ConsentTab />}

      {settings.activeTab === CRM_TAB && isOverlaysPanelEnabled() && <CrmTab />}
      <ToastContainer position="top-right" autoClose={3000} />
    </div>
  );
};

export default SettingsPage;
