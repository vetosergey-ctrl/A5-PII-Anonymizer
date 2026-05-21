# Multilingual PII Redesign — Design Spec

**Date:** 2026-05-21
**Repo:** github.com/vetosergey-ctrl/A5-PII-Anonymizer (fork)
**Status:** Approved design, pending implementation plan

## Problem

The shipped v0.0.1 anonymizer is unusable for Russian (and any non-Latin) text:

1. **English-only model.** `protectai/lakshyakh93-deberta_finetuned_pii-onnx` mislabels Cyrillic (tags everything `I-IPV6`) and misses real Russian names.
2. **Destructive replacement.** `buildFuzzyRegex` builds a per-character pattern `char[^a-zA-Z0-9]*`. Cyrillic characters are not in `[a-zA-Z0-9]`, so they count as "gaps" and are eaten greedily — a single matched ASCII char (e.g. `7`) consumes and deletes huge spans of Cyrillic. The replacement is also global (`g`) and fuzzy, so it has no respect for entity boundaries.

Observed failure: a Russian PDF came out as `Имя: Иван Петров` (name NOT anonymized) + `Телефон: +IPV6_1NUMBER_1Email: EMAIL_1IPV6_2` (≈1700 chars of surrounding text destroyed).

## Goals

- Correctly anonymize **Russian + English** (other languages best-effort) without destroying content.
- Cover full personal data: **ФИО incl. отчество**, company names, postal addresses (city/street/house), bank requisites, plus email/phone/IP/URL/date/СНИЛС/passport.
- **Stable pseudonyms + reversible JSON mapping** (Pro behaviour).
- Stay **fully offline/local**; model must be ONNX, compatible with `@xenova/transformers`.
- Deliverable: a real fix in the fork, rebuilt installer (not on-disk asar patches).

## Non-Goals

- Perfect recall on rare/low-resource languages.
- Re-architecting the Electron UI or licensing system (beyond a dev Pro override).
- Fine-tuning a new model (we reuse an existing multilingual model + ONNX export).

## Architecture

The anonymization logic moves out of the monolithic `fileProcessor.js` into focused, independently testable modules:

```
src/pii/
  detectors/
    regexDetectors.js   // language-agnostic structured PII -> spans {type,start,end,text}
    nerDetector.js      // transformers.js (WikiNeural ONNX): PER/ORG/LOC -> spans with char offsets
  spanMerge.js          // resolve overlapping spans, sort
  pseudonymizer.js      // (text,type) -> TYPE_N stable; maintains reversible JSON mapping
  anonymizer.js         // orchestrator: detect -> merge -> pseudonymize -> replace-by-offset -> {text, mapping}
fileProcessor.js        // calls anonymizer.anonymize(text); writes outputs (PDF writer as a repo module)
```

Each module has one purpose and a well-defined interface. Detectors are isolated: one throwing must not crash others. Swapping the NER model touches only `nerDetector.js`. `anonymizer.js` is the single component that knows the whole pipeline.

## Entity Taxonomy

**Group A — via NER model (proper nouns in context, RU+EN):**

| Type | Coverage |
|------|----------|
| `NAME` | surname + first name + **patronymic**. WikiNeural PER, strengthened by a patronymic heuristic (suffixes `-ович/-евич/-ич/-овна/-евна/-ична`). |
| `ORG` | company names. NER ORG **+** legal-form markers (`ООО, ОАО, ЗАО, ПАО, АО, ИП, LLC, Ltd, Inc, GmbH`); span extended over form + quoted name. |
| `LOCATION` | cities, streets, regions. NER LOC. |

**Group B — deterministic (regex + validator, language-agnostic, exact boundaries):**

| Type | Detail |
|------|--------|
| `ADDRESS` | markers `г./город, ул./улица, пр-т, пер., д./дом, корп./стр., кв., 6-digit index`; captures the whole address span; merges with adjacent NER `LOCATION`. |
| `BANK` | settlement account (20 digits), corr. account (20), **БИК** (9), **КПП** (9), **ИНН** (10/12 with check digits), SWIFT/BIC, **IBAN**, card (**Luhn**). |
| structured (other) | `EMAIL`, `PHONE` (intl + RU), `СНИЛС` (check digit), RU passport, `IP` v4/v6, `URL`, `DATE`. |

Conflicts between A and B are resolved in `spanMerge` (B/structured > A/NER on overlap; longer wins; nested dropped). Example: `г. Москва, ул. Тверская, д. 7` — NER yields `LOCATION:Москва/Тверская`, the `ADDRESS` detector covers the whole span with markers + house number; `spanMerge` keeps the single `ADDRESS`.

## Data Flow & Replacement Algorithm (core fix)

```
text
 ├─ regexDetectors.detect(text)  -> [{type,start,end,text}]   (absolute offsets)
 └─ nerDetector.detect(text)     -> [{type,start,end,text}]   (absolute offsets)
        -> spanMerge.resolve(spans)
             • sort by start
             • on overlap: structured(regex) > NER; equal -> longer; nested/dup -> drop
        -> pseudonymizer: key = (normalize(text), type) -> TYPE_N (stable); mapping["TYPE_N"]=original
        -> replace-by-offset: spans sorted by start DESC (right-to-left):
             out = out.slice(0,start) + pseudonym + out.slice(end)
        -> { text: anonymized, mapping }
```

**Why this fixes the bug:** replacement is by exact `[start,end)` indices, processed right-to-left so earlier offsets never shift. No global/fuzzy regex, no `[^a-zA-Z0-9]*` swallowing Cyrillic. Each span is replaced exactly once, exactly within its bounds.

**NER offsets (the original root cause).** The old model returned `start/end = null`, which is why the authors fell back to fuzzy matching. WikiNeural is `bert-base-multilingual-cased` (wordpiece); transformers.js usually returns offsets. `nerDetector.js`:
- aggregates subwords (`B-/I-`, `##`) into whole entities;
- if offsets come back `null`, reconstructs them by aligning tokens to the source text (case/whitespace aware);
- maps WikiNeural labels (PER/ORG/LOC/MISC) -> our types (NAME/ORG/LOCATION).
A dedicated unit test covers offset reconstruction on Cyrillic (the regression that started this).

## Model & Build

**Model + ONNX export (one-time):**
- `Babelscape/wikineural-multilingual-ner` (`bert-base-multilingual-cased`, ~178M params; covers ru, en, de, es, fr, it, nl, pl, pt).
- Export: `optimum-cli export onnx --model Babelscape/wikineural-multilingual-ner --task token-classification ./out`, then quantize to `model_quantized.onnx`.
- Size: fp32 ≈ 700 MB, int8 ≈ 180 MB. **Ship quantized** (transformers.js loads `model_quantized.onnx` by default) — smaller than the old 555 MB. fp32 optional.
- Repo layout (transformers.js convention): `models/Babelscape/wikineural-multilingual-ner/{config.json, tokenizer.json, tokenizer_config.json, vocab.txt, onnx/model_quantized.onnx}`.
- `fileProcessor.js`: change model id, keep `env.allowRemoteModels=false` (offline).

**Toolchain (not currently installed — a setup step):**
- Node.js + npm + electron-builder — build the `.exe`.
- Python + `optimum[onnxruntime]` — one-time ONNX export.
- Per the user's supply-chain rule: install only releases ≥7 days old; pin versions.

**Legalize the on-disk patches in source:**
- `sharp`/libvips: add the missing DLLs via electron-builder config (`extraResources`/`asarUnpack`) so the upstream bug does not reappear in the built installer.
- PDF branch: `@pdf-lib/fontkit` as an npm dependency, the DejaVu (Cyrillic) font as an asset, `pdfwriter` as a repo module (word-wrap + pagination). This replaces the hand-patched `resources\patch\` files.

**Modes (dev):**
- **PRO forced ON during development & testing:** daily 100-doc limit removed; reversible JSON mapping always written (needed by the golden reversibility test).
- Implemented as a single explicit override `const DEV_FORCE_PRO = true` (or env `A5_FORCE_PRO=1`) with a visible `// TODO: revert before release` comment. Does not alter normal licensing logic — it just overrides it in dev builds. **Reset for production builds.**

## Error Handling

- NER model fails to load / throws -> degrade to **regex-only** with a warning (structured PII is still removed); text is never mangled.
- Detectors are isolated; an exception in one is logged and does not stop the others.
- Failed validators (ИНН/card checksums) -> the span is not treated as PII (fewer false positives).
- PDF: missing glyph -> `.notdef` box, no crash.
- Daily limit / Pro mapping behaviour preserved (subject to the dev override above).

## Testing

Core (detectors / merge / replace) is tested **without the model** on plain Node; the heavy NER path is separate, behind a flag.

**Unit tests (per module, `test/`, node:test, offline):**
- `regexDetectors` — positive/negative per type; **validators**: Luhn (card), ИНН/СНИЛС check digits, БИК/КПП lengths, IBAN; edge cases (intl vs RU phone, dates).
- `spanMerge` — priority structured > NER, "longer wins", nested removal, adjacent-span joins.
- `pseudonymizer` — same entity -> same pseudonym; different -> different; **reversibility**: applying the inverse mapping restores the original 1:1.
- `replace-by-offset` — many spans, right-to-left, no offset drift.
- `nerDetector` — offset reconstruction on **Cyrillic**, subword aggregation (`B-/I-/##`), **patronymic** capture. The model is **mocked** with fixed predictions (fast, no 180 MB).

**Golden / integration test (primary):**
- The exact Russian sample that broke: `Имя: Иван Петров / Телефон: +7… / Email… / Город: Москва, ул. Тверская, д. 7` + a repeated long paragraph. Assert:
  - ФИО, phone, email, address replaced with pseudonyms;
  - surrounding text **intact** (no loss, unlike `IPV6_2`);
  - mapping is reversible;
  - output length comparable to input (anti-collapse regression guard).

**Real model** — separate test behind `RUN_MODEL_TESTS=1`; loads WikiNeural via Electron-as-node, runs RU+EN samples, checks ФИО/city/company are detected. Excluded from the default `npm test`.

## Success Criteria

1. A Russian document is anonymized without text corruption; ФИО (with patronymic), address, company, bank requisites, email/phone are hidden.
2. English is no worse than today.
3. The recovery mapping is valid (Pro).
4. `npm test` is green offline; the `.exe` build is reproducible.

## Open Questions / Risks

- WikiNeural quantized accuracy on Russian names must be validated against fp32 during implementation; if int8 degrades RU recall noticeably, ship fp32 or a higher-bit quant.
- transformers.js offset support for this exact tokenizer must be confirmed early; the offset-reconstruction fallback de-risks this.
- Installer size with the bundled model (~180 MB quantized) — acceptable, smaller than current.
