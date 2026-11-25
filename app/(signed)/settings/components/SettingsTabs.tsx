import { TABS } from "../../../lib/constants";

export const CONSENT_TAB = "Consent";
export const SETTINGS_TABS = [...TABS, CONSENT_TAB] as const;

type SettingsTabsProps = {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  /**
   * The tabs to render. Defaults to SETTINGS_TABS, including the Consent controls.
   * SettingsClient passes a longer list when a flagged tab is switched on.
   */
  tabs?: readonly string[];
};

export default function SettingsTabs({
  activeTab,
  setActiveTab,
  tabs = SETTINGS_TABS,
}: SettingsTabsProps) {
  return (
    <div className="tabs flex flex-wrap items-center gap-2 px-2 sm:px-4 md:px-8 pb-3 pt-4 bg-white border-b border-gray-200 overflow-x-auto">
      {tabs.map((tab) => (
        <button
          key={tab}
          className={`tab flex-1 min-w-[120px] px-3 sm:px-6 py-2 border rounded-lg text-base sm:text-lg font-medium transition-colors focus:outline-none whitespace-nowrap ${
            activeTab === tab
              ? "active bg-[#7C5CFC] text-white shadow"
              : "bg-transparent text-gray-500 hover:bg-[#ede7fa]"
          }`}
          onClick={() => setActiveTab(tab)}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}
