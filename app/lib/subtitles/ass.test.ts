import { createRequire } from "module";
import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  applyRtlBidi,
  escapeAssText,
  escapeFfmpegFilterPath,
  formatAssKaraokeText,
  formatAssTime,
  generateAssContent,
} from "./ass";
import { writeAssFile } from "./ass.server";
import { DEFAULT_SUBTITLE_STYLE, toAssOverrideTags, toAssStyleLine } from "./style";
import type { SubtitleCue, SubtitleStyle } from "./types";
import { cuesFromWhisperWords, normalizeWhisperResponse } from "./whisper";
import ffmpegPath from "ffmpeg-static";

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

    it("integrates Whisper words -> formatAssKaraokeText -> generateAssContent with karaoke mode enabled", () => {
      const rawWhisperVerboseJson = {
        task: "transcribe",
        language: "english",
        duration: 3.0,
        text: "Testing karaoke generation from Whisper.",
        words: [
          { word: "Testing", start: 0.1, end: 0.5 },
          { word: "karaoke", start: 0.55, end: 1.0 },
          { word: "generation", start: 1.05, end: 1.6 },
          { word: "from", start: 1.65, end: 1.9 },
          { word: "Whisper.", start: 1.95, end: 2.5 },
        ],
        segments: [
          { id: 0, start: 0.1, end: 2.5, text: "Testing karaoke generation from Whisper." },
        ],
      };

      const { cues } = normalizeWhisperResponse(rawWhisperVerboseJson);
      expect(cues).toHaveLength(1);
      expect(cues[0].words).toHaveLength(5);

      // Verify formatAssKaraokeText directly
      const formatted = formatAssKaraokeText(cues[0]);
      // cue.start is 0.1s (10cs). Testing is 0.1 -> 0.5 (40cs).
      // Lead is 0cs relative to cue.start.
      // Gap to karaoke is 5cs (0.50 -> 0.55).
      expect(formatted).toBe(
        "{\\k40}Testing{\\k5} {\\k45}karaoke{\\k5} {\\k55}generation{\\k5} {\\k25}from{\\k5} {\\k55}Whisper."
      );

      // Verify generateAssContent with karaoke option
      const ass = generateAssContent(cues, 1920, 1080, undefined, null, { karaoke: true });
      expect(ass).toContain(
        `Dialogue: 0,0:00:00.10,0:00:02.50,Default,,0,0,0,,${formatted}`
      );
    });
  });

  describe("formatAssKaraokeText (Task-00066)", () => {
    describe("Basic word formatting & timing", () => {
      it("formats a single word with exact centiseconds", () => {
        const cue: SubtitleCue = {
          start: 0,
          end: 1,
          text: "Hello",
          words: [{ word: "Hello", start: 0, end: 0.45 }],
        };
        expect(formatAssKaraokeText(cue)).toBe("{\\k45}Hello");
      });

      it("formats multiple words with preserved spaces and punctuation", () => {
        const cue: SubtitleCue = {
          start: 0,
          end: 2,
          text: "Hello, world!",
          words: [
            { word: "Hello,", start: 0, end: 0.45 },
            { word: "world!", start: 0.5, end: 1.2 },
          ],
        };
        // 0.45s to 0.50s is a 5cs pause on space
        expect(formatAssKaraokeText(cue)).toBe("{\\k45}Hello,{\\k5} {\\k70}world!");
      });

      it("handles contiguous words without gaps", () => {
        const cue: SubtitleCue = {
          start: 0,
          end: 2,
          text: "Quick fox",
          words: [
            { word: "Quick", start: 0, end: 0.5 },
            { word: "fox", start: 0.5, end: 1.0 },
          ],
        };
        expect(formatAssKaraokeText(cue)).toBe("{\\k50}Quick {\\k50}fox");
      });
    });

    describe("Gaps and timing semantics", () => {
      it("emits leading silence tag when first word starts after cue start", () => {
        const cue: SubtitleCue = {
          start: 0,
          end: 2,
          text: "Hello",
          words: [{ word: "Hello", start: 0.35, end: 0.8 }],
        };
        // 35cs leading silence before word of 45cs duration
        expect(formatAssKaraokeText(cue)).toBe("{\\k35}{\\k45}Hello");
      });

      it("handles speech pause gap between words", () => {
        const cue: SubtitleCue = {
          start: 1.0,
          end: 4.0,
          text: "wordA wordB",
          words: [
            { word: "wordA", start: 1.0, end: 1.4 },
            { word: "wordB", start: 1.8, end: 2.2 },
          ],
        };
        // wordA: 40cs; gap: 40cs; wordB: 40cs
        expect(formatAssKaraokeText(cue)).toBe("{\\k40}wordA{\\k40} {\\k40}wordB");
      });

      it("handles trailing silence without emitting unneeded trailing tag", () => {
        const cue: SubtitleCue = {
          start: 0,
          end: 5.0,
          text: "Done",
          words: [{ word: "Done", start: 0, end: 1.0 }],
        };
        expect(formatAssKaraokeText(cue)).toBe("{\\k100}Done");
      });

      it("performs deterministic centisecond rounding for fractional seconds", () => {
        // Values from audit: 0.001 -> 0cs, 0.004 -> 0cs, 0.005 -> 1cs, 0.009 -> 1cs, 0.010 -> 1cs
        const cue: SubtitleCue = {
          start: 0,
          end: 1,
          text: "a b c d e",
          words: [
            { word: "a", start: 0, end: 0.001 },
            { word: "b", start: 0.1, end: 0.104 },
            { word: "c", start: 0.2, end: 0.205 },
            { word: "d", start: 0.3, end: 0.309 },
            { word: "e", start: 0.4, end: 0.41 },
          ],
        };
        const text = formatAssKaraokeText(cue);
        expect(text).toContain("{\\k0}a");
        expect(text).toContain("{\\k0}b");
        expect(text).toContain("{\\k1}c");
        expect(text).toContain("{\\k1}d");
        expect(text).toContain("{\\k1}e");
      });

      it("handles zero duration words safely", () => {
        const cue: SubtitleCue = {
          start: 0,
          end: 1,
          text: "Flash",
          words: [{ word: "Flash", start: 0.5, end: 0.504 }],
        };
        expect(formatAssKaraokeText(cue)).toBe("{\\k50}{\\k0}Flash");
      });
    });

    describe("Sanitization, invalid input, and security", () => {
      it("filters out invalid timestamps (NaN, Infinity, negative, end <= start)", () => {
        const cue: SubtitleCue = {
          start: 0,
          end: 3,
          text: "valid invalid1 invalid2 invalid3 valid2",
          words: [
            { word: "valid", start: 0, end: 0.5 },
            { word: "invalid1", start: Number.NaN, end: 1.0 },
            { word: "invalid2", start: 0.6, end: Infinity },
            { word: "invalid3", start: 1.0, end: 0.8 },
            { word: "invalid4", start: -1, end: 0.5 },
            { word: "valid2", start: 1.0, end: 1.5 },
          ],
        };
        const text = formatAssKaraokeText(cue);
        expect(text).toBe("{\\k50}valid{\\k50} {\\k50}valid2");
      });

      it("filters out empty or whitespace-only words", () => {
        const cue: SubtitleCue = {
          start: 0,
          end: 2,
          text: "word",
          words: [
            { word: "", start: 0, end: 0.5 },
            { word: "   ", start: 0.5, end: 0.8 },
            { word: "word", start: 0.8, end: 1.2 },
          ],
        };
        expect(formatAssKaraokeText(cue)).toBe("{\\k80}{\\k40}word");
      });

      it("escapes curly braces to prevent override tag injection", () => {
        const cue: SubtitleCue = {
          start: 0,
          end: 1,
          text: "{b1}malicious{/b}",
          words: [{ word: "{\\b1}malicious{/b}", start: 0, end: 0.5 }],
        };
        const text = formatAssKaraokeText(cue);
        expect(text).toBe("{\\k50}(\\b1)malicious(/b)");
        // Must contain only one ASS tag: the \k tag
        expect(text.match(/{/g)).toHaveLength(1);
        expect(text.match(/}/g)).toHaveLength(1);
      });

      it("falls back to plain escaped text when cue.words is absent or empty", () => {
        const cueWithoutWords: SubtitleCue = {
          start: 0,
          end: 2,
          text: "Standard subtitle text without words.",
        };
        expect(formatAssKaraokeText(cueWithoutWords)).toBe(
          "Standard subtitle text without words."
        );

        const cueEmptyWords: SubtitleCue = {
          start: 0,
          end: 2,
          text: "Empty words array.",
          words: [],
        };
        expect(formatAssKaraokeText(cueEmptyWords)).toBe("Empty words array.");
      });

      it("falls back to plain escaped text when all words are invalid", () => {
        const cueAllInvalid: SubtitleCue = {
          start: 0,
          end: 2,
          text: "All invalid words.",
          words: [{ word: "", start: 0, end: 1 }],
        };
        expect(formatAssKaraokeText(cueAllInvalid)).toBe("All invalid words.");
      });
    });

    describe("Multiline cues and RTL support", () => {
      it("preserves newlines as \\N between words", () => {
        const cue: SubtitleCue = {
          start: 0,
          end: 3,
          text: "Line 1\nLine 2",
          words: [
            { word: "Line", start: 0, end: 0.3 },
            { word: "1", start: 0.35, end: 0.5 },
            { word: "Line", start: 1.0, end: 1.3 },
            { word: "2", start: 1.35, end: 1.5 },
          ],
        };
        const text = formatAssKaraokeText(cue);
        expect(text).toContain("\\N{\\k50}");
        expect(text).toBe("{\\k30}Line{\\k5} {\\k15}1\\N{\\k50}{\\k30}Line{\\k5} {\\k15}2");
      });

      it("supports RTL Arabic text with directional embedding", () => {
        const cue: SubtitleCue = {
          start: 0,
          end: 2,
          text: "مرحبا بك",
          words: [
            { word: "مرحبا", start: 0, end: 0.8 },
            { word: "بك", start: 1.0, end: 1.6 },
          ],
        };
        const textAr = formatAssKaraokeText(cue, "ar");
        const textArEg = formatAssKaraokeText(cue, "ar-EG");
        const textBool = formatAssKaraokeText(cue, true);

        const expected = applyRtlBidi("{\\k80}مرحبا{\\k20} {\\k60}بك");
        expect(textAr).toBe(expected);
        expect(textArEg).toBe(expected);
        expect(textBool).toBe(expected);
      });
    });
  });

  describe("generateAssContent with karaoke mode", () => {
    const cuesWithWords: SubtitleCue[] = [
      {
        start: 0.5,
        end: 2.0,
        text: "Hello world",
        words: [
          { word: "Hello", start: 0.5, end: 0.9 },
          { word: "world", start: 1.0, end: 1.8 },
        ],
      },
      {
        start: 2.5,
        end: 4.5,
        text: "Fallback cue without words",
      },
    ];

    it("generates standard non-karaoke ASS by default (backward compatible)", () => {
      const assDefault = generateAssContent(cuesWithWords, 1920, 1080);
      const assExplicitFalse = generateAssContent(cuesWithWords, 1920, 1080, undefined, null, {
        karaoke: false,
      });

      expect(assDefault).not.toContain("{\\k");
      expect(assDefault).toContain("Dialogue: 0,0:00:00.50,0:00:02.00,Default,,0,0,0,,Hello world");
      expect(assExplicitFalse).toBe(assDefault);
    });

    it("emits karaoke override tags when karaoke is enabled", () => {
      const ass = generateAssContent(cuesWithWords, 1920, 1080, undefined, null, {
        karaoke: true,
      });

      expect(ass).toContain(
        "Dialogue: 0,0:00:00.50,0:00:02.00,Default,,0,0,0,,{\\k40}Hello{\\k10} {\\k80}world"
      );
      // Fallback cue without words renders as normal text
      expect(ass).toContain(
        "Dialogue: 0,0:00:02.50,0:00:04.50,Default,,0,0,0,,Fallback cue without words"
      );
    });

    it("coexists with custom style animation override tags", () => {
      const customStyle: SubtitleStyle = {
        fontFamily: "inter",
        color: "#FFFFFF",
        animation: "fade",
      };
      const ass = generateAssContent(cuesWithWords, 1920, 1080, customStyle, null, {
        karaoke: true,
      });

      expect(ass).toContain(
        "Dialogue: 0,0:00:00.50,0:00:02.00,Default,,0,0,0,,{\\fad(200,200)}{\\k40}Hello{\\k10} {\\k80}world"
      );
    });
  });

  describe("FFmpeg libass Rendering Validation", () => {
    it("renders generated ASS karaoke subtitles cleanly via FFmpeg with libass", () => {
      const { execSync } = require_("child_process") as typeof import("child_process");
      let ffmpegAvailable = false;
      try {
        execSync(`"${ffmpegPath}" -version`, { stdio: "ignore" });
        ffmpegAvailable = true;
      } catch {
        ffmpegAvailable = false;
      }

      if (!ffmpegAvailable) {
        return;
      }

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ffmpeg-karaoke-test-"));
      try {
        const cues: SubtitleCue[] = [
          {
            start: 0,
            end: 2,
            text: "Karaoke test rendering",
            words: [
              { word: "Karaoke", start: 0, end: 0.5 },
              { word: "test", start: 0.6, end: 1.0 },
              { word: "rendering", start: 1.1, end: 1.8 },
            ],
          },
        ];

        const assPath = path.join(tempDir, "karaoke.ass");
        fs.writeFileSync(
          assPath,
          generateAssContent(cues, 1920, 1080, undefined, null, { karaoke: true }),
          "utf8"
        );
        const escapedPath = escapeFfmpegFilterPath(assPath);

        const cmd = `"${ffmpegPath}" -y -f lavfi -i color=c=black:s=1920x1080:d=1 -vf "subtitles=${escapedPath}" -frames:v 1 -f null -`;
        expect(() => execSync(cmd, { stdio: "pipe" })).not.toThrow();
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });
});
