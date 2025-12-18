# Расширение Telegram Stego 

Загрузите распакованное расширение из этой папки после пересборки `stego.wasm`:

1. В корне репозитория: `GOOS=js GOARCH=wasm go build -o ./build/stego.wasm ./cmd/stego_wasm && cp /usr/local/go/lib/wasm/wasm_exec.js ./build/wasm_exec.js && mkdir -p build/extension && cp build/stego.wasm build/wasm_exec.js build/extension/`.
2. В Chrome/Brave: `chrome://extensions` → Режим разработчика → Загрузить распакованное → выберите `build/extension`.
3. Откройте https://web.telegram.org/ и следите за консолью DevTools на наличие `[stego-ext] wasm ready`.

Особенности:
- Предлагает закодировать стего при загрузке аудиофайла (file inputs).
- Предлагает закодировать стего в голосовых сообщениях (пути MediaRecorder или recorder.js).
- Сетевые хуки на fetch/XMLHttpRequest для аудио-блобов/FormData.
- Добавляет кнопку "Расшифровать" рядом с аудио-тегами для декодирования с введенным паролем.
