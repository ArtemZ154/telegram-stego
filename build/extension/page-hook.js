(() => {
  const pending = new Map();
  let nextId = 1;

  
  const OriginalBlob = window.Blob;

  window.addEventListener('message', evt => {
    const d = evt.data;
    if (!d || d.__stegoResponse !== true) return;
    const p = pending.get(d.id);
    if (!p) return;
    pending.delete(d.id);
    if (!d.ok) {
      p.reject(new Error(d.error || 'encode failed'));
      return;
    }
    
    if (p.isDecode) {
      p.resolve(d.message);
      return;
    }
    
    if (p.isBuffer) {
      p.resolve(d.buffer);
      return;
    }
    
    const blob = new OriginalBlob([d.buffer], { type: d.blobType || 'audio/wav' });
    p.resolve(blob);
  });

  
  
  
  let stegoConfig = null; 

  
  const STORAGE_KEY = 'stego_chat_passwords';

  function getChatPasswords() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  }

  function saveChatPassword(chatId, password) {
    const passwords = getChatPasswords();
    passwords[chatId] = password;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(passwords));
  }

  function removeChatPassword(chatId) {
    const passwords = getChatPasswords();
    delete passwords[chatId];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(passwords));
  }

  function getChatPassword(chatId) {
    const passwords = getChatPasswords();
    return passwords[chatId] || null;
  }

  function getCurrentChatId() {
    
    
    const hash = window.location.hash;
    const idMatch = hash.match(/#(-?\d+|@\w+)/);
    if (idMatch) {
      return idMatch[1];
    }

    
    const activeItemK = document.querySelector('.chat-list .chat-item.active[data-peer-id], .sidebar-left .chat-item.active[data-peer-id]');
    if (activeItemK) {
      return activeItemK.dataset.peerId;
    }

    
    const messageListK = document.querySelector('.messages-layout .messages-container');
    if (messageListK && messageListK.dataset.peerId) {
      return messageListK.dataset.peerId;
    }

    
    
    const mainColumn = document.querySelector('.middle-column, .messages-layout, .main-column, #MiddleColumn');
    if (mainColumn) {
        const peerEl = mainColumn.querySelector('[data-peer-id]');
        if (peerEl) {
          return peerEl.dataset.peerId;
        }
    }

    
    const activeChatGeneric = document.querySelector('.ListItem.selected, .chatlist-chat.active, [class*="Chat"].active');
    if (activeChatGeneric) {
      const peerId = activeChatGeneric.dataset?.peerId || activeChatGeneric.getAttribute('data-peer-id');
      if (peerId) {
        return peerId;
      }
    }

    return null;
  }

  function getCurrentChatName() {
    
    const titleK = document.querySelector('.top .peer-title, .chat-info .peer-title, .chat-info .title .peer-title, .chat-info .title');
    if (titleK && titleK.textContent) return titleK.textContent.trim();

    
    const titleA = document.querySelector('.ChatHeader .title > h3, .ChatHeader .chat-title, .ChatHeader .title');
    if (titleA && titleA.textContent) return titleA.textContent.trim();

    
    const genericTitle = document.querySelector('.chat-title, .peer-title, .top-bar .title');
    if (genericTitle && genericTitle.textContent) return genericTitle.textContent.trim();

    return 'Неизвестный чат';
  }

  
  function createStegoUI() {
    if (document.getElementById('stego-panel')) return;

    
    const style = document.createElement('style');
    style.textContent = `
      #stego-panel {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 99999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }

      #stego-toggle {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        border: none;
        background: #667eea;
        color: white;
        font-size: 24px;
        cursor: pointer;
        box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
        transition: all 0.3s ease;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      #stego-toggle:hover {
        transform: scale(1.1);
        box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
      }

      #stego-toggle.armed {
        background: #f5576c;
        animation: pulse 2s infinite;
      }

      @keyframes pulse {
        0%, 100% { box-shadow: 0 4px 15px rgba(245, 87, 108, 0.4); }
        50% { box-shadow: 0 4px 25px rgba(245, 87, 108, 0.8); }
      }

      #stego-menu {
        position: absolute;
        bottom: 70px;
        right: 0;
        background: white;
        border-radius: 16px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
        padding: 16px;
        width: 280px;
        display: none;
        animation: slideUp 0.3s ease;
      }

      #stego-menu.show {
        display: block;
      }

      @keyframes slideUp {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }

      .stego-header {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 16px;
        padding-bottom: 12px;
        border-bottom: 1px solid #eee;
      }

      .stego-header-icon {
        width: 40px;
        height: 40px;
        background: #667eea;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
      }

      .stego-header-text h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: #1a1a2e;
      }

      .stego-header-text p {
        margin: 2px 0 0;
        font-size: 12px;
        color: #888;
      }

      .stego-input-group {
        margin-bottom: 12px;
      }

      .stego-input-group label {
        display: block;
        font-size: 12px;
        font-weight: 500;
        color: #666;
        margin-bottom: 6px;
      }

      .stego-input-group input, .stego-input-group textarea {
        width: 100%;
        padding: 10px 12px;
        border: 2px solid #e8e8e8;
        border-radius: 10px;
        font-size: 14px;
        transition: border-color 0.2s;
        box-sizing: border-box;
        resize: none;
        background: #ffffff;
        color: #333333;
      }

      .stego-input-group input:focus, .stego-input-group textarea:focus {
        outline: none;
        border-color: #667eea;
      }

      .stego-btn {
        width: 100%;
        padding: 12px;
        border: none;
        border-radius: 10px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      }

      .stego-btn-primary {
        background: #667eea;
        color: white;
      }

      .stego-btn-primary:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
      }

      .stego-btn-danger {
        background: #f5576c;
        color: white;
      }

      .stego-btn-danger:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(245, 87, 108, 0.4);
      }

      .stego-status {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        background: #f8f9fa;
        border-radius: 10px;
        margin-bottom: 12px;
      }

      .stego-status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #ccc;
      }

      .stego-status-dot.active {
        background: #4caf50;
        animation: blink 1s infinite;
      }

      @keyframes blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }

      .stego-status-text {
        font-size: 13px;
        color: #666;
      }

      /* Decode button on voice messages */
      .stego-decode-btn {
        position: absolute;
        top: 4px;
        right: 4px;
        z-index: 100;
        width: 28px;
        height: 28px;
        padding: 0;
        background: #667eea;
        color: white;
        border: none;
        border-radius: 50%;
        cursor: pointer;
        font-size: 14px;
        opacity: 0.85;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .stego-decode-btn:hover {
        opacity: 1;
        transform: scale(1.1);
      }

      .stego-decode-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      /* Toast notification */
      .stego-toast {
        position: fixed;
        bottom: 100px;
        left: 50%;
        transform: translateX(-50%);
        background: #1a1a2e;
        color: white;
        padding: 14px 24px;
        border-radius: 12px;
        font-size: 14px;
        z-index: 999999;
        animation: toastIn 0.3s ease;
        max-width: 400px;
        text-align: center;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
      }

      .stego-toast.success {
        background: #11998e;
      }

      .stego-toast.error {
        background: #eb3349;
      }

      @keyframes toastIn {
        from { opacity: 0; transform: translateX(-50%) translateY(20px); }
        to { opacity: 1; transform: translateX(-50%) translateY(0); }
      }

      /* Modal for decoded message */
      .stego-modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 999998;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: fadeIn 0.2s ease;
      }

      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      .stego-modal {
        background: white;
        border-radius: 20px;
        padding: 24px;
        max-width: 400px;
        width: 90%;
        animation: modalIn 0.3s ease;
      }

      @keyframes modalIn {
        from { opacity: 0; transform: scale(0.9); }
        to { opacity: 1; transform: scale(1); }
      }

      .stego-modal-header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 16px;
      }

      .stego-modal-icon {
        width: 48px;
        height: 48px;
        background: #11998e;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
      }

      .stego-modal-title {
        font-size: 18px;
        font-weight: 600;
        color: #1a1a2e;
      }

      .stego-modal-message {
        background: #f8f9fa;
        border-radius: 12px;
        padding: 16px;
        font-size: 15px;
        line-height: 1.5;
        color: #333;
        word-break: break-word;
        margin-bottom: 16px;
        max-height: 200px;
        overflow-y: auto;
      }

      .stego-modal-close {
        width: 100%;
        padding: 12px;
        background: #f0f0f0;
        border: none;
        border-radius: 10px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.2s;
      }

      .stego-modal-close:hover {
        background: #e0e0e0;
      }

      /* Password input modal */
      .stego-password-modal .stego-modal {
        text-align: center;
      }

      .stego-password-input {
        width: 100%;
        padding: 12px 16px;
        border: 2px solid #e8e8e8;
        border-radius: 10px;
        font-size: 16px;
        text-align: center;
        margin-bottom: 16px;
        box-sizing: border-box;
        background: #ffffff;
        color: #333333;
      }

      .stego-password-input:focus {
        outline: none;
        border-color: #667eea;
      }

      .stego-modal-buttons {
        display: flex;
        gap: 10px;
      }

      .stego-modal-buttons .stego-btn {
        flex: 1;
      }

      /* Chat password section */
      .stego-chat-section {
        background: #f8f9fa;
        border-radius: 12px;
        padding: 12px;
        margin-bottom: 12px;
      }

      .stego-chat-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
      }

      .stego-chat-name {
        font-size: 13px;
        font-weight: 600;
        color: #333;
        max-width: 180px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .stego-chat-badge {
        font-size: 10px;
        padding: 2px 8px;
        border-radius: 10px;
        font-weight: 500;
      }

      .stego-chat-badge.saved {
        background: #11998e;
        color: white;
      }

      .stego-chat-badge.not-saved {
        background: #e0e0e0;
        color: #666;
      }

      .stego-save-password {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        color: #666;
        margin-top: 8px;
      }

      .stego-save-password input[type="checkbox"] {
        width: 16px;
        height: 16px;
        min-width: 16px;
        min-height: 16px;
        cursor: pointer;
        accent-color: #667eea;
        appearance: auto;
        -webkit-appearance: checkbox;
      }

      .stego-save-password label {
        cursor: pointer;
        user-select: none;
      }

      .stego-remove-password {
        font-size: 11px;
        color: #f5576c;
        background: none;
        border: none;
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 6px;
        transition: background 0.2s;
      }

      .stego-remove-password:hover {
        background: rgba(245, 87, 108, 0.1);
      }

      .stego-divider {
        height: 1px;
        background: #e8e8e8;
        margin: 12px 0;
      }
    `;
    document.head.appendChild(style);

    
    const panel = document.createElement('div');
    panel.id = 'stego-panel';
    panel.innerHTML = `
      <div id="stego-menu">
        <div class="stego-header">
          <div class="stego-header-icon">🔐</div>
          <div class="stego-header-text">
            <h3>Stego Voice</h3>
            <p>Скрытие сообщений в аудио</p>
          </div>
        </div>

        <div class="stego-chat-section" id="stego-chat-section">
          <div class="stego-chat-header">
            <span class="stego-chat-name" id="stego-chat-name">Чат не выбран</span>
            <span class="stego-chat-badge not-saved" id="stego-chat-badge">Нет пароля</span>
          </div>
          <div class="stego-save-password">
            <input type="checkbox" id="stego-save-checkbox" checked>
            <label for="stego-save-checkbox">Запомнить пароль для чата</label>
          </div>
          <button class="stego-remove-password" id="stego-remove-password" style="display: none;">
            🗑️ Удалить сохраненный пароль
          </button>
        </div>

        <div class="stego-status" id="stego-status">
          <div class="stego-status-dot" id="stego-status-dot"></div>
          <span class="stego-status-text" id="stego-status-text">Готов к работе</span>
        </div>

        <div class="stego-input-group">
          <label>Секретное сообщение</label>
          <textarea id="stego-secret" rows="2" placeholder="Введите текст..."></textarea>
        </div>

        <div class="stego-input-group">
          <label>Пароль</label>
          <input type="password" id="stego-password" placeholder="Введите пароль...">
        </div>

        <button class="stego-btn stego-btn-primary" id="stego-arm-btn">
          🎯 Активировать
        </button>
      </div>

      <button id="stego-toggle">🔐</button>
    `;
    document.body.appendChild(panel);

    
    const toggle = document.getElementById('stego-toggle');
    const menu = document.getElementById('stego-menu');
    const armBtn = document.getElementById('stego-arm-btn');
    const secretInput = document.getElementById('stego-secret');
    const passwordInput = document.getElementById('stego-password');
    const statusDot = document.getElementById('stego-status-dot');
    const statusText = document.getElementById('stego-status-text');
    const chatNameEl = document.getElementById('stego-chat-name');
    const chatBadgeEl = document.getElementById('stego-chat-badge');
    const saveCheckbox = document.getElementById('stego-save-checkbox');
    const removePasswordBtn = document.getElementById('stego-remove-password');

    
    function updateChatInfo() {
      const chatId = getCurrentChatId();
      const chatName = getCurrentChatName();
      const savedPassword = chatId ? getChatPassword(chatId) : null;

      chatNameEl.textContent = chatName || 'Чат не выбран';
      chatNameEl.title = chatId ? `ID: ${chatId}` : '';

      if (savedPassword) {
        chatBadgeEl.textContent = '✓ Пароль сохранен';
        chatBadgeEl.className = 'stego-chat-badge saved';
        passwordInput.value = savedPassword;
        passwordInput.placeholder = 'Используется сохраненный...';
        saveCheckbox.checked = true;
        removePasswordBtn.style.display = 'block';
      } else {
        chatBadgeEl.textContent = 'Нет пароля';
        chatBadgeEl.className = 'stego-chat-badge not-saved';
        passwordInput.placeholder = 'Введите пароль...';
        saveCheckbox.checked = false;
        removePasswordBtn.style.display = 'none';
      }
    }

    
    let chatPollInterval = null;

    function startChatPolling() {
      if (chatPollInterval) clearInterval(chatPollInterval);
      updateChatInfo(); 
      chatPollInterval = setInterval(updateChatInfo, 1000); 
    }

    function stopChatPolling() {
      if (chatPollInterval) {
        clearInterval(chatPollInterval);
        chatPollInterval = null;
      }
    }

    
    const origPushState = history.pushState;
    history.pushState = function(...args) {
      const result = origPushState.apply(this, args);
      if (menu.classList.contains('show')) updateChatInfo();
      return result;
    };

    const origReplaceState = history.replaceState;
    history.replaceState = function(...args) {
      const result = origReplaceState.apply(this, args);
      if (menu.classList.contains('show')) updateChatInfo();
      return result;
    };

    window.addEventListener('popstate', () => {
      if (menu.classList.contains('show')) updateChatInfo();
    });

    
    window.addEventListener('hashchange', () => {
      if (menu.classList.contains('show')) {
        updateChatInfo();
      }
    });

    
    panel.addEventListener('click', (e) => e.stopPropagation());
    panel.addEventListener('mousedown', (e) => e.stopPropagation());
    panel.addEventListener('mouseup', (e) => e.stopPropagation());
    panel.addEventListener('keydown', (e) => e.stopPropagation());
    panel.addEventListener('keyup', (e) => e.stopPropagation());
    panel.addEventListener('keypress', (e) => e.stopPropagation());
    panel.addEventListener('input', (e) => e.stopPropagation());
    panel.addEventListener('focus', (e) => e.stopPropagation(), true);
    panel.addEventListener('focusin', (e) => e.stopPropagation());
    panel.addEventListener('focusout', (e) => e.stopPropagation());

    toggle.onclick = (e) => {
      e.stopPropagation();
      menu.classList.toggle('show');
      if (menu.classList.contains('show')) {
        startChatPolling();
      } else {
        stopChatPolling();
      }
    };

    
    removePasswordBtn.onclick = (e) => {
      e.stopPropagation();
      const chatId = getCurrentChatId();
      if (chatId) {
        removeChatPassword(chatId);
        passwordInput.value = '';
        updateChatInfo();
        showToast('Пароль удален');
      }
    };

    
    document.addEventListener('click', (e) => {
      if (!panel.contains(e.target)) {
        menu.classList.remove('show');
        stopChatPolling();
      }
    });

    armBtn.onclick = () => {
      const secret = secretInput.value.trim();
      const password = passwordInput.value.trim();
      const chatId = getCurrentChatId();

      if (stegoConfig) {
        
        stegoConfig = null;
        armBtn.textContent = '🎯 Активировать';
        armBtn.className = 'stego-btn stego-btn-primary';
        toggle.classList.remove('armed');
        toggle.textContent = '🔐';
        statusDot.classList.remove('active');
        statusText.textContent = 'Готов к работе';
        showToast('Стего отключено');
        return;
      }

      if (!secret) {
        showToast('Введите сообщение', 'error');
        secretInput.focus();
        return;
      }

      if (!password) {
        showToast('Введите пароль', 'error');
        passwordInput.focus();
        return;
      }

      
      console.log('[stego-ext] Save checkbox checked:', saveCheckbox.checked, 'chatId:', chatId);
      if (saveCheckbox.checked && chatId) {
        saveChatPassword(chatId, password);
        console.log('[stego-ext] Password saved for chat:', chatId);
        showToast('Пароль сохранен', 'success');
      } else if (saveCheckbox.checked && !chatId) {
        showToast('Ошибка: ID чата не найден', 'error');
      }

      const method = 'metadata';
      stegoConfig = { secret, password, method };
      armBtn.textContent = '🛑 Отключить';
      armBtn.className = 'stego-btn stego-btn-danger';
      toggle.classList.add('armed');
      toggle.textContent = '🎯';
      statusDot.classList.add('active');
      statusText.textContent = `Активно! Записывайте ГС`;
      menu.classList.remove('show');
      showToast('Стего включено! Записывайте', 'success');
      console.log('[stego-ext] Stego armed for next voice message');
    };

    console.log('[stego-ext] Stego UI panel added');
  }

  
  function resetStegoUI() {
    
    stegoConfig = null;

    const armBtn = document.getElementById('stego-arm-btn');
    const toggle = document.getElementById('stego-toggle');
    const statusDot = document.getElementById('stego-status-dot');
    const statusText = document.getElementById('stego-status-text');
    const secretInput = document.getElementById('stego-secret');
    const passwordInput = document.getElementById('stego-password');

    if (armBtn) {
      armBtn.textContent = '🎯 Активировать';
      armBtn.className = 'stego-btn stego-btn-primary';
    }
    if (toggle) {
      toggle.classList.remove('armed');
      toggle.textContent = '🔐';
    }
    if (statusDot) {
      statusDot.classList.remove('active');
    }
    if (statusText) {
      statusText.textContent = 'Готов к работе';
    }
    if (secretInput) {
      secretInput.value = '';
    }
    
    const chatId = getCurrentChatId();
    const savedPassword = chatId ? getChatPassword(chatId) : null;
    if (passwordInput && !savedPassword) {
      passwordInput.value = '';
    }
  }

  
  function showToast(message, duration = 3000) {
    const existing = document.querySelector('.stego-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'stego-toast';
    toast.style.whiteSpace = 'pre-line'; 
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), duration);
  }

  
  function showDecodedMessage(message) {
    const overlay = document.createElement('div');
    overlay.className = 'stego-modal-overlay';
    overlay.innerHTML = `
      <div class="stego-modal">
        <div class="stego-modal-header">
          <div class="stego-modal-icon">🔓</div>
          <div class="stego-modal-title">Скрытое сообщение</div>
        </div>
        <div class="stego-modal-message">${escapeHtml(message)}</div>
        <button class="stego-modal-close">Закрыть</button>
      </div>
    `;
    document.body.appendChild(overlay);

    
    overlay.addEventListener('click', (e) => e.stopPropagation());
    overlay.addEventListener('mousedown', (e) => e.stopPropagation());
    overlay.addEventListener('keydown', (e) => e.stopPropagation());
    overlay.addEventListener('keyup', (e) => e.stopPropagation());

    overlay.querySelector('.stego-modal-close').onclick = (e) => {
      e.stopPropagation();
      overlay.remove();
    };
    overlay.onclick = (e) => {
      e.stopPropagation();
      if (e.target === overlay) overlay.remove();
    };
  }

  
  function promptPassword() {
    return new Promise((resolve) => {
      
      const chatId = getCurrentChatId();
      const savedPassword = chatId ? getChatPassword(chatId) : null;

      if (savedPassword) {
        
        showToast('Используется сохраненный пароль', 'success');
        resolve({ password: savedPassword, shouldSave: false, chatId });
        return;
      }

      const overlay = document.createElement('div');
      overlay.className = 'stego-modal-overlay stego-password-modal';
      overlay.innerHTML = `
        <div class="stego-modal">
          <div class="stego-modal-header">
            <div class="stego-modal-icon" style="background: #667eea;">🔑</div>
            <div class="stego-modal-title">Введите пароль</div>
          </div>
          <input type="password" class="stego-password-input" placeholder="Пароль..." autofocus>
          <div class="stego-save-password" style="margin-bottom: 16px; justify-content: center;">
            <input type="checkbox" id="stego-save-decode-checkbox" checked>
            <label for="stego-save-decode-checkbox">Запомнить для чата</label>
          </div>
          <div class="stego-modal-buttons">
            <button class="stego-btn" style="background: #f0f0f0; color: #333;">Отмена</button>
            <button class="stego-btn stego-btn-primary">Расшифровать</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      
      overlay.addEventListener('click', (e) => e.stopPropagation());
      overlay.addEventListener('mousedown', (e) => e.stopPropagation());
      overlay.addEventListener('keydown', (e) => e.stopPropagation());
      overlay.addEventListener('keyup', (e) => e.stopPropagation());
      overlay.addEventListener('keypress', (e) => e.stopPropagation());
      overlay.addEventListener('input', (e) => e.stopPropagation());

      const input = overlay.querySelector('.stego-password-input');
      const saveCheckbox = overlay.querySelector('#stego-save-decode-checkbox');
      const [cancelBtn, decodeBtn] = overlay.querySelectorAll('.stego-modal-buttons .stego-btn');

      const cleanup = (value) => {
        const shouldSave = value && saveCheckbox.checked && chatId;
        console.log('[stego-ext] Decode dialog: password entered, shouldSave:', shouldSave, 'chatId:', chatId);
        overlay.remove();
        if (value) {
          resolve({ password: value, shouldSave, chatId });
        } else {
          resolve(null);
        }
      };

      cancelBtn.onclick = (e) => { e.stopPropagation(); cleanup(null); };
      decodeBtn.onclick = (e) => { e.stopPropagation(); cleanup(input.value); };
      input.onkeydown = (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') cleanup(input.value);
        if (e.key === 'Escape') cleanup(null);
      };
      overlay.onclick = (e) => {
        e.stopPropagation();
        if (e.target === overlay) cleanup(null);
      };

      setTimeout(() => input.focus(), 100);
    });
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  
  if (document.body) createStegoUI();
  else document.addEventListener('DOMContentLoaded', createStegoUI);

  
  let pendingStegoBlob = null;
  let pendingStegoResolve = null;

  
  window.Blob = class PatchedBlob extends OriginalBlob {
    constructor(parts, options) {
      
      
      let isAudio = false;
      if (options && options.type === 'audio/ogg') {
        isAudio = true;
      } else if (parts && parts.length > 0) {
        
        const firstPart = parts[0];
        if (firstPart instanceof Uint8Array && firstPart.length >= 4) {
          if (firstPart[0] === 0x4F && firstPart[1] === 0x67 && firstPart[2] === 0x67 && firstPart[3] === 0x53) {
            isAudio = true;
            console.log('[stego-ext] Detected OGG by magic bytes (type was: ' + (options?.type || 'empty') + ')');
          }
        }
      }

      if (isAudio && parts && parts.length > 0) {
        const firstPart = parts[0];
        if (firstPart instanceof Uint8Array || firstPart instanceof ArrayBuffer) {
          console.log('[stego-ext] Intercepted audio/ogg Blob creation, parts:', parts.length, 'armed:', !!stegoConfig);

          if (stegoConfig) {
            const config = stegoConfig;
            stegoConfig = null; 

            
            const btn = document.getElementById('stego-arm-btn');
            if (btn) {
              btn.textContent = '⏳ Кодирование...';
              btn.style.background = '#ff9800';
            }

            
            super(parts, options);

            
            console.log('[stego-ext] Starting async stego encoding...');

            
            const originalBlob = new OriginalBlob(parts, options);
            const originalBlobSize = originalBlob.size; 

            
            const encodingPromise = new Promise((resolve, reject) => {
              (async () => {
                try {
                  const buffer = await originalBlob.arrayBuffer();
                  console.log('[stego-ext] Original OGG size:', buffer.byteLength);

                  
                  const pwDebug = config.password ? `${config.password.slice(0,2)}***${config.password.slice(-2)} (len=${config.password.length})` : '(empty)';
                  console.log('[stego-ext] ENCODE password debug:', pwDebug);
                  console.log('[stego-ext] ENCODE method:', config.method || 'metadata');

                  const encoded = await requestEncodeBuffer(buffer, config.secret, config.password, config.method || 'metadata');
                  console.log('[stego-ext] Encoded result size:', encoded.byteLength);

                  
                  const encHash = await crypto.subtle.digest('SHA-256', encoded);
                  const encHashHex = Array.from(new Uint8Array(encHash)).map(b => b.toString(16).padStart(2, '0')).join('');
                  console.log('[stego-ext] ENCODED DATA SHA-256:', encHashHex);

                  resolve(encoded);
                } catch (err) {
                  console.error('[stego-ext] Encoding failed:', err);
                  reject(err);
                }
              })();
            });

            
            this._stegoEncodingPromise = encodingPromise;
            this._stegoConfig = config;
            this._originalBlobSize = originalBlobSize;

            
            const originalArrayBuffer = this.arrayBuffer.bind(this);
            this.arrayBuffer = async () => {
              try {
                console.log('[stego-ext] Blob.arrayBuffer() called, waiting for encoding...');
                const encoded = await this._stegoEncodingPromise;
                console.log('[stego-ext] Returning encoded data from arrayBuffer(), size:', encoded.byteLength);

                
                const btn = document.getElementById('stego-arm-btn');
                if (btn) {
                  btn.textContent = '✅ Готово!';
                  btn.style.background = '#4caf50';
                  setTimeout(() => {
                    btn.textContent = '🎯 Активировать';
                    btn.style.background = '#5288c1';
                  }, 2000);
                }
                showToast('✅ Сообщение скрыто!', 'success');

                
                window.__lastEncodedData = {
                  buffer: encoded,
                  size: encoded.byteLength,
                  timestamp: Date.now()
                };

                return encoded;
              } catch (err) {
                console.error('[stego-ext] Encoding failed in arrayBuffer():', err);
                const btn = document.getElementById('stego-arm-btn');
                if (btn) {
                  btn.textContent = '❌ Ошибка';
                  btn.style.background = '#f44336';
                  setTimeout(() => {
                    btn.textContent = '🎯 Активировать';
                    btn.style.background = '#5288c1';
                  }, 2000);
                }
                
                return originalArrayBuffer();
              }
            };

            
            const origSlice = this.slice.bind(this);
            const selfBlob = this;
            this.slice = (start, end, contentType) => {
              console.log('[stego-ext] Blob.slice() called on stego blob - deferring to encoded data');
              
              const wrapperBlob = {
                _stegoEncodingPromise: selfBlob._stegoEncodingPromise,
                _sliceStart: start,
                _sliceEnd: end,
                arrayBuffer: async function() {
                  const encoded = await selfBlob._stegoEncodingPromise;
                  const s = this._sliceStart || 0;
                  const e = this._sliceEnd || encoded.byteLength;
                  console.log('[stego-ext] Sliced blob.arrayBuffer() returning slice', s, '-', e);
                  return encoded.slice(s, e);
                }
              };
              return wrapperBlob;
            };

            
            this.stream = () => {
              console.log('[stego-ext] Blob.stream() called - creating async stream from encoded data');
              const encodingPromise = this._stegoEncodingPromise;
              return new ReadableStream({
                async start(controller) {
                  try {
                    const encoded = await encodingPromise;
                    console.log('[stego-ext] Blob.stream() got encoded data, size:', encoded.byteLength);
                    controller.enqueue(new Uint8Array(encoded));
                    controller.close();
                  } catch (err) {
                    console.error('[stego-ext] Blob.stream() error:', err);
                    controller.error(err);
                  }
                }
              });
            };

            
            encodingPromise.then(encoded => {
              console.log('[stego-ext] Background encoding complete, size:', encoded.byteLength);

              
              if (window.__stegoSetEncodedBuffer) {
                window.__stegoSetEncodedBuffer(encoded, originalBlobSize);
              }

              
              pendingStegoBlob = new OriginalBlob([encoded], {
                type: config.method === 'audio' ? 'audio/wav' : 'audio/ogg'
              });
              console.log('[stego-ext] Encoded blob ready, type:', pendingStegoBlob.type, 'size:', pendingStegoBlob.size);

              if (pendingStegoResolve) {
                pendingStegoResolve(pendingStegoBlob);
                pendingStegoResolve = null;
              }
            }).catch(err => {
              console.error('[stego-ext] Background encoding error:', err);
            });

            console.log('[stego-ext] Blob created with encoding hook attached');
            return;
          }
        }
      }
      super(parts, options);
    }
  };
  console.log('[stego-ext] Blob constructor hooked with arrayBuffer override');

  
  window.__stegoGetEncodedBlob = function() {
    if (pendingStegoBlob) {
      const blob = pendingStegoBlob;
      pendingStegoBlob = null;
      return Promise.resolve(blob);
    }
    return new Promise(resolve => {
      pendingStegoResolve = resolve;
    });
  };

  
  const OriginalFile = window.File;

  
  window.File = class PatchedFile extends OriginalFile {
    constructor(parts, name, options) {
      
      if (parts && parts.length > 0) {
        for (const part of parts) {
          
          if (part && part._stegoEncodingPromise) {
            console.log('[stego-ext] File constructor received blob with encoding promise! name:', name);
            super(parts, name, options);

            
            this._stegoEncodingPromise = part._stegoEncodingPromise;
            this._stegoConfig = part._stegoConfig;
            this._originalBlobSize = part._originalBlobSize;

            
            const originalArrayBuffer = this.arrayBuffer.bind(this);
            this.arrayBuffer = async () => {
              try {
                console.log('[stego-ext] File.arrayBuffer() called, waiting for encoding...');
                const encoded = await this._stegoEncodingPromise;
                console.log('[stego-ext] Returning encoded data from File.arrayBuffer(), size:', encoded.byteLength);
                return encoded;
              } catch (err) {
                console.error('[stego-ext] Encoding failed in File.arrayBuffer():', err);
                return originalArrayBuffer();
              }
            };

            console.log('[stego-ext] File marked with encoding hook');
            return;
          }
          
          if (part instanceof OriginalBlob && part._stegoConfig) {
            console.log('[stego-ext] File constructor received stego-marked blob! name:', name);
            super(parts, name, options);
            this._stegoConfig = part._stegoConfig;
            this._stegoBlob = part;
            console.log('[stego-ext] File marked for stego encoding');
            return;
          }
        }
      }
      super(parts, name, options);
    }
  };
  console.log('[stego-ext] File constructor hooked');

  
  let stegoEncodedBuffer = null;
  let stegoOriginalSize = null;

  
  window.__stegoSetEncodedBuffer = function(buffer, originalSize) {
    stegoEncodedBuffer = buffer;
    stegoOriginalSize = originalSize;
    console.log('[stego-ext] Encoded buffer stored, original size:', originalSize, 'encoded size:', buffer.byteLength);
  };

  
  const origWorkerPostMessage = Worker.prototype.postMessage;
  Worker.prototype.postMessage = function patchedWorkerPostMessage(message, transfer) {
    
    if (message && typeof message === 'object') {
      const keys = Object.keys(message);
      if (keys.some(k => ['blob', 'file', 'buffer', 'bytes', 'data', 'payload'].includes(k.toLowerCase()))) {
        console.log('[stego-ext] Worker.postMessage with interesting payload:', keys);
      }
      
      for (const key of keys) {
        const val = message[key];
        if (val instanceof OriginalBlob && val._stegoConfig) {
          console.log('[stego-ext] Worker.postMessage contains stego-marked blob at key:', key);
        }
        if (val instanceof ArrayBuffer && val.byteLength > 1000) {
          console.log('[stego-ext] Worker.postMessage contains ArrayBuffer size:', val.byteLength, 'key:', key);
        }
      }
    }
    return origWorkerPostMessage.call(this, message, transfer);
  };
  console.log('[stego-ext] Worker.postMessage hooked');

  
  async function processMessagePayload(message) {
    if (!message || typeof message !== 'object') return false;
    let modified = false;

    
    async function traverse(obj) {
        if (!obj || typeof obj !== 'object') return;

        for (const key in obj) {
            const val = obj[key];

            
            if (val instanceof Blob && val._stegoEncodingPromise) {
                console.log('[stego-ext] Found stego-marked blob at', key);
                try {
                    
                    const buffer = await val._stegoEncodingPromise;

                    
                    const newBlob = new OriginalBlob([buffer], { type: val.type });

                    
                    obj[key] = newBlob;
                    modified = true;

                    console.log('[stego-ext] Replaced blob with encoded version. Size:', newBlob.size);

                    
                    const encodedBlobUrl = URL.createObjectURL(newBlob);
                    recentlyEncodedBlobMap.set('last-encoded', {
                        url: encodedBlobUrl,
                        size: newBlob.size,
                        timestamp: Date.now()
                    });
                } catch (e) {
                    console.error('[stego-ext] Error awaiting stego blob', e);
                }
            } else if (val && typeof val === 'object' && !(val instanceof ArrayBuffer)) {
                
                await traverse(val);
            }
        }
    }

    await traverse(message);
    return modified;
  }

  
  const origMessagePortPostMessage = MessagePort.prototype.postMessage;
  MessagePort.prototype.postMessage = function(message, transfer) {
      const port = this;
      const args = arguments;

      if (message && typeof message === 'object') {
          
          processMessagePayload(message).then((wasModified) => {
              if (wasModified) {
                  console.log('[stego-ext] Message modified with stego blob, sending now.');
                  showToast('✨ Секретное сообщение отправлено!', 'success');

                  
                  resetStegoUI();
              }

              
              
              const msgStr = JSON.stringify(message);
              if (msgStr.includes('"name":"message_sent"')) {
                 
                 resetStegoUI();
              }

              
              origMessagePortPostMessage.apply(port, args);
          }).catch(err => {
              console.error('[stego-ext] Error processing message payload:', err);
              origMessagePortPostMessage.apply(port, args);
          });

          
          return;
      }

      return origMessagePortPostMessage.apply(this, args);
  };
  console.log('[stego-ext] MessagePort.postMessage hooked (Async version)');

  
  const documentBlobMap = new Map(); 

  
  const messageToDocumentMap = new Map(); 

  
  const recentlyEncodedBlobMap = new Map(); 

  
  const origMessagePortAddEventListener = MessagePort.prototype.addEventListener;
  MessagePort.prototype.addEventListener = function(type, listener, options) {
    if (type === 'message') {
      const wrappedListener = function(event) {
        
        if (event.data && typeof event.data === 'object') {
          try {
            
            const dataStr = JSON.stringify(event.data);

            
            if (dataStr.includes('"name":"message_sent"')) {
               
               resetStegoUI();
            }

            
            const docMatch = dataStr.match(/"key":"document(\d+)[^"]*","value":\{"downloaded":(\d+),"url":"(blob:[^"]+)"/g);
            if (docMatch) {
              for (const match of docMatch) {
                const parts = match.match(/"key":"document(\d+)[^"]*","value":\{"downloaded":(\d+),"url":"(blob:[^"]+)"/);
                if (parts) {
                  const [, docId, size, url] = parts;
                  documentBlobMap.set(docId, { url, size: parseInt(size), timestamp: Date.now() });
                  console.log('[stego-ext] Mapped document', docId, '->', url, 'size:', size);

                  
                  if (documentBlobMap.size > 100) {
                    const oldest = documentBlobMap.keys().next().value;
                    documentBlobMap.delete(oldest);
                  }
                }
              }
            }

            
            
            
            let foundMappings = false;

            
            
            const midPattern = /"mid":(\d+)/g;
            let midMatch;
            while ((midMatch = midPattern.exec(dataStr)) !== null) {
              const mid = midMatch[1];
              const midPos = midMatch.index;

              
              const searchArea = dataStr.substring(midPos, midPos + 2000);

              
              const docIdMatch = searchArea.match(/"id":"?(\d{15,})"?/);
              if (docIdMatch) {
                const docId = docIdMatch[1];
                if (!messageToDocumentMap.has(mid)) {
                  messageToDocumentMap.set(mid, docId);
                  foundMappings = true;
                }
              }
            }
          } catch (e) {
            
          }
        }
        return listener.call(this, event);
      };
      return origMessagePortAddEventListener.call(this, type, wrappedListener, options);
    }
    return origMessagePortAddEventListener.call(this, type, listener, options);
  };

  
  window.__stegoDocumentMap = documentBlobMap;
  window.__stegoMsgToDocMap = messageToDocumentMap;

  
  const blobUrlMap = new Map(); 

  
  const origCreateObjectURL = URL.createObjectURL;
  URL.createObjectURL = function patchedCreateObjectURL(obj) {
    const url = origCreateObjectURL.call(this, obj);
    if (obj instanceof Blob) {
      
      blobUrlMap.set(url, {
        size: obj.size,
        type: obj.type,
        timestamp: Date.now()
      });
      console.log('[stego-ext] createObjectURL:', url, 'size:', obj.size, 'type:', obj.type);

      
      if (blobUrlMap.size > 50) {
        const oldest = blobUrlMap.keys().next().value;
        blobUrlMap.delete(oldest);
      }
    }
    return url;
  };

  
  const audioSrcHistory = []; 

  
  const audioSrcDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
  if (audioSrcDescriptor && audioSrcDescriptor.set) {
    const originalSrcSetter = audioSrcDescriptor.set;
    Object.defineProperty(HTMLMediaElement.prototype, 'src', {
      ...audioSrcDescriptor,
      set: function(value) {
        if (value && value.startsWith('blob:') && this.tagName === 'AUDIO') {
          audioSrcHistory.push({ url: value, timestamp: Date.now(), element: this });
          
          if (audioSrcHistory.length > 30) audioSrcHistory.shift();
        }
        return originalSrcSetter.call(this, value);
      }
    });
    console.log('[stego-ext] HTMLMediaElement.src setter hooked');
  }

  
  const origSetAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function(name, value) {
    if (name === 'src' && value && value.startsWith && value.startsWith('blob:') && this.tagName === 'AUDIO') {
      console.log('[stego-ext] Audio setAttribute src:', value);
      audioSrcHistory.push({ url: value, timestamp: Date.now(), element: this });
      if (audioSrcHistory.length > 30) audioSrcHistory.shift();
    }
    return origSetAttribute.call(this, name, value);
  };

  
  const audioSrcObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
        const audio = mutation.target;
        if (audio.src && audio.src.startsWith('blob:')) {
          audioSrcHistory.push({ url: audio.src, timestamp: Date.now() });
          
          if (audioSrcHistory.length > 20) audioSrcHistory.shift();
        }
      }
    }
  });

  
  function observeAudioElements() {
    document.querySelectorAll('audio').forEach(audio => {
      audioSrcObserver.observe(audio, { attributes: true, attributeFilter: ['src'] });
    });
  }

  
  const audioElementObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeName === 'AUDIO') {
          audioSrcObserver.observe(node, { attributes: true, attributeFilter: ['src'] });
          console.log('[stego-ext] Now observing new audio element');
        } else if (node.querySelectorAll) {
          node.querySelectorAll('audio').forEach(audio => {
            audioSrcObserver.observe(audio, { attributes: true, attributeFilter: ['src'] });
          });
        }
      }
    }
  });

  
  if (document.body) {
    observeAudioElements();
    audioElementObserver.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      observeAudioElements();
      audioElementObserver.observe(document.body, { childList: true, subtree: true });
    });
  }

  
  window.__stegoBlobUrls = blobUrlMap;
  window.__stegoAudioHistory = audioSrcHistory;

  
  const origFileReaderReadAsArrayBuffer = FileReader.prototype.readAsArrayBuffer;
  FileReader.prototype.readAsArrayBuffer = function patchedReadAsArrayBuffer(blob) {
    
    if (blob && blob._stegoEncodingPromise) {
      console.log('[stego-ext] FileReader.readAsArrayBuffer on blob with encoding promise - INTERCEPTING!');
      const reader = this;

      (async () => {
        try {
          const encoded = await blob._stegoEncodingPromise;
          console.log('[stego-ext] FileReader: Got encoded data, size:', encoded.byteLength);

          
          Object.defineProperty(reader, 'result', { value: encoded, writable: false, configurable: true });
          Object.defineProperty(reader, 'readyState', { value: FileReader.DONE, writable: false, configurable: true });
          if (reader.onload) reader.onload({ target: reader });
          if (reader.onloadend) reader.onloadend({ target: reader });
        } catch (err) {
          console.error('[stego-ext] FileReader encoding promise failed:', err);
          
          origFileReaderReadAsArrayBuffer.call(reader, blob);
        }
      })();
      return;
    }

    
    if (blob instanceof Blob && blob._stegoConfig) {
      console.log('[stego-ext] FileReader.readAsArrayBuffer on stego-marked blob - INTERCEPTING!');
      const { secret, password } = blob._stegoConfig;
      const reader = this;

      
      const tempReader = new FileReader();
      tempReader.onload = async () => {
        try {
          const originalBuffer = tempReader.result;
          console.log('[stego-ext] FileReader: Original blob size:', originalBuffer.byteLength);

          
          const encoded = await requestEncodeBuffer(originalBuffer, secret, password);
          console.log('[stego-ext] FileReader: Encoded result size:', encoded.byteLength);

          
          Object.defineProperty(reader, 'result', { value: encoded, writable: false, configurable: true });
          Object.defineProperty(reader, 'readyState', { value: FileReader.DONE, writable: false, configurable: true });
          if (reader.onload) reader.onload({ target: reader });
          if (reader.onloadend) reader.onloadend({ target: reader });
        } catch (err) {
          console.error('[stego-ext] FileReader encode failed:', err);
          
          return origFileReaderReadAsArrayBuffer.call(reader, blob);
        }
      };
      tempReader.onerror = () => {
        console.error('[stego-ext] FileReader temp read failed');
        return origFileReaderReadAsArrayBuffer.call(reader, blob);
      };
      tempReader.readAsArrayBuffer(new OriginalBlob([blob], { type: blob.type }));
      return;
    }
    return origFileReaderReadAsArrayBuffer.call(this, blob);
  };

  
  const origBlobSlice = OriginalBlob.prototype.slice;
  OriginalBlob.prototype.slice = function patchedSlice(...args) {
    const sliced = origBlobSlice.apply(this, args);
    if (this._stegoConfig) {
      console.log('[stego-ext] blob.slice() on stego-marked blob, propagating config');
      sliced._stegoConfig = this._stegoConfig;
    }
    return sliced;
  };

  
  const origBlobStream = OriginalBlob.prototype.stream;
  if (origBlobStream) {
    OriginalBlob.prototype.stream = function patchedStream() {
      if (this._stegoConfig) {
        console.log('[stego-ext] blob.stream() on stego-marked blob');
      }
      return origBlobStream.call(this);
    };
  }

  
  const origBlobText = OriginalBlob.prototype.text;
  if (origBlobText) {
    OriginalBlob.prototype.text = async function patchedText() {
      if (this._stegoConfig) {
        console.log('[stego-ext] blob.text() on stego-marked blob');
      }
      return origBlobText.call(this);
    };
  }

  
  const origBlobArrayBuffer = OriginalBlob.prototype.arrayBuffer;
  OriginalBlob.prototype.arrayBuffer = async function patchedArrayBuffer() {
    if (this._stegoConfig) {
      console.log('[stego-ext] blob.arrayBuffer() on stego-marked blob - encoding now!');
      const { secret, password } = this._stegoConfig;
      try {
        
        const originalBuffer = await origBlobArrayBuffer.call(this);
        console.log('[stego-ext] Original blob size:', originalBuffer.byteLength);

        
        const encoded = await requestEncodeBuffer(originalBuffer, secret, password);
        console.log('[stego-ext] Encoded result size:', encoded.byteLength);
        return encoded;
      } catch (err) {
        console.error('[stego-ext] Stego encode failed:', err);
        return origBlobArrayBuffer.call(this);
      }
    }
    return origBlobArrayBuffer.call(this);
  };

  
  const origFileArrayBuffer = OriginalFile.prototype.arrayBuffer;
  if (origFileArrayBuffer) {
    OriginalFile.prototype.arrayBuffer = async function patchedFileArrayBuffer() {
      if (this._stegoConfig) {
        console.log('[stego-ext] File.arrayBuffer() on stego-marked file - encoding now!');
        const { secret, password } = this._stegoConfig;
        try {
          const originalBuffer = await origFileArrayBuffer.call(this);
          console.log('[stego-ext] Original file size:', originalBuffer.byteLength);
          const encoded = await requestEncodeBuffer(originalBuffer, secret, password);
          console.log('[stego-ext] Encoded file result size:', encoded.byteLength);
          return encoded;
        } catch (err) {
          console.error('[stego-ext] File stego encode failed:', err);
          return origFileArrayBuffer.call(this);
        }
      }
      return origFileArrayBuffer.call(this);
    };
    console.log('[stego-ext] File.prototype.arrayBuffer hooked');
  }

  
  const OriginalFormData = window.FormData;
  const origFormDataAppend = OriginalFormData.prototype.append;
  const origFormDataSet = OriginalFormData.prototype.set;

  OriginalFormData.prototype.append = function patchedAppend(name, value, filename) {
    if (value instanceof OriginalBlob && value._stegoConfig) {
      console.log('[stego-ext] FormData.append with stego-marked blob, name:', name);
    }
    return origFormDataAppend.call(this, name, value, filename);
  };

  OriginalFormData.prototype.set = function patchedSet(name, value, filename) {
    if (value instanceof OriginalBlob && value._stegoConfig) {
      console.log('[stego-ext] FormData.set with stego-marked blob, name:', name);
    }
    return origFormDataSet.call(this, name, value, filename);
  };
  console.log('[stego-ext] FormData hooked');

  
  function requestEncodeBuffer(buffer, secret, password, method = 'metadata') {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject, isBuffer: true });
      
      const uint8 = new Uint8Array(buffer);
      const clone = uint8.slice().buffer;
      window.postMessage({
        __stegoRequest: true,
        action: 'encodeBuffer',
        id,
        buffer: clone,
        secret,
        password,
        method
      }, '*', [clone]);
    });
  }

  
  function requestDecodeBuffer(buffer, password, meta = {}) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject, isDecode: true });
      
      const uint8 = new Uint8Array(buffer);
      const clone = uint8.slice().buffer;
      window.postMessage({
        __stegoRequest: true,
        action: 'decodeBuffer',
        id,
        buffer: clone,
        password,
        docId: meta.docId,
        msgId: meta.msgId,
        msgTimestamp: meta.msgTimestamp
      }, '*', [clone]);
    });
  }

  
  

  
  
  const MIN_STEGO_FILE_SIZE = 40000;

  function addDecodeButtonToVoice(voiceElement) {
    
    if (voiceElement.querySelector('.stego-decode-btn')) return;

    
    const msgBubble = voiceElement.closest('.bubble, .message, [class*="bubble"], [data-mid]');
    const msgId = msgBubble?.dataset?.mid || msgBubble?.getAttribute('data-mid');

    
    let docId = voiceElement.dataset?.docId ||
                voiceElement.getAttribute('data-doc-id') ||
                msgBubble?.dataset?.docId ||
                msgBubble?.getAttribute('data-doc-id');

    
    if (!docId && msgId && messageToDocumentMap.has(msgId)) {
      docId = messageToDocumentMap.get(msgId);
    }

    
    const lastEncodedInfo = recentlyEncodedBlobMap.get('last-encoded');
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const msgTimestamp = msgBubble?.dataset?.timestamp ? parseInt(msgBubble.dataset.timestamp) * 1000 : 0;
    const isRecentMsg = msgTimestamp && (Date.now() - msgTimestamp < 2 * 60 * 1000);
    const isOurRecentlyEncoded = lastEncodedInfo && lastEncodedInfo.timestamp > fiveMinutesAgo && isRecentMsg;

    
    

    const btn = document.createElement('button');
    btn.className = 'stego-decode-btn';
    btn.textContent = '🔓';
    btn.title = 'Расшифровать сообщение';

    btn.onclick = async (e) => {
      e.stopPropagation();
      e.preventDefault();

      const passwordResult = await promptPassword();
      if (!passwordResult) return;

      const { password, shouldSave, chatId } = passwordResult;

      btn.textContent = '⏳';
      btn.disabled = true;

      try {
        
        

        
        let documentId = docId;

        
        const audioInner = msgBubble?.querySelector('audio, [data-doc-id], .audio');
        if (!documentId && audioInner) {
          documentId = audioInner.dataset?.docId || audioInner.getAttribute('data-doc-id');
        }

        
        if (!documentId && msgId && messageToDocumentMap.has(msgId)) {
          documentId = messageToDocumentMap.get(msgId);
          console.log('[stego-ext] Found document ID from message map:', documentId);
        }

        
        if (!documentId && msgId) {
          console.log('[stego-ext] WARNING: No document ID found for message', msgId);
          console.log('[stego-ext] messageToDocumentMap has keys:', Array.from(messageToDocumentMap.keys()).slice(-20));
        }

        
        let bubbleAudio = msgBubble?.querySelector('audio');
        let bubbleAudioSrc = bubbleAudio?.src;

        console.log('[stego-ext] Voice message bubble:', msgBubble);
        console.log('[stego-ext] Message ID:', msgId);
        console.log('[stego-ext] Document ID:', documentId);
        console.log('[stego-ext] messageToDocumentMap size:', messageToDocumentMap.size);
        console.log('[stego-ext] Audio inside bubble:', bubbleAudio, 'src:', bubbleAudioSrc);
        console.log('[stego-ext] Available document mappings:', documentBlobMap.size, 'entries');

        
        if (documentId && isOurRecentlyEncoded) {
          window.postMessage({
            __stegoRequest: true,
            action: 'linkLastEncodedToDoc',
            docId: documentId
          }, '*');
        }

        
        if (documentId && !documentBlobMap.has(documentId)) {
          console.log('[stego-ext] WARNING: Document ID found but no blob URL cached');
          console.log('[stego-ext] documentBlobMap has keys:', Array.from(documentBlobMap.keys()).slice(-20));
        }

        let audioUrl = null;
        let useRecentlyEncoded = false;

        
        
        

        console.log('[stego-ext] isRecentMessage:', isRecentMsg, 'msgTimestamp:', msgTimestamp, 'age:', Date.now() - msgTimestamp, 'ms');

        if (lastEncodedInfo && lastEncodedInfo.timestamp > fiveMinutesAgo && isRecentMsg) {
          
          
          audioUrl = lastEncodedInfo.url;
          useRecentlyEncoded = true;
          console.log('[stego-ext] Using recently encoded blob (just sent), our size:', lastEncodedInfo.size, 'url:', audioUrl);

          
          if (documentId && documentBlobMap.has(documentId)) {
            const telegramInfo = documentBlobMap.get(documentId);
            console.log('[stego-ext] Telegram re-encoded to size:', telegramInfo.size, 'vs our:', lastEncodedInfo.size);
          }
        }

        
        if (!audioUrl && bubbleAudioSrc && bubbleAudioSrc.startsWith('blob:')) {
          audioUrl = bubbleAudioSrc;
          console.log('[stego-ext] Found audio.src inside bubble:', audioUrl);
        }

        
        if (!audioUrl && documentId && documentBlobMap.has(documentId)) {
          const info = documentBlobMap.get(documentId);
          audioUrl = info.url;
          console.log('[stego-ext] Found blob URL from documentBlobMap:', audioUrl);
        }

        
        if (!audioUrl) {
          console.log('[stego-ext] No cached URL, clicking play to trigger download...');

          
          const playSelectors = [
            '.audio-play-icon',
            '.audio-toggle',
            '.Audio-play',
            '.audio-play',
            '[class*="play"]'
          ];

          let playBtn = null;
          for (const sel of playSelectors) {
            playBtn = voiceElement.querySelector(sel) || msgBubble?.querySelector(sel);
            if (playBtn) break;
          }

          if (!playBtn) {
            playBtn = voiceElement.querySelector('canvas, [class*="waveform"]') || voiceElement;
          }

          
          console.log('[stego-ext] All audio elements before click:');
          document.querySelectorAll('audio').forEach((a, i) => {
            console.log(`  [${i}] src:`, a.src, 'paused:', a.paused);
          });

          
          const historyLenBefore = audioSrcHistory.length;

          
          let playedAudioUrl = null;
          const playHandlers = [];
          document.querySelectorAll('audio').forEach(audio => {
            const handler = () => {
              if (audio.src && audio.src.startsWith('blob:')) {
                playedAudioUrl = audio.src;
                console.log('[stego-ext] Audio started playing:', audio.src);
              }
            };
            audio.addEventListener('play', handler, { once: true });
            playHandlers.push({ audio, handler });
          });

          console.log('[stego-ext] Clicking play button:', playBtn);
          playBtn.click();

          
          const startTime = Date.now();

          audioUrl = await new Promise((resolve, reject) => {
            const checkInterval = setInterval(() => {
              
              if (playedAudioUrl) {
                clearInterval(checkInterval);
                
                playHandlers.forEach(({audio, handler}) => audio.removeEventListener('play', handler));
                console.log('[stego-ext] Got playing audio URL:', playedAudioUrl);
                resolve(playedAudioUrl);
                return;
              }

              
              if (audioSrcHistory.length > historyLenBefore) {
                const newest = audioSrcHistory[audioSrcHistory.length - 1];
                if (newest.timestamp > startTime) {
                  clearInterval(checkInterval);
                  playHandlers.forEach(({audio, handler}) => audio.removeEventListener('play', handler));
                  console.log('[stego-ext] New audio src from hook:', newest.url);
                  resolve(newest.url);
                  return;
                }
              }

              
              const currentBubbleAudio = msgBubble?.querySelector('audio');
              if (currentBubbleAudio && currentBubbleAudio.src && currentBubbleAudio.src.startsWith('blob:')) {
                clearInterval(checkInterval);
                playHandlers.forEach(({audio, handler}) => audio.removeEventListener('play', handler));
                console.log('[stego-ext] Bubble has audio:', currentBubbleAudio.src);
                resolve(currentBubbleAudio.src);
                return;
              }

              
              if (Date.now() - startTime > 5000) {
                clearInterval(checkInterval);
                playHandlers.forEach(({audio, handler}) => audio.removeEventListener('play', handler));

                
                console.log('[stego-ext] Timeout! All audio elements:');
                document.querySelectorAll('audio').forEach((a, i) => {
                  console.log(`  [${i}] src:`, a.src, 'paused:', a.paused);
                });

                
                const playingAudio = Array.from(document.querySelectorAll('audio')).find(a => !a.paused && a.src.startsWith('blob:'));
                if (playingAudio) {
                  console.log('[stego-ext] Found currently playing audio:', playingAudio.src);
                  resolve(playingAudio.src);
                  return;
                }

                
                const anyAudio = document.querySelector('audio[src^="blob:"]');
                if (anyAudio) {
                  console.log('[stego-ext] Using any audio with blob src:', anyAudio.src);
                  resolve(anyAudio.src);
                } else {
                  reject(new Error('Timeout: no audio loaded for this message'));
                }
              }
            }, 100);
          });
        }

        if (!audioUrl) {
          throw new Error('Could not find audio URL');
        }

        console.log('[stego-ext] Fetching audio from:', audioUrl);

        
        const response = await fetch(audioUrl);
        const buffer = await response.arrayBuffer();
        console.log('[stego-ext] Fetched audio, size:', buffer.byteLength);

        
        const recvHash = await crypto.subtle.digest('SHA-256', buffer);
        const recvHashHex = Array.from(new Uint8Array(recvHash)).map(b => b.toString(16).padStart(2, '0')).join('');
        console.log('[stego-ext] RECEIVED FILE SHA-256:', recvHashHex);
        console.log('[stego-ext] RECEIVED FILE size:', buffer.byteLength);

        
        if (window.__lastSentOggHash) {
          console.log('[stego-ext] SENT OGG SHA-256:', window.__lastSentOggHash);
          console.log('[stego-ext] SENT OGG size:', window.__lastSentOggSize);
          console.log('[stego-ext] HASHES MATCH:', recvHashHex === window.__lastSentOggHash);
        }
        if (window.__lastSentEncodedHash) {
          console.log('[stego-ext] SENT ENCODED SHA-256:', window.__lastSentEncodedHash);
          console.log('[stego-ext] ENCODED HASH MATCH:', recvHashHex === window.__lastSentEncodedHash);
        }

        
        const pwDebug = password ? `${password.slice(0,2)}***${password.slice(-2)} (len=${password.length})` : '(empty)';
        console.log('[stego-ext] DECODE password debug:', pwDebug);

        
        if (window.__lastEncodedData && (Date.now() - window.__lastEncodedData.timestamp < 60000)) {
          const storedPwDebug = window.__lastEncodedData.password ? `${window.__lastEncodedData.password.slice(0,2)}***${window.__lastEncodedData.password.slice(-2)} (len=${window.__lastEncodedData.password.length})` : '(empty)';
          console.log('[stego-ext] Last encoded password debug:', storedPwDebug);
        }

        
        const message = await requestDecodeBuffer(buffer, password, {
          docId: documentId,
          msgId,
          msgTimestamp
        });

        if (message) {
          btn.textContent = '✅';
          showDecodedMessage(message);

          
          if (shouldSave && chatId) {
            saveChatPassword(chatId, password);
            console.log('[stego-ext] Password saved after successful decode for chat:', chatId);
            showToast('Пароль сохранен', 'success');
          }
        } else {
          btn.textContent = '❌';
          showToast('Скрытое сообщение не найдено', 'error');
        }
      } catch (err) {
        console.error('[stego-ext] Decode failed:', err);
        btn.textContent = '❌';
        showToast('Ошибка: ' + err.message, 'error');
      } finally {
        btn.disabled = false;
        setTimeout(() => { btn.textContent = '🔓'; }, 2000);
      }
    };

    
    const style = window.getComputedStyle(voiceElement);
    if (style.position === 'static') {
      voiceElement.style.position = 'relative';
    }

    voiceElement.appendChild(btn);
  }

  
  function setupVoiceMessageObserver() {
    const addButtonsToVoiceMessages = () => {
      
      const voiceSelectors = [
        '.Audio',
        '.voice-message',
        '[class*="AudioPlayer"]',
        '.audio-wrapper',
        '.media-voice',
        '[class*="Voice"]',
        '.message-voice'
      ];

      for (const selector of voiceSelectors) {
        document.querySelectorAll(selector).forEach(el => {
          
          if (el.querySelector('audio') || el.querySelector('[class*="waveform"]') || el.querySelector('canvas')) {
            addDecodeButtonToVoice(el);
          }
        });
      }

      
      const documentSelectors = [
        '.document',
        '.Document',
        '[class*="document"]',
        '.file-attachment',
        '.audio-attachment'
      ];

      for (const selector of documentSelectors) {
        document.querySelectorAll(selector).forEach(el => {
          
          const filename = el.querySelector('.document-name, .file-name, [class*="FileName"]')?.textContent || '';
          if (filename.toLowerCase().includes('.wav') || filename.toLowerCase().includes('stego')) {
            addDecodeButtonToDocument(el, filename);
          }
        });
      }
    };

    
    function addDecodeButtonToDocument(docElement, filename) {
      if (docElement.querySelector('.stego-decode-btn')) return;

      const msgBubble = docElement.closest('.bubble, .message, [class*="bubble"], [data-mid]');
      const msgId = msgBubble?.dataset?.mid || msgBubble?.getAttribute('data-mid');
      const msgTimestamp = msgBubble?.dataset?.timestamp ? parseInt(msgBubble.dataset.timestamp) * 1000 : 0;
      const documentId = docElement.dataset?.docId ||
                         docElement.getAttribute('data-doc-id') ||
                         msgBubble?.dataset?.docId ||
                         msgBubble?.getAttribute('data-doc-id');

      const btn = document.createElement('button');
      btn.className = 'stego-decode-btn';
      btn.textContent = '🔓';
      btn.title = 'Расшифровать сообщение из ' + filename;

      btn.onclick = async (e) => {
        e.stopPropagation();
        e.preventDefault();

        const passwordResult = await promptPassword();
        if (!passwordResult) return;

        const { password, shouldSave, chatId } = passwordResult;

        btn.textContent = '⏳';
        btn.disabled = true;

        try {
          
          const downloadLink = docElement.querySelector('a[download], a[href*="blob:"], a[href*="document"]');
          let audioUrl = downloadLink?.href;

          if (!audioUrl) {
            
            const clickable = docElement.querySelector('.document-download, .download-button, [class*="Download"]');
            if (clickable) {
              console.log('[stego-ext] Clicking document to trigger download...');
              clickable.click();

              
              await new Promise((resolve, reject) => {
                let attempts = 0;
                const check = setInterval(() => {
                  const link = docElement.querySelector('a[href*="blob:"]');
                  if (link?.href) {
                    audioUrl = link.href;
                    clearInterval(check);
                    resolve();
                  }
                  if (++attempts > 50) {
                    clearInterval(check);
                    reject(new Error('Таймаут загрузки документа'));
                  }
                }, 100);
              });
            }
          }

          if (!audioUrl) {
            throw new Error('URL не найден');
          }

          console.log('[stego-ext] Fetching document from:', audioUrl);
          const response = await fetch(audioUrl);
          const buffer = await response.arrayBuffer();
          console.log('[stego-ext] Fetched document, size:', buffer.byteLength);

          const message = await requestDecodeBuffer(buffer, password, {
            docId: documentId,
            msgId,
            msgTimestamp
          });

          if (message) {
            btn.textContent = '✅';
            showDecodedMessage(message);

            if (shouldSave && chatId) {
              saveChatPassword(chatId, password);
              showToast('Пароль сохранен', 'success');
            }
          } else {
            btn.textContent = '❌';
            showToast('Сообщение не найдено', 'error');
          }
        } catch (err) {
          console.error('[stego-ext] Document decode failed:', err);
          btn.textContent = '❌';
          showToast('Ошибка: ' + err.message, 'error');
        } finally {
          btn.disabled = false;
          setTimeout(() => { btn.textContent = '🔓'; }, 2000);
        }
      };

      const style = window.getComputedStyle(docElement);
      if (style.position === 'static') {
        docElement.style.position = 'relative';
      }

      docElement.appendChild(btn);
    }

    
    addButtonsToVoiceMessages();

    
    const observer = new MutationObserver((mutations) => {
      let shouldScan = false;
      for (const m of mutations) {
        if (m.addedNodes.length > 0) {
          shouldScan = true;
          break;
        }
      }
      if (shouldScan) {
        
        clearTimeout(observer._timeout);
        observer._timeout = setTimeout(addButtonsToVoiceMessages, 200);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    console.log('[stego-ext] Voice message observer started');
  }

  
  if (document.body) {
    setupVoiceMessageObserver();
  } else {
    document.addEventListener('DOMContentLoaded', setupVoiceMessageObserver);
  }

  console.log('[stego-ext] page hooks ready (Blob + arrayBuffer patched)');
})();
