# Build notes

## libvips DLLs for sharp (Windows)
After `npm install`, verify these exist in `node_modules/sharp/build/Release/`:
  libvips-42.dll, libglib-2.0-0.dll, libgobject-2.0-0.dll, libvips-cpp.dll
sharp 0.32.6 normally fetches them. If the prebuilt is incomplete, download
`libvips-8.14.5-win32-x64.tar.gz` from github.com/lovell/sharp-libvips (verify the
.integrity sha512) and copy the three lib/*.dll into that Release folder.

## WikiNeural ONNX export (Phase 9)

> **Run on an x64 machine.** PyTorch has no `win-arm64` wheel, so the export below
> cannot run on a Windows-on-ARM host (it was attempted there and `pip install torch`
> failed with "No matching distribution found"). Use an x64 Windows/Linux/macOS box.

1. Create an isolated env and install pinned, ≥7-day-old deps:
   ```
   py -m venv .venv-export
   .venv-export\Scripts\python -m pip install "optimum[onnxruntime]==1.24.0" "transformers==4.46.3" "torch==2.5.1"
   ```
2. Export the model to ONNX (token-classification):
   ```
   .venv-export\Scripts\optimum-cli export onnx \
     --model Babelscape/wikineural-multilingual-ner \
     --task token-classification \
     models/Babelscape/wikineural-multilingual-ner
   ```
3. Quantize to int8 (smaller installer; transformers.js loads `model_quantized.onnx` by default):
   ```
   .venv-export\Scripts\optimum-cli onnxruntime quantize --avx2 \
     --onnx_model models/Babelscape/wikineural-multilingual-ner/onnx \
     -o models/Babelscape/wikineural-multilingual-ner/onnx
   ```
4. Final layout (transformers.js convention):
   ```
   models/Babelscape/wikineural-multilingual-ner/
     config.json  tokenizer.json  tokenizer_config.json  vocab.txt
     onnx/model_quantized.onnx
   ```
5. In `fileProcessor.js` `loadNERModel`/`env.localModelPath`, switch the model id to
   `Babelscape/wikineural-multilingual-ner` (remove the `TODO(Phase 9)` comment).
6. Model artifacts are large (~180 MB int8). Track them with **git-lfs**
   (`git lfs track "models/**/*.onnx"`) or distribute them out-of-band — do NOT commit
   a raw 180 MB blob to normal git history.

   **Alternative (no torch):** a community ONNX port exists at
   `rhnfzl/wikineural-multilingual-ner-onnx`. If used, verify file hashes and that the
   layout matches the transformers.js convention above before trusting it. Treat any
   third-party model as unvetted (apply the ≥7-day supply-chain rule).

## Build the installer (Phase 10)

> Needs Node.js + npm (not present on the dev ARM64 host). Run on a machine with Node LTS.

1. `npm install` (pulls sharp 0.32.6, onnxruntime-node, @pdf-lib/fontkit).
2. Verify the four libvips DLLs are present (see the libvips section above); copy them in if missing.
3. `npx electron-builder --win` to produce the `.exe`.
4. Install the `.exe`, process a Russian PDF end-to-end, confirm ФИО/address/bank/email
   are replaced, the body text is intact, and a `*.mapping.json` is written next to the output.

## Running the engine tests without Node (this repo's dev convention)

There is no standalone `node` on the dev host; tests run under the Electron-bundled Node:
```
$env:ELECTRON_RUN_AS_NODE="1"
& "C:\Users\vetos\AppData\Local\Programs\a5-pii-anonymizer\A5 PII Anonymizer.exe" test\run.mjs
```
Exit 0 with `# fail 0` = green. On a machine with Node installed, `node --test test/` also works.
