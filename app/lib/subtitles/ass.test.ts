import { createRequire } from "module";
import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  applyRtlBidi,
  escapeAssText,
  escapeFfmpegFilterPath,
  formatAssTime,
  generateAssContent,
  writeAssFile,
} from "./ass";
import { DEFAULT_SUBTITLE_STYLE, toAssOverrideTags, toAssStyleLine } from "./style";
import type { SubtitleCue, SubtitleStyle } from "./types";
import { cuesFromWhisperWords, normalizeWhisperResponse } from "./whisper";

const require_ = createRequire(import.meta.url);
const worker = require_(path.join(process.cwd(), "cloudrun-worker", "render.js")) as {
  writeAssSubtitles: (
    tempDir: string,
    cues: SubtitleCue[],
    w: number,
    h: number,
    style?: unknown,
    language?: unknown
  ) => string;
};

describe("Canonical ASS Generator & Serializer (Task-00038)", () => {
  describe("formatAssTime", () => {
    it("formats zero and small fractional seconds", () => {
      expect(formatAssTime(0)).toBe("0:00:00.00");
      expect(formatAssTime(0.04)).toBe("0:00:00.04");
      expect(formatAssTime(0.99)).toBe("0:00:00.99");
    });

    it("formats minutes and hours with centiseconds", () => {
      expect(formatAssTime(1.23)).toBe("0:00:01.23");
      expect(formatAssTime(65.45)).toBe("0:01:05.45");
      expect(formatAssTime(3661.09)).toBe("1:01:01.09");
    });

    it("clamps negative values and handles invalid inputs", () => {
      expect(formatAssTime(-5.0)).toBe("0:00:00.00");
      expect(formatAssTime(Number.NaN)).toBe("0:00:00.00");
      expect(formatAssTime(Infinity)).toBe("0:00:00.00");
    });
  });

  describe("escapeAssText", () => {
    it("converts line breaks to \\N", () => {
      expect(escapeAssText("Line 1\nLine 2")).toBe("Line 1\\NLine 2");
      expect(escapeAssText("Line 1\r\nLine 2")).toBe("Line 1\\NLine 2");
    });

    it("replaces curly braces to prevent unauthorized override tag injection", () => {
      expect(escapeAssText("Hello {\\b1}World{/b}")).toBe("Hello (\\b1)World(/b)");
    });

    it("handles empty or falsy text", () => {
      expect(escapeAssText("")).toBe("");
      expect(escapeAssText(null as any)).toBe("");
      expect(escapeAssText(undefined as any)).toBe("");
    });
  });

  describe("escapeFfmpegFilterPath", () => {
    it("normalizes backslashes to forward slashes", () => {
      expect(escapeFfmpegFilterPath("dir\\sub\\file.ass")).toBe("dir/sub/file.ass");
    });

    it("escapes colons for FFmpeg option parsing", () => {
      expect(escapeFfmpegFilterPath("C:\\path\\file.ass")).toBe("C\\\\:/path/file.ass");
    });

    it("escapes spaces, single quotes, and brackets in paths", () => {
      expect(escapeFfmpegFilterPath("C:\\my videos\\sub's [1].ass")).toBe(
        "C\\\\:/my\\ videos/sub\\'s\\ \\[1\\].ass"
      );
    });

    it("handles POSIX absolute paths", () => {
      expect(escapeFfmpegFilterPath("/tmp/subtitles.ass")).toBe("/tmp/subtitles.ass");
    });
  });

  describe("generateAssContent", () => {
    const sampleCues: SubtitleCue[] = [
      { start: 0.5, end: 2.0, text: "Hello from Task-00038." },
      { start: 2.5, end: 4.8, text: "Word-level timestamps preserved." },
    ];

    it("generates valid ASS structure with Script Info, V4+ Styles, and Events", () => {
      const ass = generateAssContent(sampleCues, 1920, 1080);

      expect(ass).toContain("[Script Info]");
      expect(ass).toContain("ScriptType: v4.00+");
      expect(ass).toContain("PlayResX: 1920");
      expect(ass).toContain("PlayResY: 1080");

      expect(ass).toContain("[V4+ Styles]");
      expect(ass).toContain("Format: Name, Fontname, Fontsize,");
      expect(ass).toContain("Style: Default,Arial,");

      expect(ass).toContain("[Events]");
      expect(ass).toContain(
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"
      );
      expect(ass).toContain("Dialogue: 0,0:00:00.50,0:00:02.00,Default,,0,0,0,,Hello from Task-00038.");
      expect(ass).toContain(
        "Dialogue: 0,0:00:02.50,0:00:04.80,Default,,0,0,0,,Word-level timestamps preserved."
      );
    });

    it("integrates custom SubtitleStyle and animation tags", () => {
      const customStyle: SubtitleStyle = {
        fontFamily: "roboto",
        color: "#FFFF00",
        alignment: "top",
        animation: "fade",
      };

      const ass = generateAssContent(sampleCues, 1080, 1920, customStyle);

      // Verify custom style line generated
      const expectedStyleLine = toAssStyleLine(customStyle, 1080, 1920);
      expect(ass).toContain(expectedStyleLine);

      // Verify animation override tag prepended
      const expectedTag = toAssOverrideTags(customStyle, 1080, 1920);
      expect(expectedTag).toBe("{\\fad(200,200)}");
      expect(ass).toContain(`Dialogue: 0,0:00:00.50,0:00:02.00,Default,,0,0,0,,{\\fad(200,200)}Hello from Task-00038.`);
    });

    it("applies RTL bidi markers when language is Arabic or a regional Arabic variant", () => {
      const arabicCues: SubtitleCue[] = [{ start: 0, end: 2, text: "مرحبا بك" }];
      const assAr = generateAssContent(arabicCues, 1920, 1080, undefined, "ar");
      const assArEg = generateAssContent(arabicCues, 1920, 1080, undefined, "ar-EG");
      const assArSa = generateAssContent(arabicCues, 1920, 1080, undefined, "ar-SA");

      const expectedText = applyRtlBidi("مرحبا بك");
      expect(assAr).toContain(`Dialogue: 0,0:00:00.00,0:00:02.00,Default,,0,0,0,,${expectedText}`);
      expect(assArEg).toContain(`Dialogue: 0,0:00:00.00,0:00:02.00,Default,,0,0,0,,${expectedText}`);
      expect(assArSa).toContain(`Dialogue: 0,0:00:00.00,0:00:02.00,Default,,0,0,0,,${expectedText}`);
    });

    it("filters out empty or whitespace-only cues", () => {
      const cues: SubtitleCue[] = [
        { start: 0, end: 1, text: "" },
        { start: 1, end: 2, text: "   " },
        { start: 2, end: 3, text: "Valid cue" },
      ];
      const ass = generateAssContent(cues, 1920, 1080);
      const dialogueLines = ass.split("\n").filter((l) => l.startsWith("Dialogue:"));
      expect(dialogueLines).toHaveLength(1);
      expect(dialogueLines[0]).toContain("Valid cue");
    });
  });

  describe("writeAssFile", () => {
    it("writes an ASS file to disk in the destination directory and returns the path", () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvedge-ass-test-"));
      try {
        const cues: SubtitleCue[] = [{ start: 1.0, end: 3.5, text: "Disk write test." }];
        const filePath = writeAssFile(tempDir, cues, 1280, 720, DEFAULT_SUBTITLE_STYLE);

        expect(fs.existsSync(filePath)).toBe(true);
        const content = fs.readFileSync(filePath, "utf8");
        expect(content).toContain("PlayResX: 1280");
        expect(content).toContain("PlayResY: 720");
        expect(content).toContain("Dialogue: 0,0:00:01.00,0:00:03.50,Default,,0,0,0,,Disk write test.");
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("automatically creates parent directories recursively if destination does not exist", () => {
      const tempBase = fs.mkdtempSync(path.join(os.tmpdir(), "marvedge-ass-mkdir-"));
      const nestedDir = path.join(tempBase, "nested", "sub", "dir");
      try {
        const cues: SubtitleCue[] = [{ start: 0, end: 1, text: "Directory test." }];
        const filePath = writeAssFile(nestedDir, cues, 1920, 1080);
        expect(fs.existsSync(filePath)).toBe(true);
        const content = fs.readFileSync(filePath, "utf8");
        expect(content).toContain("Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,Directory test.");
      } finally {
        fs.rmSync(tempBase, { recursive: true, force: true });
      }
    });
  });

  describe("Parity with cloudrun-worker writeAssSubtitles", () => {
    const parityCues: SubtitleCue[] = [
      { start: 0, end: 1.5, text: "Hello" },
      { start: 1.5, end: 3.25, text: "there\nfriend" },
    ];

    it("produces byte-identical ASS documents to cloudrun-worker for unstyled exports", () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ass-parity-unstyled-"));
      try {
        for (const [w, h] of [[1920, 1080], [1080, 1920], [1280, 720]]) {
          const workerPath = worker.writeAssSubtitles(tempDir, parityCues, w, h);
          const workerContent = fs.readFileSync(workerPath, "utf8");
          const libContent = generateAssContent(parityCues, w, h);
          expect(libContent, `${w}x${h} unstyled`).toBe(workerContent);
        }
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("produces byte-identical ASS documents to cloudrun-worker for custom styles and animations", () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ass-parity-styled-"));
      try {
        const styles: SubtitleStyle[] = [
          DEFAULT_SUBTITLE_STYLE,
          { fontFamily: "roboto", color: "#8A76FC", alignment: "top", animation: "fade" },
          { fontFamily: "poppins", color: "#FFFF00", alignment: "bottom", animation: "pop" },
          { fontFamily: "inter", color: "#FFFFFF", alignment: "middle", animation: "slide" },
        ];

        for (const style of styles) {
          const workerPath = worker.writeAssSubtitles(tempDir, parityCues, 1920, 1080, style);
          const workerContent = fs.readFileSync(workerPath, "utf8");
          const libContent = generateAssContent(parityCues, 1920, 1080, style);
          expect(libContent, JSON.stringify(style)).toBe(workerContent);
        }
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("produces byte-identical ASS documents to cloudrun-worker for RTL languages", () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ass-parity-rtl-"));
      try {
        const arabicCues: SubtitleCue[] = [{ start: 0, end: 2, text: "مرحبا بك" }];
        const workerPath = worker.writeAssSubtitles(tempDir, arabicCues, 1920, 1080, null, "ar");
        const workerContent = fs.readFileSync(workerPath, "utf8");
        const libContent = generateAssContent(arabicCues, 1920, 1080, undefined, "ar");
        expect(libContent).toBe(workerContent);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe("End-to-End Pipeline: Whisper Response -> Word Normalization -> SubtitleCue[] -> ASS Generation -> ASS File -> FFmpeg Path", () => {
    it("takes a raw Whisper verbose_json API response, clusters into SubtitleCue[] with words, writes ASS file, and generates valid FFmpeg path", () => {
      const rawWhisperVerboseJson = {
        task: "transcribe",
        language: "english",
        duration: 4.5,
        text: "This is a real end-to-end transcription test. Next sentence follows after pause.",
        words: [
          { word: "This", start: 0.1, end: 0.3 },
          { word: "is", start: 0.35, end: 0.5 },
          { word: "a", start: 0.52, end: 0.6 },
          { word: "real", start: 0.65, end: 0.9 },
          { word: "end-to-end", start: 0.95, end: 1.5 },
          { word: "transcription", start: 1.55, end: 2.2 },
          { word: "test.", start: 2.25, end: 2.8 },
          // 1.2s pause (2.8 -> 4.0) triggers cue boundary
          { word: "Next", start: 4.0, end: 4.2 },
          { word: "sentence", start: 4.25, end: 4.6 },
          { word: "follows", start: 4.65, end: 5.0 },
          { word: "after", start: 5.05, end: 5.3 },
          { word: "pause.", start: 5.35, end: 5.8 },
        ],
        segments: [
          { id: 0, start: 0.1, end: 2.8, text: "This is a real end-to-end transcription test." },
          { id: 1, start: 4.0, end: 5.8, text: "Next sentence follows after pause." },
        ],
      };

      // 1. Normalize full response and cluster into SubtitleCue[]
      const { transcript, cues } = normalizeWhisperResponse(rawWhisperVerboseJson);

      expect(transcript.language).toBe("english");
      expect(transcript.words).toHaveLength(12);
      expect(cues).toHaveLength(2);

      // Cue 1 verification
      expect(cues[0].text).toBe("This is a real end-to-end transcription test.");
      expect(cues[0].start).toBe(0.1);
      expect(cues[0].end).toBe(2.8);
      expect(cues[0].words).toHaveLength(7);

      // Cue 2 verification
      expect(cues[1].text).toBe("Next sentence follows after pause.");
      expect(cues[1].start).toBe(4.0);
      expect(cues[1].end).toBe(5.8);
      expect(cues[1].words).toHaveLength(5);

      // 2. Generate ASS content with custom style and animation
      const customStyle: SubtitleStyle = {
        fontFamily: "inter",
        color: "#00FF00",
        alignment: "bottom",
        animation: "fade",
      };
      const assContent = generateAssContent(cues, 1080, 1920, customStyle);

      // Script Info
      expect(assContent).toContain("[Script Info]");
      expect(assContent).toContain("PlayResX: 1080");
      expect(assContent).toContain("PlayResY: 1920");

      // V4+ Styles
      expect(assContent).toContain("[V4+ Styles]");
      expect(assContent).toContain(toAssStyleLine(customStyle, 1080, 1920));

      // Events
      expect(assContent).toContain("[Events]");
      expect(assContent).toContain(
        "Dialogue: 0,0:00:00.10,0:00:02.80,Default,,0,0,0,,{\\fad(200,200)}This is a real end-to-end transcription test."
      );
      expect(assContent).toContain(
        "Dialogue: 0,0:00:04.00,0:00:05.80,Default,,0,0,0,,{\\fad(200,200)}Next sentence follows after pause."
      );

      // 3. Write ASS file to disk in a temporary directory
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "whisper-ass-e2e-"));
      try {
        const filePath = writeAssFile(tempDir, cues, 1080, 1920, customStyle);
        expect(fs.existsSync(filePath)).toBe(true);

        const readBack = fs.readFileSync(filePath, "utf8");
        expect(readBack).toBe(assContent);

        // 4. Escape file path for FFmpeg filtergraph usage
        const filterPath = escapeFfmpegFilterPath(filePath);
        expect(filterPath).toBeDefined();
        // Path should not have unescaped backslashes
        expect(filterPath).not.toContain("\\subtitles.ass");
        // Windows drive letters must have escaped colons: C\\:
        if (filePath.includes(":")) {
          expect(filterPath).toContain("\\\\:");
        }
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });
});
