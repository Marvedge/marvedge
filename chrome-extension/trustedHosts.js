// Shared allowlist for extension page messaging. Plain script on purpose:
// content.js runs as a classic content script, so this file sets one global
// instead of using imports. Keep the rule tight: only our own app origins
// may command the extension or receive the recorded timeline. Loosening
// this (for example back to "*") reopens session theft on any website,
// and trustedHosts.test.js fails loudly if that happens.
(function (root) {
  function isTrustedPage(hostname) {
    const host = String(hostname || "").toLowerCase();
    if (host === "marvedge.com") {
      return true;
    }
    if (host.endsWith(".marvedge.com")) {
      return true;
    }
    if (host === "localhost" || host === "127.0.0.1") {
      return true;
    }
    return false;
  }

  root.isTrustedPage = isTrustedPage;
})(typeof globalThis !== "undefined" ? globalThis : this);
