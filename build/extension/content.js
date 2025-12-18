const WASM_BIN = chrome.runtime.getURL('stego.wasm');

const STEGO_IDB_NAME = 'stego-cache-v1';
const STEGO_IDB_STORE = 'buffers';

function stegoCacheOpen() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(STEGO_IDB_NAME, 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STEGO_IDB_STORE)) {
                db.createObjectStore(STEGO_IDB_STORE);
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function stegoCachePut(key, buffer) {
    try {
        const db = await stegoCacheOpen();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(STEGO_IDB_STORE, 'readwrite');
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.objectStore(STEGO_IDB_STORE).put({ ts: Date.now(), buffer }, key);
        });
        db.close();
    } catch (e) {
        console.warn('[stego-ext] cache put failed:', e);
    }
}

async function stegoCacheGet(key) {
    try {
        const db = await stegoCacheOpen();
        const rec = await new Promise((resolve, reject) => {
            const tx = db.transaction(STEGO_IDB_STORE, 'readonly');
            tx.onerror = () => reject(tx.error);
            const req = tx.objectStore(STEGO_IDB_STORE).get(key);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
        db.close();
        return rec;
    } catch (e) {
        console.warn('[stego-ext] cache get failed:', e);
        return null;
    }
}

function cacheKeyForDoc(docId) {
    return docId ? `doc:${String(docId)}` : null;
}

async function encryptMessage(message, password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);

    const passwordKey = await crypto.subtle.importKey(
        'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits', 'deriveKey']
    );

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const aesKey = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
        passwordKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt']
    );

    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        aesKey,
        data
    );

    
    const result = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
    result.set(salt, 0);
    result.set(iv, salt.length);
    result.set(new Uint8Array(encrypted), salt.length + iv.length);

    return result;
}


async function decryptMessage(encryptedData, password) {
    const encoder = new TextEncoder();

    const salt = encryptedData.slice(0, 16);
    const iv = encryptedData.slice(16, 28);
    const ciphertext = encryptedData.slice(28);

    const passwordKey = await crypto.subtle.importKey(
        'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits', 'deriveKey']
    );

    const aesKey = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
        passwordKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
    );

    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        aesKey,
        ciphertext
    );

    return new TextDecoder().decode(decrypted);
}


function toBase64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\
}


function fromBase64(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    const binary = atob(str);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}



function injectOggMetadata(oggData, encryptedBase64) {
    const data = new Uint8Array(oggData);
    console.log('[stego-ext] Original OGG size:', data.length);

    
    
    

    
    let offset = 0;
    let pageCount = 0;
    let tagsPageStart = -1;
    let tagsPageEnd = -1;

    while (offset < data.length - 27) {
        
        if (data[offset] === 0x4F && data[offset+1] === 0x67 &&
            data[offset+2] === 0x67 && data[offset+3] === 0x53) { 

            const headerType = data[offset + 5];
            const numSegments = data[offset + 26];
            let pageSize = 27 + numSegments; 

            for (let i = 0; i < numSegments; i++) {
                pageSize += data[offset + 27 + i];
            }

            if (pageCount === 1) { 
                tagsPageStart = offset;
                tagsPageEnd = offset + pageSize;
                console.log('[stego-ext] Found OpusTags page at', tagsPageStart, '-', tagsPageEnd);
            }

            offset += pageSize;
            pageCount++;
        } else {
            offset++;
        }
    }

    if (tagsPageStart === -1) {
        console.error('[stego-ext] Could not find OpusTags page');
        return data; 
    }

    
    
    

    
    const pageHeader = data.slice(tagsPageStart, tagsPageStart + 27);
    const numSegments = pageHeader[26];
    const segmentTable = data.slice(tagsPageStart + 27, tagsPageStart + 27 + numSegments);
    const segmentDataStart = tagsPageStart + 27 + numSegments;

    
    let totalSegmentSize = 0;
    for (let i = 0; i < numSegments; i++) {
        totalSegmentSize += segmentTable[i];
    }

    const segmentData = data.slice(segmentDataStart, segmentDataStart + totalSegmentSize);

    
    
    const magic = String.fromCharCode(...segmentData.slice(0, 8));
    if (magic !== 'OpusTags') {
        console.error('[stego-ext] Invalid OpusTags magic:', magic);
        return data;
    }

    
    const vendorLen = segmentData[8] | (segmentData[9] << 8) | (segmentData[10] << 16) | (segmentData[11] << 24);
    const vendorEnd = 12 + vendorLen;

    
    const commentCount = segmentData[vendorEnd] | (segmentData[vendorEnd+1] << 8) |
        (segmentData[vendorEnd+2] << 16) | (segmentData[vendorEnd+3] << 24);

    console.log('[stego-ext] Vendor length:', vendorLen, 'Comment count:', commentCount);

    
    const newComment = 'STEGO=' + encryptedBase64;
    const commentBytes = new TextEncoder().encode(newComment);

    
    const newCommentCount = commentCount + 1;
    const newSegmentData = new Uint8Array(
        segmentData.length + 4 + commentBytes.length 
    );

    
    newSegmentData.set(segmentData.slice(0, vendorEnd), 0);

    
    newSegmentData[vendorEnd] = newCommentCount & 0xFF;
    newSegmentData[vendorEnd + 1] = (newCommentCount >> 8) & 0xFF;
    newSegmentData[vendorEnd + 2] = (newCommentCount >> 16) & 0xFF;
    newSegmentData[vendorEnd + 3] = (newCommentCount >> 24) & 0xFF;

    
    const existingCommentsStart = vendorEnd + 4;
    let existingCommentsEnd = existingCommentsStart;
    for (let i = 0; i < commentCount; i++) {
        const commentLen = segmentData[existingCommentsEnd] | (segmentData[existingCommentsEnd+1] << 8) |
            (segmentData[existingCommentsEnd+2] << 16) | (segmentData[existingCommentsEnd+3] << 24);
        existingCommentsEnd += 4 + commentLen;
    }

    const existingComments = segmentData.slice(existingCommentsStart, existingCommentsEnd);
    newSegmentData.set(existingComments, vendorEnd + 4);

    
    const newCommentOffset = vendorEnd + 4 + existingComments.length;
    newSegmentData[newCommentOffset] = commentBytes.length & 0xFF;
    newSegmentData[newCommentOffset + 1] = (commentBytes.length >> 8) & 0xFF;
    newSegmentData[newCommentOffset + 2] = (commentBytes.length >> 16) & 0xFF;
    newSegmentData[newCommentOffset + 3] = (commentBytes.length >> 24) & 0xFF;
    newSegmentData.set(commentBytes, newCommentOffset + 4);

    
    const newSegmentTable = [];
    let remaining = newSegmentData.length;
    while (remaining > 0) {
        const segSize = Math.min(255, remaining);
        newSegmentTable.push(segSize);
        remaining -= segSize;
    }
    
    if (newSegmentTable[newSegmentTable.length - 1] === 255) {
        newSegmentTable.push(0);
    }

    
    const newPageHeader = new Uint8Array(27 + newSegmentTable.length);
    newPageHeader.set(pageHeader.slice(0, 26), 0); 
    newPageHeader[26] = newSegmentTable.length;
    newPageHeader.set(new Uint8Array(newSegmentTable), 27);

    
    newPageHeader[22] = 0;
    newPageHeader[23] = 0;
    newPageHeader[24] = 0;
    newPageHeader[25] = 0;

    
    const pageDataForCRC = new Uint8Array(newPageHeader.length + newSegmentData.length);
    pageDataForCRC.set(newPageHeader, 0);
    pageDataForCRC.set(newSegmentData, newPageHeader.length);
    const crc = crc32Ogg(pageDataForCRC);

    newPageHeader[22] = crc & 0xFF;
    newPageHeader[23] = (crc >> 8) & 0xFF;
    newPageHeader[24] = (crc >> 16) & 0xFF;
    newPageHeader[25] = (crc >> 24) & 0xFF;

    
    const beforeTags = data.slice(0, tagsPageStart);
    const afterTags = data.slice(tagsPageEnd);

    const result = new Uint8Array(beforeTags.length + newPageHeader.length + newSegmentData.length + afterTags.length);
    let pos = 0;
    result.set(beforeTags, pos); pos += beforeTags.length;
    result.set(newPageHeader, pos); pos += newPageHeader.length;
    result.set(newSegmentData, pos); pos += newSegmentData.length;
    result.set(afterTags, pos);

    console.log('[stego-ext] New OGG size:', result.length, '(added', result.length - data.length, 'bytes)');
    return result;
}


function extractOggMetadata(oggData) {
    const data = new Uint8Array(oggData);

    
    let offset = 0;
    let pageCount = 0;

    while (offset < data.length - 27) {
        if (data[offset] === 0x4F && data[offset+1] === 0x67 &&
            data[offset+2] === 0x67 && data[offset+3] === 0x53) {

            const numSegments = data[offset + 26];
            let pageSize = 27 + numSegments;
            for (let i = 0; i < numSegments; i++) {
                pageSize += data[offset + 27 + i];
            }

            if (pageCount === 1) {
                
                const segmentDataStart = offset + 27 + numSegments;
                let totalSegmentSize = 0;
                for (let i = 0; i < numSegments; i++) {
                    totalSegmentSize += data[offset + 27 + i];
                }
                const segmentData = data.slice(segmentDataStart, segmentDataStart + totalSegmentSize);

                
                const magic = String.fromCharCode(...segmentData.slice(0, 8));
                if (magic !== 'OpusTags') {
                    console.log('[stego-ext] Not OpusTags:', magic);
                    return null;
                }

                const vendorLen = segmentData[8] | (segmentData[9] << 8) | (segmentData[10] << 16) | (segmentData[11] << 24);
                const vendorEnd = 12 + vendorLen;
                const commentCount = segmentData[vendorEnd] | (segmentData[vendorEnd+1] << 8) |
                    (segmentData[vendorEnd+2] << 16) | (segmentData[vendorEnd+3] << 24);

                
                let commentOffset = vendorEnd + 4;
                for (let i = 0; i < commentCount; i++) {
                    const commentLen = segmentData[commentOffset] | (segmentData[commentOffset+1] << 8) |
                        (segmentData[commentOffset+2] << 16) | (segmentData[commentOffset+3] << 24);
                    const comment = new TextDecoder().decode(segmentData.slice(commentOffset + 4, commentOffset + 4 + commentLen));

                    if (comment.startsWith('STEGO=')) {
                        console.log('[stego-ext] Found STEGO metadata!');
                        return comment.slice(6); 
                    }

                    commentOffset += 4 + commentLen;
                }

                console.log('[stego-ext] No STEGO tag found in', commentCount, 'comments');
                return null;
            }

            offset += pageSize;
            pageCount++;
        } else {
            offset++;
        }
    }

    return null;
}


function crc32Ogg(data) {
    const table = [];
    for (let i = 0; i < 256; i++) {
        let c = i << 24;
        for (let j = 0; j < 8; j++) {
            c = (c << 1) ^ ((c & 0x80000000) ? 0x04c11db7 : 0);
        }
        table[i] = c >>> 0;
    }

    let crc = 0;
    for (let i = 0; i < data.length; i++) {
        crc = ((crc << 8) ^ table[((crc >>> 24) ^ data[i]) & 0xFF]) >>> 0;
    }
    return crc;
}

function audioBufferToWav(ab) {
    const numChannels = 1;
    const sampleRate = ab.sampleRate;
    const channelData = ab.getChannelData(0);
    const buffer = new ArrayBuffer(44 + channelData.length * 2);
    const view = new DataView(buffer);
    function writeString(offset, string) {
        for (let i = 0; i < string.length; i += 1) view.setUint8(offset + i, string.charCodeAt(i));
    }
    let offset = 0;
    writeString(offset, 'RIFF'); offset += 4;
    view.setUint32(offset, 36 + channelData.length * 2, true); offset += 4;
    writeString(offset, 'WAVE'); offset += 4;
    writeString(offset, 'fmt '); offset += 4;
    view.setUint32(offset, 16, true); offset += 4;
    view.setUint16(offset, 1, true); offset += 2;
    view.setUint16(offset, numChannels, true); offset += 2;
    view.setUint32(offset, sampleRate, true); offset += 4;
    view.setUint32(offset, sampleRate * numChannels * 2, true); offset += 4;
    view.setUint16(offset, numChannels * 2, true); offset += 2;
    view.setUint16(offset, 16, true); offset += 2;
    writeString(offset, 'data'); offset += 4;
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

async function initStegoWasm({ wasmURL }) {
    if (typeof Go === 'undefined') throw new Error('Go runtime missing (wasm_exec.js not loaded)');
    const go = new Go();
    async function instantiate() {
        if (WebAssembly.instantiateStreaming) {
            try { return await WebAssembly.instantiateStreaming(fetch(wasmURL), go.importObject); }
            catch (err) { console.warn('instantiateStreaming failed, fallback', err); }
        }
        const resp = await fetch(wasmURL);
        const buf = await resp.arrayBuffer();
        return await WebAssembly.instantiate(buf, go.importObject);
    }
    const { instance } = await instantiate();
    go.run(instance);

    
    const encode = (message, password, audioData) => {
        console.log('[stego-ext] encode() called: message len=', message.length, 'audio len=', audioData?.length);
        const res = globalThis.stegoEncode(
            String(message),
            String(password),
            new Uint8Array(audioData || [])
        );
        if (res && res.error) throw new Error(res.error);
        return res; 
    };

    const decode = (metadata, password) => {
        
        let data;
        if (metadata instanceof Uint8Array) {
            data = metadata;
        } else if (metadata instanceof ArrayBuffer) {
            data = new Uint8Array(metadata);
        } else {
            data = new Uint8Array(metadata);
        }
        console.log('[stego-ext] decode() called with metadata size:', data.byteLength);
        const res = globalThis.stegoDecode(data, String(password));
        if (res && res.error) throw new Error(res.error);
        return res; 
    };

    return { encode, decode, blobToWavBytes, audioBufferToWav };
}

let stego;
async function ensureStego() {
    if (stego) return stego;
    stego = await initStegoWasm({ wasmURL: WASM_BIN });
    console.log('[stego-ext] wasm ready');
    return stego;
}

function toast(msg) {
    console.log('[stego-ext]', msg);
}


function injectPageHook() {
    try {
        const s = document.createElement('script');
        s.src = chrome.runtime.getURL('page-hook.js');
        s.onload = () => s.remove();
        (document.documentElement || document.head || document.body).appendChild(s);
        toast('page hook injected');
    } catch (err) {
        console.error('[stego-ext] page hook inject failed', err);
    }
}

(function setupEncodeBridge() {
    window.addEventListener('message', async evt => {
        const data = evt.data;
        if (!data || data.__stegoRequest !== true) return;

        
        if (data.action === 'linkLastEncodedToDoc' && data.docId) {
            const docKey = cacheKeyForDoc(data.docId);
            if (docKey) {
                const last = await stegoCacheGet('lastEncodedOgg');
                if (last && last.buffer) {
                    await stegoCachePut(docKey, last.buffer.slice(0));
                    console.log('[stego-ext] Linked lastEncodedOgg to', docKey);
                }
            }
            return;
        }

        
        if (data.action === 'encodeBuffer' && data.buffer) {
            const { id, secret, password } = data;

            console.log('[stego-ext] encodeBuffer request, size:', data.buffer.byteLength);

            
            try {
                console.log('[stego-ext] Using OGG metadata method');

                
                const header = new Uint8Array(data.buffer.slice(0, 4));
                const headerStr = String.fromCharCode(...header);
                if (headerStr !== 'OggS') {
                    throw new Error('Input is not OGG format: ' + headerStr);
                }

                
                console.log('[stego-ext] Encrypting message:', secret.substring(0, 20) + '...');
                const encrypted = await encryptMessage(secret, password);
                const base64Data = toBase64(encrypted);
                console.log('[stego-ext] Encrypted to base64, length:', base64Data.length);

                
                const modifiedOgg = injectOggMetadata(data.buffer, base64Data);

                
                const extracted = extractOggMetadata(modifiedOgg);
                if (extracted === base64Data) {
                    console.log('[stego-ext] VERIFY: Metadata injection SUCCESS!');
                } else {
                    console.error('[stego-ext] VERIFY: Metadata mismatch!', extracted?.length, 'vs', base64Data.length);
                }

                
                const buffer = modifiedOgg.buffer.slice(modifiedOgg.byteOffset, modifiedOgg.byteOffset + modifiedOgg.byteLength);

                
                await stegoCachePut('lastEncodedOgg', buffer.slice(0));

                window.postMessage({ __stegoResponse: true, id, ok: true, buffer }, '*', [buffer]);
            } catch (err) {
                console.error('[stego-ext] encodeBuffer (metadata method) failed:', err);
                window.postMessage({ __stegoResponse: true, id, ok: false, error: String(err) }, '*');
            }
            return;
        }

        
        if (data.action === 'decodeBuffer' && data.buffer) {
            const { id, password, docId, msgId, msgTimestamp } = data;
            try {
                console.log('[stego-ext] decodeBuffer request, size:', data.buffer.byteLength);

                if (docId) console.log('[stego-ext] decodeBuffer docId:', docId);
                if (msgId) console.log('[stego-ext] decodeBuffer msgId:', msgId);
                if (msgTimestamp) console.log('[stego-ext] decodeBuffer msgTimestamp:', msgTimestamp);

                const header = new Uint8Array(data.buffer.slice(0, 4));
                const headerStr = String.fromCharCode(...header);

                console.log('[stego-ext] File header:', headerStr);

                
                if (headerStr === 'OggS') {
                    
                    const base64Data = extractOggMetadata(data.buffer);

                    if (base64Data) {
                        console.log('[stego-ext] Found STEGO metadata, decrypting...');
                        const encrypted = fromBase64(base64Data);
                        const message = await decryptMessage(encrypted, password);
                        console.log('[stego-ext] Decrypted message (metadata):', message.substring(0, 50) + '...');

                        
                        const docKey = cacheKeyForDoc(docId);
                        if (docKey) {
                            await stegoCachePut(docKey, data.buffer.slice(0));
                        }

                        window.postMessage({ __stegoResponse: true, id, ok: true, message }, '*');
                        return;
                    }

                    throw new Error('Скрытое сообщение не найдено');
                }

                
                if (headerStr === 'RIFF') {
                    console.log('[stego-ext] Header is RIFF (WAV), attempting to extract STEK metadata...');
                    const metadata = extractMetadataFromWAV(data.buffer);
                    if (metadata) {
                        console.log('[stego-ext] Found STEK metadata in WAV, decrypting...');
                        
                        const { decode } = await ensureStego();
                        const message = decode(metadata, password);
                        window.postMessage({ __stegoResponse: true, id, ok: true, message }, '*');
                        return;
                    }

                    
                    
                    const docKey = cacheKeyForDoc(docId);
                    const cached = (docKey ? await stegoCacheGet(docKey) : null) || await stegoCacheGet('lastEncodedOgg');
                    if (cached && cached.buffer) {
                        console.log('[stego-ext] RIFF has no STEK; trying cached OGG buffer, age(ms):', Date.now() - (cached.ts || 0));
                        const cachedHeader = new Uint8Array(cached.buffer.slice(0, 4));
                        const cachedHeaderStr = String.fromCharCode(...cachedHeader);
                        if (cachedHeaderStr === 'OggS') {
                            const base64Data = extractOggMetadata(cached.buffer);
                            if (base64Data) {
                                const encrypted = fromBase64(base64Data);
                                const message = await decryptMessage(encrypted, password);
                                console.log('[stego-ext] Decrypted message from cached OGG:', message.substring(0, 50) + '...');
                                window.postMessage({ __stegoResponse: true, id, ok: true, message }, '*');
                                return;
                            }
                        }
                    }

                    throw new Error('Скрытое сообщение не найдено. Telegram вернул RIFF/WAV (метаданные OpusTags потеряны). Если это ваше сообщение, попробуйте расшифровать сразу после отправки или перешлите как файл.');
                }

                throw new Error('Неизвестный формат файла: ' + headerStr);
            } catch (err) {
                console.error('[stego-ext] decodeBuffer failed:', err);
                window.postMessage({ __stegoResponse: true, id, ok: false, error: String(err) }, '*');
            }
            return;
        }
    });
})();

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

async function handleInputChange(input) {
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    if (!file.type || !file.type.startsWith('audio')) return;
    const secret = prompt('Секретный текст (оставьте пустым для отмены):');
    if (!secret) return;
    const password = prompt('Пароль:');
    if (!password) return;
    const { encode } = await ensureStego();
    const wavBytes = await blobToWavBytes(file);

    
    const metadata = encode(secret, password, wavBytes);
    const wavWithMetadata = embedMetadataInWAV(wavBytes, metadata);

    const newFile = new File([wavWithMetadata], file.name.replace(/\.[^.]+$/, '') + '-stego.wav', { type: 'audio/wav' });
    const dt = new DataTransfer();
    dt.items.add(newFile);
    input.files = dt.files;
    toast('Аудиофайл со скрытым сообщением подготовлен');
}


function embedMetadataInWAV(wavData, metadata) {
    const view = new DataView(wavData);

    
    if (new TextDecoder().decode(new Uint8Array(wavData, 0, 4)) !== 'RIFF') {
        console.error('[stego-ext] Not a valid WAV file');
        return wavData;
    }

    
    const chunkID = new Uint8Array([0x53, 0x54, 0x45, 0x4B]); 
    const chunkSize = new Uint32Array([metadata.length]);

    
    const chunk = new Uint8Array(8 + metadata.length);
    chunk.set(chunkID, 0);
    chunk.set(new Uint8Array(chunkSize.buffer), 4);
    chunk.set(metadata, 8);

    
    const currentSize = view.getUint32(4, true);
    const newSize = currentSize + chunk.length;

    
    const result = new Uint8Array(wavData.length + chunk.length);
    result.set(new Uint8Array(wavData, 0, 8), 0);
    new DataView(result.buffer).setUint32(4, newSize, true);
    result.set(new Uint8Array(wavData, 8), 8);
    result.set(chunk, wavData.length);

    return result;
}


function extractMetadataFromWAV(wavData) {
    const view = new DataView(wavData);

    
    if (new TextDecoder().decode(new Uint8Array(wavData, 0, 4)) !== 'RIFF') {
        console.error('[stego-ext] Not a valid WAV file');
        return null;
    }

    
    let pos = 12; 
    const maxPos = view.byteLength;

    while (pos < maxPos - 8) {
        const chunkID = new TextDecoder().decode(new Uint8Array(wavData, pos, 4));
        const chunkSize = view.getUint32(pos + 4, true);

        if (chunkID === 'STEK') {
            
            const metadata = new Uint8Array(wavData, pos + 8, chunkSize);
            console.log('[stego-ext] Found STEK chunk, size:', chunkSize);
            return metadata;
        }

        
        const skipSize = 8 + chunkSize + (chunkSize % 2);
        pos += skipSize;
    }

    console.warn('[stego-ext] STEK chunk not found');
    return null;
}

async function addDecryptButtons(root = document) {
    const audios = root.querySelectorAll('audio:not([data-stego-bound])');
    audios.forEach(audio => {
        audio.dataset.stegoBound = '1';
        const btn = document.createElement('button');
        btn.textContent = 'Расшифровать';
        btn.style.marginLeft = '8px';
        btn.style.cursor = 'pointer';
        btn.addEventListener('click', async e => {
            e.stopPropagation();
            try {
                const pass = prompt('Пароль для расшифровки:');
                if (!pass) return;
                const url = audio.src;
                const resp = await fetch(url);
                const blob = await resp.blob();
                const { decode } = await ensureStego();

                
                const wav = await blobToWavBytes(blob);
                const metadata = extractMetadataFromWAV(wav);

                if (!metadata) {
                    alert('Метаданные не найдены');
                    return;
                }

                const text = decode(metadata, pass);
                alert('Расшифровано: ' + text);
            } catch (err) {
                alert('Ошибка: ' + err);
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
    try {
        await ensureStego();
    } catch (e) {
        console.error('[stego-ext] wasm load failed', e);
        alert('Ошибка загрузки WASM: ' + e);
        return;
    }
    injectPageHook();
    hookFileInputs();
    observeAudio();
    toast('Stego расширение инициализировано');
}

main().catch(err => console.error('[stego-ext] init failed', err));