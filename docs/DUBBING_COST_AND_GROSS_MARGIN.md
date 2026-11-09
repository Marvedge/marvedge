# Dubbing Cost & Gross Margin — Investor Snapshot

**Basis:** USD; pricing checked 5 Nov 2026. Retail prices are illustrative. In-house figures are modeled estimates, not measured end-to-end production costs.

## Unit economics

For the scale scenario below, monthly volume is **100,000 source-media minutes**. The $9.60/month EBS allocation is therefore $0.000096/min. The original modeled variable-pipeline subtotals are $0.01052/min (base) and $0.01400/min (conservative). These combine measured runtime inputs with assumptions and estimates, not a fully measured end-to-end run. Adding the scale-specific EBS allocation gives **$0.010616/min** and **$0.014096/min**, respectively.

| Option | Cost / media min | 2-min clip COGS | Gross margin at $4.99 | 10-min clip COGS | Gross margin at $19.99 |
|---|---:|---:|---:|---:|---:|
| In-house, base model | $0.010616 | $0.0212 | 99.57% | $0.1062 | 99.47% |
| In-house, conservative model | $0.014096 | $0.0282 | 99.44% | $0.1410 | 99.30% |
| ElevenLabs Dubbing v1, watermarked | $0.33 | $0.66 | 86.77% | $3.30 | 83.49% |
| ElevenLabs Dubbing v1, clean | $0.50 | $1.00 | 79.96% | $5.00 | 74.99% |
| ElevenLabs Dubbing v2 | $2.20 | $4.40 | 11.82% | $22.00 | -10.05% |

**Gross margin formula:** (retail price − modeled COGS) ÷ retail price. Negative margin means COGS exceeds the illustrative retail price.

## Illustrative scale comparison

| Metric | Estimate |
|---|---:|
| Monthly volume | 100,000 media minutes |
| ElevenLabs v1 clean at $0.50/min | $50,000/month |
| In-house base model at $0.010616/min | $1,061.60/month |
| Modeled difference | $48,938.40/month |
| Annualized modeled difference | **$587,260.80/year** |

This annualized comparison assumes the stated rates apply linearly to 1.2 million minutes/year. It is a modeled comparison, not a measured savings result.

## Evidence, assumptions and commercial gates

- **Measured TTS component:** Task-103 generated 999.32 seconds of audio in 380.305 seconds of GPU compute; RTF 0.3806×; peak VRAM 9,837 MiB. At the documented $0.7104/hour EC2 rate, marginal TTS compute is approximately $0.00451 per media minute, excluding cold-start/warmup and EBS.
- **End-to-end status: NOT VERIFIED.** Task-103 lists full 10-minute dubbing cost as undetermined. ASR, translation, lip-sync, reframing, storage handoffs and orchestration were not all exercised together. TalkNet/AutoFlip runtime ratios and API rates are model inputs, not proof of a complete production run.
- **Comparability:** ElevenLabs figures are published managed-dubbing prices; in-house figures are modeled pipeline costs. They are not a like-for-like service comparison. In-house estimates exclude engineering, ongoing operations/support, retries and other unmodeled overheads. Taxes may also apply.
- **Commercial licensing blocker:** Task-103 documents OmniVoice under CC-BY-NC 4.0 and VoiceStudio under AGPL-3.0. Do not use the current model for commercial production until licensing is cleared or the model is replaced with a commercially permitted alternative.
- **Sources:** [ElevenLabs API pricing](https://elevenlabs.io/pricing/api) · [ElevenLabs dubbing API overview](https://elevenlabs.io/blog/ai-dubbing-api) · [OpenAI transcription pricing](https://developers.openai.com/api/docs/pricing) · Internal evidence: `docs/VOICESTUDIO_INTEGRATION.md` on `task/task-00103-voicestudio-integration`.
