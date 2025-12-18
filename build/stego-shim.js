// Minimal JS shim to load Go WASM (stego.wasm) and provide helpers for WAV conversion.
// No Python usage; serve files via any static server (e.g., npx http-server).

async function loadScriptOnce(src) {
  if (document.querySelector(`script[src="${src}"]`)) return;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

function audioBufferToWav(ab) {
  const numChannels = 1;
  const sampleRate = ab.sampleRate;
  const channelData = ab.getChannelData(0);
  const buffer = new ArrayBuffer(44 + channelData.length * 2);
  const view = new DataView(buffer);

  function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i += 1) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  let offset = 0;
  writeString(view, offset, 'RIFF'); offset += 4;
  view.setUint32(offset, 36 + channelData.length * 2, true); offset += 4;
  writeString(view, offset, 'WAVE'); offset += 4;
  writeString(view, offset, 'fmt '); offset += 4;
  view.setUint32(offset, 16, true); offset += 4; // PCM chunk size
  view.setUint16(offset, 1, true); offset += 2;   // PCM format
  view.setUint16(offset, numChannels, true); offset += 2;
  view.setUint32(offset, sampleRate, true); offset += 4;
  view.setUint32(offset, sampleRate * numChannels * 2, true); offset += 4;
  view.setUint16(offset, numChannels * 2, true); offset += 2;
  view.setUint16(offset, 16, true); offset += 2; // bits per sample
  writeString(view, offset, 'data'); offset += 4;
  view.setUint32(offset, channelData.length * 2, true); offset += 4;

  for (let i = 0; i < channelData.length; i += 1) {
    const s = Math.max(-1, Math.min(1, channelData[i]));
    view.setInt16(offset + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buffer);
}

async function blobToWavBytes(blob) {
  const arrayBuf = await blob.arrayBuffer();
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const audioBuf = await audioCtx.decodeAudioData(arrayBuf.slice(0));
  return audioBufferToWav(audioBuf);
}

export async function initStegoWasm({ wasmURL = './stego.wasm', wasmExecURL = './wasm_exec.js' } = {}) {
  await loadScriptOnce(wasmExecURL);
  if (typeof Go === 'undefined') {
    throw new Error('wasm_exec.js did not load Go runtime');
  }

  const go = new Go();

  async function instantiate() {
    if (WebAssembly.instantiateStreaming) {
      try {
        return await WebAssembly.instantiateStreaming(fetch(wasmURL), go.importObject);
      } catch (err) {
        console.warn('instantiateStreaming failed, fallback to ArrayBuffer', err);
      }
    }
    const resp = await fetch(wasmURL);
    const buf = await resp.arrayBuffer();
    return await WebAssembly.instantiate(buf, go.importObject);
  }

  const { instance } = await instantiate();
  go.run(instance);

  const encode = (wavBytes, message, password) => {
    const res = globalThis.stegoEncode(new Uint8Array(wavBytes), String(message), String(password));
    if (res && res.error) throw new Error(res.error);
    return res;
  };

  const decode = (wavBytes, password) => {
    const res = globalThis.stegoDecode(new Uint8Array(wavBytes), String(password));
    if (res && res.error) throw new Error(res.error);
    return res;
  };

  return { encode, decode, blobToWavBytes, audioBufferToWav };
}

// For direct <script> inclusion fallback (no bundler): expose global helper
if (typeof window !== 'undefined') {
  window.StegoWasm = { initStegoWasm, blobToWavBytes, audioBufferToWav };
}
