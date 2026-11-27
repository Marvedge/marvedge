import { assertFetchTargetIsPublic } from "../http/safeFetch";

/**
 * Re-resolve the host right before delivery and bail if it now points somewhere
 * internal. Resolution failure is a BLOCK, not a pass: a hostname whose DNS we
 * cannot read is exactly the case where an attacker may be racing the resolver,
 * and dropping one webhook is preferable to sending it into the internal
 * network. The shared fetch-target helper owns the literal and resolved checks
 * so every server fetch applies the same rules.
 */
export async function deliveryHostIsPublic(rawUrl: string): Promise<boolean> {
  try {
    await assertFetchTargetIsPublic(rawUrl);
    return true;
  } catch (error) {
    console.warn(
      "[crm] webhook target rejected:",
      error instanceof Error ? error.message : error
    );
    return false;
  }
}
