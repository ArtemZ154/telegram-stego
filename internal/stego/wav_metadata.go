package stego

import (
	"bytes"
	"encoding/binary"
	"fmt"
)

type WAVMetadata struct {
	Data []byte
}

func EmbedInWAV(wavData []byte, metadata []byte) ([]byte, error) {
	if len(wavData) < 44 {
		return nil, fmt.Errorf("invalid WAV file: too short")
	}

	if !bytes.Equal(wavData[0:4], []byte("RIFF")) {
		return nil, fmt.Errorf("not a valid WAV file")
	}

	chunkID := []byte("STEK")
	chunkSize := uint32(len(metadata))

	chunkBuf := new(bytes.Buffer)
	chunkBuf.Write(chunkID)
	binary.Write(chunkBuf, binary.LittleEndian, chunkSize)
	chunkBuf.Write(metadata)

	if len(metadata)%2 == 1 {
		chunkBuf.WriteByte(0)
	}

	customChunk := chunkBuf.Bytes()

	newRiffSize := len(wavData) - 8 + len(customChunk)

	result := new(bytes.Buffer)

	result.Write([]byte("RIFF"))
	binary.Write(result, binary.LittleEndian, uint32(newRiffSize))

	result.Write(wavData[8:])

	result.Write(customChunk)

	return result.Bytes(), nil
}
func ExtractFromWAV(wavData []byte) ([]byte, error) {
	if len(wavData) < 12 {
		return nil, fmt.Errorf("invalid WAV file: too short")
	}

	if !bytes.Equal(wavData[0:4], []byte("RIFF")) {
		return nil, fmt.Errorf("not a valid WAV file")
	}

	riffSize := binary.LittleEndian.Uint32(wavData[4:8])

	if !bytes.Equal(wavData[8:12], []byte("WAVE")) {
		return nil, fmt.Errorf("not a valid WAV file: missing WAVE")
	}

	pos := 12
	maxPos := int(8 + riffSize)

	for pos < len(wavData) && pos+8 <= maxPos {
		chunkID := wavData[pos : pos+4]
		pos += 4

		chunkSize := binary.LittleEndian.Uint32(wavData[pos : pos+4])
		pos += 4

		if bytes.Equal(chunkID, []byte("STEK")) {
			if pos+int(chunkSize) > len(wavData) {
				return nil, fmt.Errorf("STEK chunk size exceeds file")
			}

			metadata := make([]byte, chunkSize)
			copy(metadata, wavData[pos:pos+int(chunkSize)])
			return metadata, nil
		}

		padding := 0
		if chunkSize%2 == 1 {
			padding = 1
		}
		pos += int(chunkSize) + padding
	}

	return nil, fmt.Errorf("STEK chunk not found in WAV file")
}
