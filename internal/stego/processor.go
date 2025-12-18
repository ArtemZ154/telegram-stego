package stego

import (
	"bytes"
	"encoding/binary"
	"errors"
	"fmt"
	"telegram-stego/internal/stego/crypto"
)

var (
	MagicBytes = []byte{0xDE, 0xAD, 0xBE, 0xEF}
)

type StegoProcessor struct {
}

func NewStegoProcessor() *StegoProcessor {
	return &StegoProcessor{}
}

func (p *StegoProcessor) SetMethod(method int) {
}

func (p *StegoProcessor) SetSampleRate(rate int) {
}

func (p *StegoProcessor) Encode(message []byte, password string) ([]byte, error) {
	key := make([]byte, 32)
	copy(key, password)

	fmt.Printf("[stego] Encode: message len=%d, password len=%d\n", len(message), len(password))

	encrypted, err := crypto.Encrypt(message, key)
	if err != nil {
		return nil, fmt.Errorf("encryption failed: %w", err)
	}

	fmt.Printf("[stego] Encode: encrypted len=%d\n", len(encrypted))

	finalBuf := new(bytes.Buffer)
	finalBuf.Write(MagicBytes)

	dataLen := uint32(len(encrypted))
	if err := binary.Write(finalBuf, binary.LittleEndian, dataLen); err != nil {
		return nil, err
	}

	finalBuf.Write(encrypted)

	result := finalBuf.Bytes()
	fmt.Printf("[stego] Encode: final metadata len=%d\n", len(result))

	return result, nil
}

func (p *StegoProcessor) Decode(metadata []byte, password string) ([]byte, error) {
	key := make([]byte, 32)
	copy(key, password)

	fmt.Printf("[stego] Decode: metadata len=%d\n", len(metadata))

	if len(metadata) < 8 {
		return nil, errors.New("metadata too short")
	}

	magic := metadata[:4]
	if !bytes.Equal(magic, MagicBytes) {
		return nil, fmt.Errorf("invalid magic bytes: expected %X, got %X", MagicBytes, magic)
	}

	lengthBuf := bytes.NewReader(metadata[4:8])
	var dataLen uint32
	if err := binary.Read(lengthBuf, binary.LittleEndian, &dataLen); err != nil {
		return nil, fmt.Errorf("failed to read length: %w", err)
	}

	fmt.Printf("[stego] Decode: encrypted data length=%d\n", dataLen)

	if len(metadata) < 8+int(dataLen) {
		return nil, fmt.Errorf("metadata corrupted: expected %d bytes, got %d", 8+dataLen, len(metadata))
	}

	encryptedData := metadata[8 : 8+dataLen]

	message, err := crypto.Decrypt(encryptedData, key)
	if err != nil {
		return nil, fmt.Errorf("decryption failed: %w", err)
	}

	fmt.Printf("[stego] Decode: decrypted message len=%d\n", len(message))

	return message, nil
}
