import { createContext, useContext, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";

export type AccountProfile = { display_name: string; avatar_url: string };
export type AccountState = {
  user: User | null;
  profile: AccountProfile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};
export const AccountContext = createContext<AccountState | null>(null);
export function AccountProvider({ value, children }: { value: AccountState; children: ReactNode }) {
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}
export function useAccount() {
  const account = useContext(AccountContext);
  if (!account) throw new Error("Account provider missing");
  return account;
}