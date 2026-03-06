/**
 * Jardim de Histórias - Core Logic (ELITE VERSION)
 */

const state = {
    apiKey: localStorage.getItem('jardim_api_key') || '',
    currentCategory: '',
    isReading: false,
    synth: window.speechSynthesis,
    utterance: null,
    voices: [],
    selectedVoice: localStorage.getItem('jardim_voice') || 'Google Português'
};

document.addEventListener('DOMContentLoaded', () => initApp());

function initApp() {
    loadVoices();
    if (state.synth.onvoiceschanged !== undefined) {
        state.synth.onvoiceschanged = loadVoices;
    }
    setupEventListeners();
    document.getElementById('apiKey').value = state.apiKey;
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
        alert('🌐 Para traduzir, basta clicar em qualquer palavra do texto enquanto lê!');
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
            alert('Escolha uma flor primeiro!');
        }
    });

    document.getElementById('storyContent').addEventListener('click', (e) => {
        if (e.target.tagName === 'SPAN') translateWord(e.target.innerText);
    });

    document.getElementById('saveSettings').addEventListener('click', saveSettings);
    document.getElementById('testConnection').addEventListener('click', testConnection);
}

async function startStoryProcess(category) {
    if (!state.apiKey) {
        toggleModal('settingsModal', true);
        return;
    }
    state.currentCategory = category;
    document.getElementById('gardenSelector').classList.add('hidden');
    document.getElementById('readingArea').classList.remove('hidden');
    document.getElementById('storyContent').innerHTML = '';
    document.getElementById('storyTitle').innerText = 'Dando vida ao seu conto...';
    document.getElementById('storyLoader').classList.remove('hidden');

    try {
        const story = await fetchStoryFromIA(category);
        displayStory(story);
    } catch (error) {
        alert('O jardim encontrou uma névoa... Tente novamente.');
        backToGarden();
    } finally {
        document.getElementById('storyLoader').classList.add('hidden');
    }
}

async function fetchStoryFromIA(category) {
    let key = (localStorage.getItem('jardim_api_key') || '').trim();
    // Extreme cleaning: remove quotes, spaces, newlines from everywhere
    key = key.replace(/["'\s\n\r]/g, '');

    if (!key) throw new Error('API Key missing');

    const isGroq = key.startsWith('gsk_');
    const url = isGroq ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://api.siliconflow.cn/v1/chat/completions';

    const prompts = {
        rosa: "Vida cotidiana", lotus: "Fábulas de sabedoria", girassol: "Aventuras alegres", lavanda: "Contos relaxantes"
    };

    const sysPrompt = `Você é um contador de histórias premium. 
    Crie um conto LONGO (6-8 parágrafos grandes, aprox. 800-1000 palavras) em português.
    A história deve ser rica, detalhada e envolvente para durar vários minutos de leitura.
    Formato JSON: {"titulo": "Título", "historia": "Texto longo aqui..."}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: isGroq ? "llama-3.3-70b-versatile" : "deepseek-ai/DeepSeek-V3",
            messages: [{ role: "system", content: sysPrompt }, { role: "user", content: prompts[category] }],
            response_format: { type: "json_object" },
            temperature: 0.8
        })
    });

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
}

function prepareUtterance(text) {
    if (state.synth.speaking) state.synth.cancel();
    state.utterance = new SpeechSynthesisUtterance(text);
    state.utterance.lang = 'pt-BR';
    const voice = state.voices.find(v => v.name === state.selectedVoice);
    if (voice) state.utterance.voice = voice;
    state.utterance.rate = 0.95;
    state.utterance.onstart = () => updateUIPlayback(true);
    state.utterance.onend = () => updateUIPlayback(false);
    state.utterance.onboundary = (e) => {
        if (e.name === 'word') highlightWordAt(e.charIndex);
    };
}

function togglePlayback() {
    if (state.isReading) {
        state.synth.pause();
        state.isReading = false;
        document.getElementById('playBtn').innerHTML = '<i class="ph-fill ph-play"></i>';
    } else {
        if (state.synth.paused) state.synth.resume();
        else state.synth.speak(state.utterance);
        state.isReading = true;
        document.getElementById('playBtn').innerHTML = '<i class="ph-fill ph-pause"></i>';
    }
}

function stopPlayback() {
    state.synth.cancel();
    state.isReading = false;
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
}

function saveSettings() {
    let keyInput = document.getElementById('apiKey').value.trim();
    // Aggressive cleaning
    let key = keyInput.replace(/["'\s\n\r]/g, '');

    state.apiKey = key;
    state.selectedVoice = document.getElementById('voiceSelect').value;
    localStorage.setItem('jardim_api_key', key);
    localStorage.setItem('jardim_voice', state.selectedVoice);

    // Update input field to show cleaned key
    document.getElementById('apiKey').value = key;

    toggleModal('settingsModal', false);
    alert('✨ Ajustes Salvos!');
}

async function testConnection() {
    const btn = document.getElementById('testConnection');
    let keyInput = document.getElementById('apiKey').value.trim();
    let key = keyInput.replace(/["'\s\n\r]/g, '');

    if (!key) {
        alert('Coloque uma chave primeiro!');
        return;
    }

    btn.innerText = '🕒 Testando...';
    try {
        const isGroq = key.startsWith('gsk_');
        const url = isGroq ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://api.siliconflow.cn/v1/chat/completions';

        console.log('--- TESTANDO CONEXÃO ---');
        console.log('Provider:', isGroq ? 'Groq' : 'SiliconFlow');
        console.log('Endpoint:', url);

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: isGroq ? "llama-3.3-70b-versatile" : "deepseek-ai/DeepSeek-V3",
                messages: [{ role: "user", content: "Hi" }]
            })
        });

        if (!res.ok) {
            const errBody = await res.json();
            console.error('❌ Erro da API:', errBody);
            alert(`Erro ${res.status}: ${JSON.stringify(errBody.error?.message || errBody.error)}`);
            return;
        }

        alert('✅ Conexão Premium Ativa!');
    } catch (e) {
        console.error('❌ Erro de Sistema:', e);
        alert('❌ Erro de rede ou CORS. Verifique o console.');
    } finally {
        btn.innerText = 'Testar Conexão';
    }
}

async function translateWord(word) {
    // Basic cleaning: remove punctuation
    const cleanWord = word.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").trim();
    if (!cleanWord || cleanWord.length < 2) return;

    let key = (localStorage.getItem('jardim_api_key') || '').trim().replace(/["'\s\n\r]/g, '');
    if (!key) {
        alert('Por favor, configure sua chave API nos ajustes primeiro.');
        return;
    }

    const btn = document.getElementById('translateBtn');
    const originalIcon = btn.innerHTML;
    btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i>';

    try {
        const isGroq = key.startsWith('gsk_');
        const url = isGroq ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://api.siliconflow.cn/v1/chat/completions';

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: isGroq ? "llama-3.3-70b-versatile" : "deepseek-ai/DeepSeek-V3",
                messages: [
                    { role: "system", content: "Você é um tradutor rápido de português para espanhol. Responda apenas com a tradução da palabra." },
                    { role: "user", content: `Traduza para espanhol a palabra: "${cleanWord}"` }
                ],
                temperature: 0.3
            })
        });

        if (!res.ok) {
            const errorData = await res.json();
            console.error('API Error details:', errorData);
            throw new Error(`API Error ${res.status}`);
        }

        const data = await res.json();
        const translation = data.choices[0].message.content.trim();

        // Premium looking alert using a custom method if possible, otherwise native alert
        alert(`✨ A palavra "${cleanWord}" significa:\n\n👉 ${translation}`);
    } catch (e) {
        console.error('Erro na tradução:', e);
        alert('Não consegui traduzir agora. Verifique sua conexão.');
    } finally {
        btn.innerHTML = originalIcon;
    }
}

function toggleModal(id, show) {
    document.getElementById(id).classList.toggle('hidden', !show);
}
