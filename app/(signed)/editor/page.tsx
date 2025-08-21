import { getPageMetadata } from "@/app/lib/metadata";
import EditorClient from "./EditorClient";

export const metadata = getPageMetadata("editor");

export default function Page() {
  return <EditorClient />;
}
