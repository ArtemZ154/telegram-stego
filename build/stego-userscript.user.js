// ==UserScript==
// @name         Telegram Stego (WASM Go)
// @namespace    https://localhost/
// @version      0.1.0
// @description  Encode/decode hidden messages in audio on web.telegram.org using Go stego wasm.
// @match        https://web.telegram.org/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function() {
  'use strict';

  const WASM_BASE = 'http://localhost:8080'; // change if you host wasm elsewhere
  const WASM_EXEC = `${WASM_BASE}/wasm_exec.js`;
  const WASM_BIN = `${WASM_BASE}/stego.wasm`;
  const SHIM_URL = `${WASM_BASE}/stego-shim.js`;

  async function loadShim() {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SHIM_URL;
      s.type = 'module';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  let stego;
  async function ensureStego() {
    if (stego) return stego;
    await loadShim();
    if (!window.StegoWasm) throw new Error('Stego shim not loaded');
    stego = await window.StegoWasm.initStegoWasm({ wasmURL: WASM_BIN, wasmExecURL: WASM_EXEC });
    console.log('[stego] wasm ready');
    return stego;
  }

  // UI helper: small log box
  function toast(msg) {
    console.log('[stego]', msg);
  }

  // Encode selected file in file input
  async function handleInputChange(input) {
    if (!input.files || input.files.length === 0) {
      toast('input change: no files');
      return;
    }
    const file = input.files[0];
    if (!file.type || !file.type.startsWith('audio')) {
      toast('input change: skip non-audio ' + (file.type || '<empty>'));
      return; // only audio for now
    }

    const secret = prompt('Secret text to hide (leave empty to skip):');
    if (!secret) return;
    const password = prompt('Password for stego:');
    if (!password) return;

    const { blobToWavBytes, encode } = await ensureStego();
    const wavBytes = await blobToWavBytes(file);
    const encoded = encode(wavBytes, secret, password);
    const newFile = new File([encoded], file.name.replace(/\.[^.]+$/, '') + '-stego.wav', { type: 'audio/wav' });
    const dt = new DataTransfer();
    dt.items.add(newFile);
    input.files = dt.files;
    toast('Stego audio prepared');
  }

  function hookFileInputs() {
    const seen = new WeakSet();
    const observer = new MutationObserver(muts => {
      for (const m of muts) {
        m.addedNodes.forEach(node => {
          if (node.tagName === 'INPUT' && node.type === 'file' && !seen.has(node)) {
            seen.add(node);
            node.addEventListener('change', () => handleInputChange(node));
            toast('hooked file input');
          }
          if (node.querySelectorAll) {
            node.querySelectorAll('input[type="file"]').forEach(inp => {
              if (!seen.has(inp)) {
                seen.add(inp);
                inp.addEventListener('change', () => handleInputChange(inp));
                toast('hooked file input (nested)');
              }
            });
          }
        });
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  // Add decrypt buttons to <audio> tags
  async function addDecryptButtons(root = document) {
    const audios = root.querySelectorAll('audio:not([data-stego-bound])');
    audios.forEach(audio => {
      audio.dataset.stegoBound = '1';
      const btn = document.createElement('button');
      btn.textContent = 'Decrypt';
      btn.style.marginLeft = '8px';
      btn.style.cursor = 'pointer';
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        try {
          const pass = prompt('Password to decrypt:');
          if (!pass) return;
          const url = audio.src;
          const resp = await fetch(url);
          const blob = await resp.blob();
          const { blobToWavBytes, decode } = await ensureStego();
          const wav = await blobToWavBytes(blob);
          const text = decode(wav, pass);
          alert('Decrypted: ' + text);
        } catch (err) {
          alert('Decrypt failed: ' + err);
        }
      });
      audio.parentElement && audio.parentElement.appendChild(btn);
    });
  }

  function observeAudio() {
    const observer = new MutationObserver(muts => {
      for (const m of muts) {
        m.addedNodes.forEach(node => {
          if (node.tagName === 'AUDIO') addDecryptButtons(node.parentElement || node);
          if (node.querySelectorAll) addDecryptButtons(node);
        });
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    addDecryptButtons();
  }

  async function main() {
    // Preload wasm to see errors early
    try {
      await ensureStego();
      toast('WASM loaded');
    } catch (e) {
      console.error('[stego] wasm load failed', e);
      alert('stego wasm load failed: ' + e);
      return;
    }
    hookFileInputs();
    observeAudio();
    toast('Stego userscript initialized. Host stego.wasm/wasm_exec.js via HTTP.');
  }

  main().catch(err => console.error('[stego] init failed', err));
})();
