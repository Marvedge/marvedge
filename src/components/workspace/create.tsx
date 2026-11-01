import { SourcePage } from "./creation-workflow";
export function CreatePage({ initialType, initialMethod }: { initialType?: string; initialMethod?: string | undefined }) {
  return <SourcePage initialType={initialType ?? "demo"} initialMethod={initialMethod} />;
}
