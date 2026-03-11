/**
 * Jardim de Histórias - Core Logic (ELITE VERSION)
 */

const state = {
    currentCategory: '',
    isReading: false,
    synth: window.speechSynthesis,
    utterance: null,
    voices: [],
    selectedVoice: localStorage.getItem('jardim_voice') || 'Google Português',
    silentAudio: null,
    wakeLock: null,
    resumeInterval: null
};

const VERSION = "1.3.6";
const GROQ_PROXY = "https://tiny-art-d004jardim-proxy.hjalmar-meza.workers.dev";

document.addEventListener('DOMContentLoaded', () => initApp());

function initApp() {
    loadVoices();
    const versionEl = document.getElementById('appVersionDisplay');
    if (versionEl) versionEl.innerText = VERSION;
    
    if (state.synth.onvoiceschanged !== undefined) {
        state.synth.onvoiceschanged = loadVoices;
    }
    setupEventListeners();

    // Start secret update checker
    checkUpdates();
    setInterval(checkUpdates, 600000);
}

async function checkUpdates() {
    const dot = document.getElementById('updateStatus');
    if (!dot) return;

    try {
        const res = await fetch(`version.json?t=${Date.now()}`);
        if (!res.ok) return;
        const data = await res.json();

        if (data.version !== VERSION) {
            // New version detected
            dot.style.background = '#ef4444'; // Red (Update available)

            // Auto-update logic with cooldown to prevent loops
            const lastReload = parseInt(localStorage.getItem('jardim_last_auto_reload') || '0');
            const now = Date.now();
            const COOL_DOWN = 180000; // 3 minutes cooldown

            if (!state.isReading && (now - lastReload > COOL_DOWN)) {
                console.log('✨ Auto-update: Refreshing to version', data.version);
                localStorage.setItem('jardim_last_auto_reload', now.toString());
                setTimeout(() => window.location.reload(true), 1000);
            }
        } else {
            dot.style.background = '#10b981'; // Green (Up to date)
            console.log('✅ Jardím de Histórias:', VERSION);
        }
    } catch (e) {
        console.warn('Update check failed:', e);
    }
}

function loadVoices() {
    state.voices = state.synth.getVoices();
    const voiceSelect = document.getElementById('voiceSelect');
    if (!voiceSelect) return;
    voiceSelect.innerHTML = state.voices
        .filter(v => v.lang.includes('pt'))
        .map(v => `<option value="${v.name}" ${v.name === state.selectedVoice ? 'selected' : ''}>${v.name}</option>`)
        .join('');
}

function setupEventListeners() {
    // Hack para mantener el JS activo en background (Audio Silencioso)
    state.silentAudio = document.getElementById('silenceAudio');
    document.body.addEventListener('click', () => {
        if (state.silentAudio && state.silentAudio.paused && state.isReading) {
            state.silentAudio.play().catch(e => console.warn('Silent audio unlock failed', e));
        } else if (state.silentAudio && !state.silentAudio.src) {
            state.silentAudio.load();
        }
    }, { once: true });
    // Dismiss Splash
    const dismissSplash = () => {
        const splash = document.getElementById('splashScreen');
        if (splash.classList.contains('hidden')) return;
        splash.style.opacity = '0';
        setTimeout(() => {
            splash.classList.add('hidden');
            document.getElementById('mainApp').classList.remove('hidden');
            if (!state.apiKey) toggleModal('settingsModal', true);
        }, 800);
    };
    document.getElementById('enterApp').addEventListener('click', dismissSplash);
    document.getElementById('splashScreen').addEventListener('click', dismissSplash);
    setTimeout(dismissSplash, 4000);

    // Categories
    document.querySelectorAll('.flower-card').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelectorAll('.flower-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
        });
    });

    // Navigation
    document.getElementById('backToGarden').addEventListener('click', backToGarden);
    document.getElementById('playBtn').addEventListener('click', togglePlayback);
    document.getElementById('stopBtn').addEventListener('click', stopPlayback);
    document.getElementById('settingsBtn').addEventListener('click', () => toggleModal('settingsModal', true));

    document.getElementById('translateBtn').addEventListener('click', () => {
        showToast('Clique em qualquer palavra do texto para traduzir!', 'info');
    });

    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => toggleModal('settingsModal', false));
    });

    document.getElementById('ctaReadNow').addEventListener('click', () => {
        const selected = document.querySelector('.flower-card.active');
        if (selected) {
            toggleModal('settingsModal', false); // Force close settings
            startStoryProcess(selected.dataset.category);
        } else {
            showToast('Escolha uma flor primeiro!', 'info');
        }
    });

    document.getElementById('storyContent').addEventListener('click', (e) => {
        if (e.target.tagName === 'SPAN') translateWord(e.target.innerText);
    });

    // Safety check for settings buttons
    const saveBtn = document.getElementById('saveSettings');
    if (saveBtn) saveBtn.addEventListener('click', saveSettings);

    const testBtn = document.getElementById('testConnection');
    if (testBtn) testBtn.addEventListener('click', testConnection);
}

async function startStoryProcess(category) {
    state.currentCategory = category;
    document.getElementById('gardenSelector').classList.add('hidden');
    document.getElementById('readingArea').classList.remove('hidden');
    document.getElementById('storyContent').innerHTML = '';
    document.getElementById('storyTitle').innerText = 'Dando vida ao seu conto...';
    document.getElementById('storyLoader').classList.remove('hidden');

    try {
        const story = await fetchStoryFromIA(category);
        displayStory(story);
    } catch (e) {
        console.error('Erro no processo:', e);
        showToast(`O jardim encontrou uma névoa... ${e.message}`, 'error');
        backToGarden();
    } finally {
        document.getElementById('storyLoader').classList.add('hidden');
    }
}

async function fetchStoryFromIA(category) {
    const prompts = {
        rosa: "Vida cotidiana", lotus: "Fábulas de sabedoria", girassol: "Aventuras alegres", lavanda: "Contos relaxantes"
    };

    const sysPrompt = `Você é um contador de histórias premium. 
    Crie um conto LONGO (6-8 parágrafos grandes, aprox. 800-1000 palavras) em português.
    A história deve ser rica, detalhada e envolvente para durar vários minutos de leitura.
    Formato JSON: {"titulo": "Título", "historia": "Texto longo aqui..."}`;

    const response = await fetch(GROQ_PROXY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: "llama-3.1-8b-instant",
            messages: [{ role: "system", content: sysPrompt }, { role: "user", content: prompts[category] }],
            response_format: { type: "json_object" },
            temperature: 0.8
        })
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || `API Error ${response.status}`);
    }

    const data = await response.json();
    return JSON.parse(data.choices[0].message.content);
}

function displayStory(story) {
    document.getElementById('storyTitle').innerText = story.titulo;
    // Split by words keeping track of whitespace and newlines
    const content = story.historia.replace(/\n/g, '<br>');
    const words = story.historia.split(/(\s+)/);

    document.getElementById('storyContent').innerHTML = words.map(part => {
        if (/\s/.test(part)) return part.replace(/\n/g, '<br>');
        // Clean word for the inner text but keep it original for display
        return `<span>${part}</span>`;
    }).join('');

    prepareUtterance(story.historia);
    updateMediaSession(story.titulo);
}

function prepareUtterance(text) {
    if (!state.storyAudio) {
        state.storyAudio = new Audio();
        state.storyAudio.addEventListener('ended', playNextTTS);
        state.storyAudio.addEventListener('pause', () => updateUIPlayback(false));
        state.storyAudio.addEventListener('play', () => updateUIPlayback(true));
        
        // Ensure Media Session handles play/pause gracefully across locks
        if ('mediaSession' in navigator) {
            navigator.mediaSession.setActionHandler('play', () => { togglePlayback(); });
            navigator.mediaSession.setActionHandler('pause', () => { togglePlayback(); });
            navigator.mediaSession.setActionHandler('stop', () => { stopPlayback(); });
        }
    }
    
    // Smoothly split sentences and small paragraphs (limit ~200 chars to avoid API cutoffs)
    let rawChunks = text.match(/[^.!?\n]+[.!?\n]*|\s*$/g).filter(s => s.trim().length > 0);
    let finalChunks = [];
    rawChunks.forEach(chunk => {
        if (chunk.length < 200) finalChunks.push(chunk);
        else {
            let words = chunk.split(' ');
            let temp = '';
            words.forEach(w => {
                if ((temp.length + w.length) > 180) {
                    finalChunks.push(temp);
                    temp = w + ' ';
                } else temp += w + ' ';
            });
            if (temp.trim()) finalChunks.push(temp);
        }
    });

    state.ttsQueue = finalChunks.map(t => t.trim()).filter(t => t.length > 0);
    state.ttsIndex = 0;
    state.charTracker = 0;
    
    // Explicitly preload first chunk but DO NOT play yet.
    if (state.ttsQueue.length > 0) {
        state.storyAudio.src = `${GROQ_PROXY}?text=${encodeURIComponent(state.ttsQueue[0])}&lang=pt-BR`;
        state.storyAudio.load();
    }
    updateUIPlayback(false);
}

function playNextTTS() {
    state.charTracker += state.ttsQueue[state.ttsIndex].length + 1;
    highlightWordAt(state.charTracker);
    
    state.ttsIndex++;
    if (state.ttsIndex < state.ttsQueue.length) {
        state.storyAudio.src = `${GROQ_PROXY}?text=${encodeURIComponent(state.ttsQueue[state.ttsIndex])}&lang=pt-BR`;
        state.storyAudio.play().catch(e => console.warn('Next chunk error:', e));
    } else {
        state.isReading = false;
        updateUIPlayback(false);
    }
}

function togglePlayback() {
    if (state.isReading) {
        if (state.storyAudio) state.storyAudio.pause();
        state.isReading = false;
        if (state.silentAudio) state.silentAudio.pause();
        releaseWakeLock();
        document.getElementById('playBtn').innerHTML = '<i class="ph-fill ph-play"></i>';
    } else {
        requestWakeLock();
        
        // Rescue playback manually
        if (state.storyAudio) {
             if (!state.storyAudio.src && state.ttsQueue && state.ttsQueue.length > 0) {
                 state.storyAudio.src = `${GROQ_PROXY}?text=${encodeURIComponent(state.ttsQueue[state.ttsIndex])}&lang=pt-BR`;
                 state.storyAudio.load();
             }
             state.storyAudio.play().catch(e => {
                 console.warn("Play blocked, attempting reload", e);
                 state.storyAudio.load();
                 state.storyAudio.play().catch(err => console.error(err));
             });
        }
        
        // Fallback keep-alive for mobile iOS
        if (state.silentAudio && state.silentAudio.paused) {
            state.silentAudio.play().catch(e => console.warn("Silent audio failed", e));
        }

        state.isReading = true;
        document.getElementById('playBtn').innerHTML = '<i class="ph-fill ph-pause"></i>';
    }
}

function stopPlayback() {
    if (state.storyAudio) {
        state.storyAudio.pause();
        state.storyAudio.currentTime = 0;
        state.storyAudio.removeAttribute('src'); // Fully clear audio src to release memory
        state.storyAudio.load();
    }
    if (state.silentAudio) {
        state.silentAudio.pause();
        state.silentAudio.currentTime = 0;
    }
    releaseWakeLock();
    state.isReading = false;
    state.ttsIndex = 0;
    updateUIPlayback(false);
}

function highlightWordAt(charIndex) {
    const container = document.getElementById('storyContent');
    const spans = container.querySelectorAll('span');
    const text = container.innerText;
    const wordIdx = text.slice(0, charIndex).split(/\s+/).length - 1;
    spans.forEach(s => s.classList.remove('reading'));
    if (spans[wordIdx]) {
        spans[wordIdx].classList.add('reading');
        spans[wordIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function backToGarden() {
    stopPlayback();
    document.getElementById('readingArea').classList.add('hidden');
    document.getElementById('gardenSelector').classList.remove('hidden');
}

function updateUIPlayback(active) {
    state.isReading = active;
    const playBtn = document.getElementById('playBtn');
    const stopBtn = document.getElementById('stopBtn');
    playBtn.innerHTML = active ? '<i class="ph-fill ph-pause"></i>' : '<i class="ph-fill ph-play"></i>';
    active ? stopBtn.classList.remove('hidden') : stopBtn.classList.add('hidden');
    document.getElementById('voiceStatus').innerText = active ? 'Ouvindo' : 'Pronto';
    
    // Safety clear when playback naturally ends
    if (!active) {
        if (state.silentAudio) state.silentAudio.pause();
        if (typeof releaseWakeLock === 'function') releaseWakeLock();
    }
}

function saveSettings() {
    state.selectedVoice = document.getElementById('voiceSelect').value;
    localStorage.setItem('jardim_voice', state.selectedVoice);
    toggleModal('settingsModal', false);
    showToast('✨ Ajustes Salvos!', 'success');
}

function clearAllData() {
    showConfirm('Isso apagará sua chave API e reiniciará a app.', () => {
        localStorage.clear();
        sessionStorage.clear();
        window.location.reload(true);
    });
}

async function testConnection() {
    const btn = document.getElementById('testConnection');
    let keyInput = document.getElementById('apiKey').value.trim();
    let key = keyInput.replace(/[^\x21-\x7E]/g, '');

    if (!key) {
        showToast('Coloque uma chave API primeiro!', 'info');
        return;
    }

    btn.innerText = '🕒 Testando...';
    try {
        const isGroq = key.startsWith('gsk_');
        const url = isGroq ? GROQ_PROXY : 'https://api.siliconflow.cn/v1/chat/completions';

        // Strategy for iOS stability: Minimal headers + No-Cache + Referrer policy
        const res = await fetch(url, {
            method: 'POST',
            mode: 'cors',
            cache: 'no-cache',
            referrerPolicy: 'no-referrer',
            headers: {
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: isGroq ? "llama-3.1-8b-instant" : "deepseek-ai/DeepSeek-V3", // Using stable model
                messages: [{ role: "user", content: "hi" }]
            })
        });

        if (!res.ok) {
            const errBody = await res.json();
            console.error('❌ API Error:', errBody);
            showToast(`Erro ${res.status}: ${errBody.error?.message || 'API Error'}`, 'error');
            return;
        }

        showToast('✅ Conexão Premium Ativa!', 'success');
    } catch (e) {
        console.error('❌ System Error:', e);
        const keyInfo = `Key: ${key.substring(0, 5)}... (Len: ${key.length})`;
        const isOnline = window.navigator.onLine ? "Sim" : "Não";
        showToast('Erro de rede. Verifique VPN/AdBlock ou Private Relay do iCloud.', 'error');
    } finally {
        btn.innerText = 'Testar Conexão';
    }
}

async function translateWord(word) {
    const cleanWord = word.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").trim();
    if (!cleanWord || cleanWord.length < 2) return;

    const btn = document.getElementById('translateBtn');
    const originalIcon = btn.innerHTML;
    btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i>';

    try {
        const res = await fetch(GROQ_PROXY, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: "llama-3.1-8b-instant",
                messages: [
                    { role: "system", content: "Você é um tradutor rápido de português para espanhol. Responda apenas com a tradução da palavra, sem explicações." },
                    { role: "user", content: `Traduza para espanhol a palavra: "${cleanWord}"` }
                ],
                temperature: 0.3
            })
        });

        if (!res.ok) throw new Error(`API Error ${res.status}`);

        const data = await res.json();
        const translation = data.choices[0].message.content.trim();
        showTranslationPopup(cleanWord, translation);
    } catch (e) {
        console.error('Erro na tradução:', e);
        showTranslationPopup(cleanWord, '❌ Erro ao traduzir');
    } finally {
        btn.innerHTML = originalIcon;
    }
}

function showTranslationPopup(originalWord, translation) {
    document.getElementById('translationOriginalWord').innerText = originalWord;
    document.getElementById('translationResultText').innerText = translation;
    document.getElementById('translationPopup').classList.remove('hidden');
    document.getElementById('translationOverlay').classList.remove('hidden');
    // Auto-close after 5 seconds
    setTimeout(() => {
        document.getElementById('translationPopup').classList.add('hidden');
        document.getElementById('translationOverlay').classList.add('hidden');
    }, 5000);
}

function toggleModal(id, show) {
    document.getElementById(id).classList.toggle('hidden', !show);
}

// ── Premium UI Helpers ──

function showToast(msg, type = 'success') {
    const toast = document.getElementById('toastNotif');
    const icon = document.getElementById('toastIcon');
    const text = document.getElementById('toastMsg');

    const icons = { success: 'ph-check-circle', error: 'ph-x-circle', info: 'ph-info' };
    icon.className = `ph ${icons[type] || 'ph-check-circle'}`;
    text.innerText = msg;
    toast.className = `toast-notif toast-${type}`;
    toast.classList.remove('hidden');

    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.add('hidden'), 3500);
}

function showConfirm(msg, onConfirm) {
    const overlay = document.getElementById('confirmOverlay');
    document.getElementById('confirmMsg').innerText = msg;
    overlay.classList.remove('hidden');

    const okBtn = document.getElementById('confirmOk');
    const cancelBtn = document.getElementById('confirmCancel');

    const close = () => overlay.classList.add('hidden');
    okBtn.onclick = () => { close(); onConfirm(); };
    cancelBtn.onclick = close;
}

// ── Background Execution & Wake Lock Hacks ──

async function requestWakeLock() {
    if ('wakeLock' in navigator) {
        try {
            state.wakeLock = await navigator.wakeLock.request('screen');
            state.wakeLock.addEventListener('release', () => console.log('Wake Lock released'));
        } catch (err) {
            console.error('Wake Lock error:', err);
        }
    }
}

function releaseWakeLock() {
    if (state.wakeLock !== null) {
        state.wakeLock.release().then(() => { state.wakeLock = null; });
    }
}

function updateMediaSession(title) {
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: title || 'Lendo História...',
            artist: 'Jardim de Histórias',
            artwork: [
                { src: 'icon.png', sizes: '192x192', type: 'image/png' },
                { src: 'logo_premium.png', sizes: '512x512', type: 'image/png' }
            ]
        });

        navigator.mediaSession.setActionHandler('play', togglePlayback);
        navigator.mediaSession.setActionHandler('pause', togglePlayback);
        navigator.mediaSession.setActionHandler('stop', stopPlayback);
    }
}
