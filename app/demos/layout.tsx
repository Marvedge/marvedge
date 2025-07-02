import SignedLayout from "../(signed)/layout";

export default function DemosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SignedLayout>{children}</SignedLayout>;
}
