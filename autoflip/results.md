# AutoFlip Evaluation — Task-00009

## Test setup

- Docker image: `marvedge-autoflip`
- Target aspect ratio: 9:16
- Input samples: `public/icons/1.mp4`, `public/icons/2.mp4`
- Output resolution: 404×720
- Evaluation criteria:
  - Face/object cut-off
  - Incorrect salient-object selection
  - Crop jitter
  - Excessive/unnecessary crop movement

---

## Test 01 — `1.mp4`

Input: 1280×720
Target: 9:16
Output: 404×720
Result: FAIL
Severity: Medium

### Observations

- AutoFlip successfully produces the 9:16 output.
- Crop remains generally stable with no obvious jitter.
- The portrait crop is strongly biased toward the right side of the source frame.
- Important objects entering from the left/right are frequently excluded from the output.
- Multiple salient objects visible in the source are not consistently retained.

### Failure category

Important object cropped / poor salient-object framing.

### Repro condition

Landscape video containing multiple salient objects distributed horizontally across the frame. When converting to 9:16, AutoFlip favors a narrow region and excludes salient objects outside that region.

---

## Test 02 — `2.mp4`

Input: 1280×720
Target: 9:16
Output: 404×720
Result: FAIL
Severity: Medium

### Observations

- AutoFlip successfully produces the 9:16 output.
- No obvious frame-to-frame jitter observed.
- Initially, the main machine is retained within the crop.
- Around 4.3–5.0s, additional salient objects enter from the right side.
- AutoFlip shifts the crop toward these newly detected objects.
- From approximately 5.0s onward, the primary machine becomes substantially cropped/out of frame.
- Newly appearing objects therefore cause a significant change in crop focus.

### Failure category

Incorrect salient-object prioritization / important object cropped.

### Repro condition

Landscape video containing a primary object and additional salient objects entering from another side of the frame. When the secondary objects appear, AutoFlip shifts the 9:16 crop toward them and loses much of the primary object.

## Additional Evaluation — VCD Sample Videos

### Test 01 — `test_01_landscape.mp4`

**Input:** 1920×1080
**Target:** 9:16
**Result:** PASS

**Observations:**
- Subject remains appropriately framed throughout the clip.
- Face remains fully visible within the crop.
- No noticeable jitter or abrupt crop changes.
- No incorrect subject tracking observed.

---

### Test 02 — `test_02_landscape.mp4`

**Input:** 1920×1080
**Target:** 9:16
**Result:** FAIL
**Severity:** Medium

**Observations:**
- Initial framing substantially clips the subject's face on the right side.
- AutoFlip gradually adjusts the crop after approximately 1–2 seconds.
- Later framing is improved and the face is fully visible.

**Failure category:** Face cut off / crop adaptation lag

**Repro condition:**
- Landscape input where the primary subject begins close to the edge of the frame.
- The initial 9:16 crop does not provide sufficient space around the subject before AutoFlip adapts.

---

### Test 03 — `test_03_blurred_bg.mp4`

**Input:** 1920×1080
**Target:** 9:16
**Result:** PASS

**Observations:**
- Subject remains appropriately framed throughout the clip.
- Face remains inside the crop with sufficient padding.
- No noticeable jitter or unnecessary crop movement.
- No incorrect subject tracking observed.
- Background blur does not appear to negatively affect the crop.

---

### Test 04 — `test_04_portrait.mp4`

**Input:** 1080×1920
**Target:** 9:16
**Result:** FAIL
**Severity:** Medium

**Observations:**
- Initial framing is stable and the subject remains fully visible.
- Around 6.5s, the subject begins moving toward the left side of the frame.
- Between approximately 7.0–7.5s, the face becomes significantly cropped by the left edge.
- AutoFlip recovers the framing around 7.75s and the subject becomes fully visible again.
- No persistent issue is observed after recovery.

**Failure category:** Face cut off / crop adaptation during subject movement

**Repro condition:**
- Portrait input where the primary subject moves laterally toward the edge of the frame.
- Crop temporarily fails to follow the subject, causing the face to leave the target crop before recovering.

---

### Test 05 — `test_05_portrait.mp4`

**Input:** 1080×1920
**Target:** 9:16
**Result:** PASS

**Observations:**
- Subject remains appropriately framed throughout the clip.
- Face remains fully visible with sufficient padding.
- Crop remains stable during subject movement.
- No noticeable jitter or abrupt crop changes.
- No incorrect subject tracking observed.

---

### Test 06 — `test_06_landscape.mp4`

**Input:** 1920×1080
**Target:** 9:16
**Result:** FAIL
**Severity:** Medium

**Observations:**
- Initial framing clips/presses the subject's face against the left edge.
- AutoFlip subsequently adjusts the crop and improves the framing.
- Later framing is more appropriate.

**Failure category:** Face cut off / crop adaptation lag

**Repro condition:**
- Landscape input where the primary subject begins close to the edge of the frame.
- Initial 9:16 crop provides insufficient space around the subject before the crop adapts.

---

### Test 07 — `test_07_landscape.mp4`

**Input:** 1920×1080
**Target:** 9:16
**Result:** PASS

**Observations:**
- Subject remains appropriately framed.
- Face remains fully visible throughout the clip.
- Crop remains stable.
- No noticeable jitter or abrupt crop changes.
- No incorrect subject tracking observed.

---

### Test 08 — `test_08_landscape.mp4`

**Input:** 1920×1080
**Target:** 9:16
**Result:** FAIL
**Severity:** Medium

**Observations:**
- Initial framing substantially crops the subject's face on the left side.
- AutoFlip recovers the framing relatively quickly.
- Later framing adjustments occur as the subject moves.
- No persistent face-cropping issue is observed after recovery.

**Failure category:** Face cut off / crop adaptation lag

**Repro condition:**
- Landscape input where the primary subject begins near the edge of the source frame.
- Initial crop does not provide sufficient space around the subject and requires adaptation.

---

### Test 09 — `test_09_hand_movement.mp4`

**Input:** 608×1080
**Target:** 9:16
**Result:** FAIL
**Severity:** Medium

**Observations:**
- AutoFlip correctly maintains focus on the primary subject despite significant hand movement in the foreground.
- The moving hand does not appear to be incorrectly selected as the primary subject.
- Around 6.0–7.8s, the crop progressively becomes excessively zoomed in.
- The subject's face becomes partially cropped during this period.
- Around 7.8s, the crop pulls back and restores more appropriate framing.

**Failure category:** Excessive zoom / face cut off during subject movement

**Repro condition:**
- Portrait video with a foreground hand moving across/in front of the subject.
- AutoFlip maintains the correct subject but temporarily increases the crop scale enough to cut into the subject's face.

---

### Test 10 — `test_10_landscape.mp4`

**Input:** 1920×1080
**Target:** 9:16
**Result:** PASS

**Observations:**
- Subject remains appropriately framed throughout the clip.
- Face remains fully visible within the crop.
- No noticeable jitter or unnecessary crop movement.
- No incorrect subject tracking observed.

---

### Test 11 — `test_11_portrait.mp4`

**Input:** 1080×1920
**Target:** 9:16
**Result:** PASS

**Observations:**
- Subject remains appropriately framed throughout the clip.
- Face remains fully visible with sufficient padding.
- Crop remains stable despite changes in subject position and lighting.
- No noticeable jitter or abrupt crop changes.
- No incorrect subject tracking observed.