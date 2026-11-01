import { SourcePage } from "./creation-workflow";
export function CreatePage({ initialType }: { initialType?: string }) {
  return <SourcePage initialType={initialType ?? "demo"} />;
}
