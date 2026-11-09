import { getSplitScreenDecision } from "./dualSpeakerSplitScreen";

const tests = [
  {
    name: "1280px - speakers closer than threshold",
    frameWidth: 1280,
    speaker1: { x: 300 },
    speaker2: { x: 700 },
    expected: false,
  },
  {
    name: "1280px - speakers exactly at threshold",
    frameWidth: 1280,
    speaker1: { x: 300 },
    speaker2: { x: 748 },
    expected: false,
  },
  {
    name: "1280px - speakers beyond threshold",
    frameWidth: 1280,
    speaker1: { x: 300 },
    speaker2: { x: 800 },
    expected: true,
  },
  {
    name: "1920px - speakers far apart",
    frameWidth: 1920,
    speaker1: { x: 300 },
    speaker2: { x: 1100 },
    expected: true,
  },
  {
    name: "1920px - speakers close together",
    frameWidth: 1920,
    speaker1: { x: 700 },
    speaker2: { x: 1100 },
    expected: false,
  },
];

let failed = 0;

for (const test of tests) {
  const decision = getSplitScreenDecision(
    test.speaker1,
    test.speaker2,
    test.frameWidth
  );

  const passed =
    decision.splitScreen === test.expected &&
    decision.horizontalDistance ===
      Math.abs(test.speaker1.x - test.speaker2.x) &&
    decision.threshold === 0.35 * test.frameWidth;

  console.log(`${test.name}: ${passed ? "PASS" : "FAIL"}`);
  console.log(
    `  distance=${decision.horizontalDistance}, threshold=${decision.threshold}`
  );

  if (!passed) {
    failed++;
  }
}

if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
}

console.log(`\nAll ${tests.length} tests passed.`);