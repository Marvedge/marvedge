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
import { cuesFromWhisperWords } from "./whisper";

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

    it("applies RTL bidi markers when language is Arabic", () => {
      const arabicCues: SubtitleCue[] = [{ start: 0, end: 2, text: "مرحبا بك" }];
      const ass = generateAssContent(arabicCues, 1920, 1080, undefined, "ar");

      const expectedText = applyRtlBidi("مرحبا بك");
      expect(ass).toContain(`Dialogue: 0,0:00:00.00,0:00:02.00,Default,,0,0,0,,${expectedText}`);
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
  });

  describe("End-to-End Pipeline: Whisper Word Timestamps -> SubtitleCue -> ASS File", () => {
    it("takes a Whisper word-level fixture, produces normalized cues, and writes a valid ASS file", () => {
      const whisperWords = [
        { word: "This", start: 0.1, end: 0.3 },
        { word: "is", start: 0.35, end: 0.5 },
        { word: "a", start: 0.52, end: 0.6 },
        { word: "test", start: 0.65, end: 0.9 },
        { word: "of", start: 0.95, end: 1.1 },
        { word: "Whisper", start: 1.15, end: 1.6 },
        { word: "transcription.", start: 1.65, end: 2.3 },
      ];

      // 1. Cluster Whisper words into SubtitleCue[]
      const cues = cuesFromWhisperWords(whisperWords);
      expect(cues).toHaveLength(1);
      expect(cues[0].text).toBe("This is a test of Whisper transcription.");
      expect(cues[0].words).toEqual(whisperWords);

      // 2. Generate ASS content with 9:16 portrait dimensions
      const assContent = generateAssContent(cues, 1080, 1920, DEFAULT_SUBTITLE_STYLE);

      expect(assContent).toContain("PlayResX: 1080");
      expect(assContent).toContain("PlayResY: 1920");
      expect(assContent).toContain("Dialogue: 0,0:00:00.10,0:00:02.30,Default,,0,0,0,,This is a test of Whisper transcription.");

      // 3. Write file and verify disk artifact
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "whisper-pipeline-test-"));
      try {
        const filePath = writeAssFile(tempDir, cues, 1080, 1920, DEFAULT_SUBTITLE_STYLE);
        expect(fs.existsSync(filePath)).toBe(true);

        // Verify escaped path for FFmpeg: no raw unescaped colons
        const escaped = escapeFfmpegFilterPath(filePath);
        expect(escaped).toMatch(/^[A-Za-z]\\{2}:/); // Windows drive letter escaped C\\:
        expect(escaped).not.toMatch(/[^\\]:/); // no unescaped colons
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });
});
