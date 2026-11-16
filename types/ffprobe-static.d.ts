/**
 * Minimal ambient module declaration for `ffprobe-static`.
 *
 * The package ships a CommonJS entry that has no bundled TS types and no
 * community @types package. This shim gives TypeScript enough information to
 * import it without falling back to `any` implicitly (which causes TS7016).
 *
 * Shape based on the actual index.js export:
 *   module.exports = { path: string, version: string }
 */
declare module "ffprobe-static" {
  const ffprobe: {
    /** Absolute path to the ffprobe binary included in the package. */
    path: string;
    /** Version string of the bundled ffprobe binary. */
    version: string;
  };
  export = ffprobe;
}
