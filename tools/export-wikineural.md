# Build notes

## libvips DLLs for sharp (Windows)
After `npm install`, verify these exist in `node_modules/sharp/build/Release/`:
  libvips-42.dll, libglib-2.0-0.dll, libgobject-2.0-0.dll, libvips-cpp.dll
sharp 0.32.6 normally fetches them. If the prebuilt is incomplete, download
`libvips-8.14.5-win32-x64.tar.gz` from github.com/lovell/sharp-libvips (verify the
.integrity sha512) and copy the three lib/*.dll into that Release folder.

## WikiNeural ONNX export — see Phase 9 (added later).
