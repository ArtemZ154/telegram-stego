# Используем официальный образ Go как базовый
FROM golang:1.25-alpine AS builder

# Устанавливаем рабочую директорию
WORKDIR /app

# Устанавливаем необходимые системные пакеты (git нужен для скачивания зависимостей)
RUN apk add --no-cache git make

# Копируем файлы зависимостей
COPY go.mod go.sum ./

# Скачиваем зависимости
RUN go mod download

# Копируем исходный код
COPY . .

# Собираем WASM модуль
# GOOS=js GOARCH=wasm указывает компилятору создать бинарник для браузера
RUN GOOS=js GOARCH=wasm go build -o build/extension/stego.wasm ./cmd/stego_wasm

# Копируем wasm_exec.js (необходимый "мост" между JS и Go) из системной папки Go
RUN cp $(go env GOROOT)/misc/wasm/wasm_exec.js build/extension/wasm_exec.js

# Финальный этап - просто выводим сообщение, что сборка готова
CMD ["echo", "Build complete! Artifacts are in /app/build/extension"]
