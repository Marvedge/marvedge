import SignedLayoutClient from "./SignedLayoutClient";

export default function SignedLayout({ children }: { children: React.ReactNode }) {
  return <SignedLayoutClient>{children}</SignedLayoutClient>;
}
