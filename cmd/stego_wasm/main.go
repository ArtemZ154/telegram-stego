package main

import (
	"bytes"
	"errors"
	"fmt"
	"math"
	"syscall/js"

	"github.com/go-audio/audio"
	"github.com/go-audio/wav"

	"telegram-stego/internal/stego"
)

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// seekBuffer implements an in-memory io.WriteSeeker for wav.Encoder (bytes.Buffer lacks Seek).
type seekBuffer struct {
	buf []byte
	off int
}

func (s *seekBuffer) Write(p []byte) (int, error) {
	if s.off > len(s.buf) {
		pad := make([]byte, s.off-len(s.buf))
		s.buf = append(s.buf, pad...)
	}
	if s.off+len(p) > len(s.buf) {
		s.buf = append(s.buf, make([]byte, s.off+len(p)-len(s.buf))...)
	}
	n := copy(s.buf[s.off:], p)
	s.off += n
	return n, nil
}

func (s *seekBuffer) Seek(offset int64, whence int) (int64, error) {
	var newOff int
	switch whence {
	case 0:
		newOff = int(offset)
	case 1:
		newOff = s.off + int(offset)
	case 2:
		newOff = len(s.buf) + int(offset)
	default:
		return 0, errors.New("invalid whence")
	}
	if newOff < 0 {
		return 0, errors.New("negative seek")
	}
	s.off = newOff
	return int64(newOff), nil
}

func (s *seekBuffer) Bytes() []byte { return s.buf }

// decodeWAV reads a mono WAV (16-bit preferred) and returns normalized PCM and sample rate.
func decodeWAV(data []byte) ([]float64, int, error) {
	dec := wav.NewDecoder(bytes.NewReader(data))
	if !dec.IsValidFile() {
		return nil, 0, errors.New("invalid wav file")
	}

	buf, err := dec.FullPCMBuffer()
	if err != nil {
		return nil, 0, fmt.Errorf("decode wav: %w", err)
	}

	sr := dec.SampleRate
	if sr == 0 {
		sr = 44100
	}

	pcm := make([]float64, len(buf.Data))
	maxVal := math.Pow(2, float64(buf.SourceBitDepth-1))
	if maxVal == 0 {
		maxVal = 32768
	}

	for i, v := range buf.Data {
		pcm[i] = float64(v) / maxVal
	}

	return pcm, int(sr), nil
}

// encodeWAV encodes normalized PCM to 16-bit mono WAV using given sample rate.
func encodeWAV(pcm []float64, sampleRate int) ([]byte, error) {
	if sampleRate == 0 {
		sampleRate = 44100
	}

	intData := make([]int, len(pcm))
	for i, v := range pcm {
		if v > 1 {
			v = 1
		}
		if v < -1 {
			v = -1
		}
		intData[i] = int(v * 32767)
	}

	fmt.Printf("[stego-wasm] encodeWAV: intData len=%d, expected WAV size=%d\n",
		len(intData), 44+len(intData)*2)

	buf := &audio.IntBuffer{
		Format:         &audio.Format{SampleRate: sampleRate, NumChannels: 1},
		Data:           intData,
		SourceBitDepth: 16,
	}

	out := &seekBuffer{}
	enc := wav.NewEncoder(out, sampleRate, 16, 1, 1)
	if err := enc.Write(buf); err != nil {
		return nil, fmt.Errorf("encode wav: %w", err)
	}
	if err := enc.Close(); err != nil {
		return nil, fmt.Errorf("encode wav close: %w", err)
	}

	result := append([]byte(nil), out.Bytes()...)
	fmt.Printf("[stego-wasm] encodeWAV: actual WAV size=%d\n", len(result))

	return result, nil
}

func stegoEncode(this js.Value, args []js.Value) any {
	if len(args) < 3 {
		return map[string]any{"error": "need (string message, string password, Uint8Array audioData)"}
	}

	msgStr := args[0].String()
	pass := args[1].String()
	audioDataJS := args[2]

	// Copy audio data
	audioData := make([]byte, audioDataJS.Length())
	js.CopyBytesToGo(audioData, audioDataJS)

	fmt.Printf("[stego-wasm] ===== ENCODE START (METADATA) =====\n")
	fmt.Printf("[stego-wasm] Encode: message='%s' (len=%d), password len=%d, audio size=%d\n",
		msgStr, len(msgStr), len(pass), len(audioData))

	proc := stego.NewStegoProcessor()

	metadata, err := proc.Encode([]byte(msgStr), pass)
	if err != nil {
		return map[string]any{"error": err.Error()}
	}

	fmt.Printf("[stego-wasm] Encode: metadata size=%d bytes\n", len(metadata))

	jsOut := js.Global().Get("Uint8Array").New(len(metadata))
	js.CopyBytesToJS(jsOut, metadata)
	return jsOut
}

func stegoDecode(this js.Value, args []js.Value) any {
	if len(args) < 2 {
		return map[string]any{"error": "need (Uint8Array metadata, string password)"}
	}

	metadataJS := args[0]
	pass := args[1].String()

	metadata := make([]byte, metadataJS.Length())
	js.CopyBytesToGo(metadata, metadataJS)

	fmt.Printf("[stego-wasm] ===== DECODE START (METADATA) =====\n")
	fmt.Printf("[stego-wasm] Decode: metadata size=%d bytes, password len=%d\n", len(metadata), len(pass))

	proc := stego.NewStegoProcessor()

	msg, err := proc.Decode(metadata, pass)
	if err != nil {
		fmt.Printf("[stego-wasm] Decode: FAILED: %v\n", err)
		return map[string]any{"error": err.Error()}
	}

	fmt.Printf("[stego-wasm] Decode: SUCCESS, message='%s' (len=%d)\n", string(msg), len(msg))
	return string(msg)
}

func main() {
	js.Global().Set("stegoEncode", js.FuncOf(stegoEncode))
	js.Global().Set("stegoDecode", js.FuncOf(stegoDecode))
	select {}
}
