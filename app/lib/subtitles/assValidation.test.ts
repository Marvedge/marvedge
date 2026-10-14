import { execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  DEFAULT_SUBTITLE_STYLE,
  escapeFfmpegFilterPath,
  formatAssKaraokeText,
  generateAssContent,
  normalizeWhisperResponse,
  type SubtitleCue,
  type SubtitleStyle,
} from "./index";
import { writeAssFile } from "./ass.server";
import {
  arabicWhisperResponse,
  realisticWhisperVerboseResponse,
  segmentOnlyWhisperResponse,
} from "./fixtures/whisperSample";
import { isCloudinaryUploadConfigured } from "../cloudinaryUpload";
import ffmpegPath from "ffmpeg-static";

describe("Task-00067: ASS Generation Validation Suite", () => {
  let tempDirs: string[] = [];

  const createTempDir = (prefix = "ass-val-"): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
  };

  beforeAll(() => {
    // Assert FFmpeg and ffprobe are available in the test environment via statically linked binaries
    expect(() => execSync(`"${ffmpegPath}" -version`, { stdio: "ignore" })).not.toThrow();
    expect(() => execSync("ffprobe -version", { stdio: "ignore" })).not.toThrow();
  });

  afterEach(() => {
    // Clean up all temporary test directories and artifacts
    for (const dir of tempDirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // Ignore deletion errors in test cleanup
      }
    }
    tempDirs = [];
  });

  // --------------------------------------------------------------------------
  // Test 1 — Complete Whisper -> ASS Pipeline
  // --------------------------------------------------------------------------
  describe("Test 1: Complete Whisper -> ASS Pipeline", () => {
    it("ingests realistic Whisper verbose_json, clusters into SubtitleCue[], generates ASS, and writes valid file to disk", () => {
      // 1. Ingest and normalize realistic Whisper verbose response
      const { transcript, cues } = normalizeWhisperResponse(realisticWhisperVerboseResponse);

      expect(transcript.language).toBe("english");
      expect(transcript.words.length).toBe(35);
      expect(transcript.segments.length).toBe(4);

      // Verify multiple cues produced (split by pauses > 0.8s and max duration <= 4.2s)
      expect(cues.length).toBe(7);

      // Verify every word is preserved chronologically
      const allWordsInCues = cues.flatMap((c) => c.words || []);
      expect(allWordsInCues.length).toBe(35);

      for (let i = 0; i < allWordsInCues.length - 1; i++) {
        expect(allWordsInCues[i].start).toBeLessThanOrEqual(allWordsInCues[i + 1].start);
        expect(Number.isFinite(allWordsInCues[i].start)).toBe(true);
        expect(Number.isFinite(allWordsInCues[i].end)).toBe(true);
      }

      // Verify words remain within cue boundaries (with small epsilon tolerance)
      for (const cue of cues) {
        expect(cue.words).toBeDefined();
        for (const w of cue.words!) {
          expect(w.start).toBeGreaterThanOrEqual(cue.start - 0.05);
          expect(w.end).toBeLessThanOrEqual(cue.end + 0.05);
        }
      }

      // 2. Generate ASS content with karaoke mode enabled
      const assContent = generateAssContent(cues, 1920, 1080, undefined, null, {
        karaoke: true,
      });

      // Verify Script Info
      expect(assContent).toContain("[Script Info]");
      expect(assContent).toContain("ScriptType: v4.00+");
      expect(assContent).toContain("PlayResX: 1920");
      expect(assContent).toContain("PlayResY: 1080");

      // Verify V4+ Styles
      expect(assContent).toContain("[V4+ Styles]");
      expect(assContent).toContain("Style: Default,Arial,");

      // Verify Events & Dialogue lines
      expect(assContent).toContain("[Events]");
      const dialogueLines = assContent.split("\n").filter((l) => l.startsWith("Dialogue:"));
      expect(dialogueLines.length).toBe(7);

      // Verify karaoke tags and punctuation preservation
      for (const line of dialogueLines) {
        expect(line).toContain("{\\k");
        // Verify curly braces are strictly serializer tags (no raw injection)
        const openBraces = (line.match(/{/g) || []).length;
        const closeBraces = (line.match(/}/g) || []).length;
        expect(openBraces).toBe(closeBraces);
      }

      // 3. Write ASS file to disk in a temporary directory
      const tempDir = createTempDir("whisper-ass-pipe-");
      const assPath = writeAssFile(tempDir, cues, 1920, 1080, undefined, null, "subtitles.ass", {
        karaoke: true,
      });

      expect(fs.existsSync(assPath)).toBe(true);
      const fileStat = fs.statSync(assPath);
      expect(fileStat.size).toBeGreaterThan(0);

      const fileContent = fs.readFileSync(assPath, "utf8");
      expect(fileContent).toBe(assContent);
    });
  });

  // --------------------------------------------------------------------------
  // Test 2 — Verify Karaoke Timing Against Whisper
  // --------------------------------------------------------------------------
  describe("Test 2: Verify Karaoke Timing Against Whisper", () => {
    it("accurately serializes every Whisper word duration and inter-word gap into centiseconds without drift", () => {
      const { cues } = normalizeWhisperResponse(realisticWhisperVerboseResponse);
      const toCs = (sec: number) => Math.max(0, Math.round(sec * 100));

      for (const cue of cues) {
        const formatted = formatAssKaraokeText(cue);
        expect(cue.words).toBeDefined();
        const words = cue.words!;

        // 1. Verify leading silence tag if first word starts after cue start
        const expectedLeadCs = Math.max(0, toCs(words[0].start) - toCs(cue.start));
        if (expectedLeadCs > 0) {
          expect(formatted).toMatch(new RegExp(`^\\{\\\\k${expectedLeadCs}\\}`));
        }

        // 2. Verify each individual word's duration tag
        for (let i = 0; i < words.length; i++) {
          const w = words[i];
          const expectedDurCs = Math.max(0, toCs(w.end) - toCs(w.start));

          // Escaped word token must be prefixed by exact expected duration
          const cleanWord = w.word.trim();
          expect(formatted).toContain(`{\\k${expectedDurCs}}${cleanWord}`);

          // 3. Verify inter-word gap tag on space if there is a gap to next word
          if (i < words.length - 1) {
            const nextW = words[i + 1];
            const expectedGapCs = Math.max(0, toCs(nextW.start) - toCs(w.end));
            if (expectedGapCs > 0) {
              expect(formatted).toContain(`{\\k${expectedGapCs}} `);
            }
          }
        }

        // 4. Verify no cumulative drift:
        // Total duration of tags must cover from firstWord.start to lastWord.end
        const rawTags = formatted.match(/\{\\k\d+\}/g) || [];
        const totalTagCs = rawTags.reduce((sum, tag) => {
          const num = tag.replace(/\D/g, "");
          return sum + Number(num);
        }, 0);

        const expectedTotalCs =
          (expectedLeadCs > 0 ? expectedLeadCs : 0) +
          (toCs(words[words.length - 1].end) - toCs(words[0].start));

        expect(totalTagCs).toBe(expectedTotalCs);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Test 3 — Real FFmpeg Video Rendering
  // --------------------------------------------------------------------------
  describe("Test 3: Real FFmpeg Video Rendering", () => {
    it("burns the generated Whisper karaoke ASS subtitles into an actual MP4 video file using FFmpeg", () => {
      const tempDir = createTempDir("ffmpeg-mp4-val-");
      const { cues } = normalizeWhisperResponse(realisticWhisperVerboseResponse);

      // Write ASS file
      const assPath = writeAssFile(tempDir, cues, 1280, 720, undefined, null, "karaoke.ass", {
        karaoke: true,
      });
      const escapedAssPath = escapeFfmpegFilterPath(assPath);

      const mp4Path = path.join(tempDir, "rendered_output.mp4");

      // Generate a 4-second synthetic test video and burn in subtitles with libass in one pass
      const ffmpegCmd = [
        `"${ffmpegPath}"`,
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=black:s=1280x720:r=25:d=4",
        "-vf",
        `"subtitles=${escapedAssPath}"`,
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        `"${mp4Path}"`,
      ].join(" ");

      let ffmpegOutput = "";
      expect(() => {
        ffmpegOutput = execSync(ffmpegCmd, {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        });
      }).not.toThrow();

      // Assert MP4 exists and is non-empty
      expect(fs.existsSync(mp4Path)).toBe(true);
      const stat = fs.statSync(mp4Path);
      expect(stat.size).toBeGreaterThan(1000); // Realistic valid MP4 container > 1KB

      // Assert video stream properties using ffprobe
      const probeCmd = `ffprobe -v error -show_entries stream=codec_name,width,height,duration,nb_frames -of json "${mp4Path}"`;
      const probeOutput = execSync(probeCmd, { encoding: "utf8" });
      const probeData = JSON.parse(probeOutput);

      expect(probeData.streams).toBeDefined();
      expect(probeData.streams.length).toBeGreaterThanOrEqual(1);

      const videoStream = probeData.streams[0];
      expect(videoStream.codec_name).toBe("h264");
      expect(videoStream.width).toBe(1280);
      expect(videoStream.height).toBe(720);
      expect(Number(videoStream.duration)).toBeCloseTo(4.0, 0.5);
      expect(Number(videoStream.nb_frames)).toBeGreaterThanOrEqual(95); // ~100 frames at 25fps

      // Verify no subtitle/libass parsing errors in output
      expect(ffmpegOutput).not.toMatch(/Error applying option/i);
      expect(ffmpegOutput).not.toMatch(/Unable to parse "original_size"/i);
      expect(ffmpegOutput).not.toMatch(/Invalid argument/i);
    });
  });

  // --------------------------------------------------------------------------
  // Test 4 — Segment-Only Fallback
  // --------------------------------------------------------------------------
  describe("Test 4: Segment-Only Fallback", () => {
    it("handles Whisper responses lacking word-level timestamps gracefully without crash and renders valid ASS", () => {
      const tempDir = createTempDir("segment-only-val-");
      const { cues } = normalizeWhisperResponse(segmentOnlyWhisperResponse);

      expect(cues.length).toBe(2);
      expect(cues[0].words).toBeUndefined();
      expect(cues[1].words).toBeUndefined();

      // Generate ASS with karaoke requested
      const assContent = generateAssContent(cues, 1280, 720, undefined, null, {
        karaoke: true,
      });

      // No \k tags should be generated when words are absent
      expect(assContent).not.toContain("{\\k");
      expect(assContent).toContain("Overview of video reframing technology.");
      expect(assContent).toContain("Automatic subject detection and tracking.");

      // Write ASS and verify FFmpeg renders successfully to MP4
      const assPath = writeAssFile(tempDir, cues, 1280, 720, undefined, null, "segment_fallback.ass", {
        karaoke: true,
      });
      const escapedPath = escapeFfmpegFilterPath(assPath);
      const mp4Path = path.join(tempDir, "fallback.mp4");

      const cmd = `"${ffmpegPath}" -y -f lavfi -i color=c=black:s=1280x720:r=25:d=2 -vf "subtitles=${escapedPath}" -c:v libx264 -pix_fmt yuv420p "${mp4Path}"`;
      expect(() => execSync(cmd, { stdio: "ignore" })).not.toThrow();

      expect(fs.existsSync(mp4Path)).toBe(true);
      expect(fs.statSync(mp4Path).size).toBeGreaterThan(500);
    });
  });

  // --------------------------------------------------------------------------
  // Test 5 — RTL Arabic
  // --------------------------------------------------------------------------
  describe("Test 5: RTL Arabic Pipeline", () => {
    it("handles synthetic Arabic Whisper transcription with directional embedding and renders via FriBidi/HarfBuzz", () => {
      const tempDir = createTempDir("arabic-val-");
      const { cues } = normalizeWhisperResponse(arabicWhisperResponse);

      expect(cues.length).toBe(2);
      expect(cues[0].words).toBeDefined();

      // Generate ASS in Arabic with karaoke mode
      const assContent = generateAssContent(cues, 1280, 720, undefined, "ar", {
        karaoke: true,
      });

      // Directional embedding U+202B and U+202C must be present
      expect(assContent).toContain("\u202B");
      expect(assContent).toContain("\u202C");
      expect(assContent).toContain("{\\k");

      const assPath = writeAssFile(tempDir, cues, 1280, 720, undefined, "ar", "arabic.ass", {
        karaoke: true,
      });
      const escapedPath = escapeFfmpegFilterPath(assPath);
      const mp4Path = path.join(tempDir, "arabic.mp4");

      const cmd = `"${ffmpegPath}" -y -f lavfi -i color=c=black:s=1280x720:r=25:d=2 -vf "subtitles=${escapedPath}" -c:v libx264 -pix_fmt yuv420p "${mp4Path}"`;
      expect(() => execSync(cmd, { stdio: "ignore" })).not.toThrow();

      expect(fs.existsSync(mp4Path)).toBe(true);
      expect(fs.statSync(mp4Path).size).toBeGreaterThan(500);
    });
  });

  // --------------------------------------------------------------------------
  // Test 6 — Styled / Animated Karaoke
  // --------------------------------------------------------------------------
  describe("Test 6: Styled / Animated Karaoke", () => {
    it("renders custom font, color, and fade animations seamlessly combined with karaoke word timing", () => {
      const tempDir = createTempDir("styled-anim-val-");
      const { cues } = normalizeWhisperResponse(realisticWhisperVerboseResponse);

      const customStyle: SubtitleStyle = {
        fontFamily: "roboto",
        color: "#FFFF00",
        alignment: "top",
        animation: "fade",
      };

      const assContent = generateAssContent(cues, 1280, 720, customStyle, null, {
        karaoke: true,
      });

      // Verify custom style line and animation override tag
      expect(assContent).toContain("Style: Default,Roboto,");
      expect(assContent).toContain("{\\fad(200,200)}{\\k");

      const assPath = writeAssFile(tempDir, cues, 1280, 720, customStyle, null, "styled.ass", {
        karaoke: true,
      });
      const escapedPath = escapeFfmpegFilterPath(assPath);
      const mp4Path = path.join(tempDir, "styled.mp4");

      const cmd = `"${ffmpegPath}" -y -f lavfi -i color=c=black:s=1280x720:r=25:d=2 -vf "subtitles=${escapedPath}" -c:v libx264 -pix_fmt yuv420p "${mp4Path}"`;
      expect(() => execSync(cmd, { stdio: "ignore" })).not.toThrow();

      expect(fs.existsSync(mp4Path)).toBe(true);
      expect(fs.statSync(mp4Path).size).toBeGreaterThan(500);
    });
  });

  // --------------------------------------------------------------------------
  // GCP Bypass / Cloudinary Infrastructure Verification
  // --------------------------------------------------------------------------
  describe("GCP Bypass / Cloudinary Infrastructure Verification", () => {
    it("verifies Cloudinary helper is importable and functional without introducing GCP dependencies", () => {
      // Confirm helper is safely callable in test environment
      const configured = isCloudinaryUploadConfigured();
      expect(typeof configured).toBe("boolean");

      // Verify no GCP dependencies or credentials leaked into validation path
      expect(process.env.GOOGLE_APPLICATION_CREDENTIALS).toBeUndefined();
    });
  });
});
