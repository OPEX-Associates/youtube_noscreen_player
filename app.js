class YouTubeAudioPlayer {
    constructor() {
        this.queue = [];
        this.currentIndex = -1;
        this.isPlaying = false;
        this.shuffle = false;
        this.repeat = false; // false, 'one', 'all'
        this.volume = 1;
        this.debugMode = window.location.search.includes('debug=true');
        
        if (this.debugMode) {
            console.log('🐛 Debug mode enabled');
            this.addDebugUI();
        }
        
        this.init();
    }

    init() {
        this.bindElements();
        this.bindEvents();
        this.loadFromStorage();
        this.updateUI();
        
        // Focus on URL input for better UX
        this.urlInput.focus();
    }

    bindElements() {
        // Input elements
        this.urlInput = document.getElementById('youtube-url');
        this.addButton = document.getElementById('add-to-queue');
        
        // Player elements
        this.audioPlayer = document.getElementById('audio-player');
        this.currentTitle = document.getElementById('current-title');
        this.currentChannel = document.getElementById('current-channel');
        
        // Control elements
        this.playPauseBtn = document.getElementById('play-pause-btn');
        this.prevBtn = document.getElementById('prev-btn');
        this.nextBtn = document.getElementById('next-btn');
        this.shuffleBtn = document.getElementById('shuffle-btn');
        this.repeatBtn = document.getElementById('repeat-btn');
        
        // Progress elements
        this.progressBar = document.getElementById('progress-bar');
        this.currentTimeEl = document.getElementById('current-time');
        this.durationEl = document.getElementById('duration');
        
        // Queue elements
        this.queueList = document.getElementById('queue-list');
        this.queueCount = document.getElementById('queue-count');
        this.clearQueueBtn = document.getElementById('clear-queue');
        
        // UI elements
        this.statusMessage = document.getElementById('status-message');
        this.loading = document.getElementById('loading');
    }

    bindEvents() {
        // Input events
        this.addButton.addEventListener('click', () => this.addToQueue());
        this.urlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.addToQueue();
            }
        });
        
        // Player events
        this.audioPlayer.addEventListener('loadedmetadata', () => this.updateDuration());
        this.audioPlayer.addEventListener('timeupdate', () => this.updateProgress());
        this.audioPlayer.addEventListener('ended', () => this.handleTrackEnd());
        this.audioPlayer.addEventListener('error', (e) => this.handleAudioError(e));
        
        // Control events
        this.playPauseBtn.addEventListener('click', () => this.togglePlayPause());
        this.prevBtn.addEventListener('click', () => this.playPrevious());
        this.nextBtn.addEventListener('click', () => this.playNext());
        this.shuffleBtn.addEventListener('click', () => this.toggleShuffle());
        this.repeatBtn.addEventListener('click', () => this.toggleRepeat());
        
        // Progress bar events
        this.progressBar.addEventListener('input', () => this.seek());
        
        // Queue events
        this.clearQueueBtn.addEventListener('click', () => this.clearQueue());
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));
        
        // Media session API for mobile notifications
        if ('mediaSession' in navigator) {
            navigator.mediaSession.setActionHandler('play', () => this.play());
            navigator.mediaSession.setActionHandler('pause', () => this.pause());
            navigator.mediaSession.setActionHandler('previoustrack', () => this.playPrevious());
            navigator.mediaSession.setActionHandler('nexttrack', () => this.playNext());
        }
    }

    async addToQueue() {
        const url = this.urlInput.value.trim();
        console.log('Adding to queue:', url);
        
        if (!url) {
            this.showStatus('Please enter a YouTube URL', 'error');
            return;
        }

        if (!this.isValidYouTubeUrl(url)) {
            this.showStatus('Please enter a valid YouTube URL', 'error');
            return;
        }

        try {
            this.showLoading(true);
            this.showStatus('Extracting video information...', 'info');
            
            console.log('Extracting video info...');
            const videoInfo = await this.extractVideoInfo(url);
            console.log('Video info:', videoInfo);
            
            this.showStatus('Extracting audio stream...', 'info');
            console.log('Getting audio URL...');
            const audioUrl = await this.getAudioUrl(videoInfo.videoId);
            console.log('Audio URL received:', audioUrl ? 'Success' : 'Failed');
            console.log('Audio URL type:', typeof audioUrl);
            console.log('Audio URL length:', audioUrl ? audioUrl.length : 0);
            
            // Test if the URL is accessible
            if (audioUrl && !audioUrl.startsWith('blob:')) {
                try {
                    this.showStatus('Verifying audio stream...', 'info');
                    console.log('Testing audio URL accessibility...');
                    const testResponse = await fetch(audioUrl, { method: 'HEAD' });
                    console.log('Audio URL test result:', testResponse.ok ? 'Accessible' : 'Not accessible');
                    
                    if (!testResponse.ok) {
                        console.warn('Audio URL not accessible, but proceeding anyway');
                    }
                } catch (testError) {
                    console.log('Audio URL test failed (CORS expected):', testError.message);
                }
            }
            
            const queueItem = {
                id: Date.now(),
                title: videoInfo.title,
                channel: videoInfo.channel,
                duration: videoInfo.duration,
                thumbnail: videoInfo.thumbnail,
                audioUrl: audioUrl,
                videoId: videoInfo.videoId,
                originalUrl: url
            };

            this.queue.push(queueItem);
            this.updateQueueDisplay();
            this.saveToStorage();
            
            // If no track is currently playing, start this one
            if (this.currentIndex === -1) {
                this.currentIndex = this.queue.length - 1;
                this.loadCurrentTrack();
            }
            
            this.urlInput.value = '';
            this.showStatus(`Added "${videoInfo.title}" to queue`, 'success');
            
        } catch (error) {
            console.error('Error adding to queue:', error);
            this.showStatus(`Failed to add video to queue: ${error.message}`, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    isValidYouTubeUrl(url) {
        const patterns = [
            /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)/,
            /^https?:\/\/(www\.)?youtube\.com\/embed\//
        ];
        return patterns.some(pattern => pattern.test(url));
    }

    extractVideoId(url) {
        const patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([^&\n?#]+)/
        ];
        
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) {
                return match[1];
            }
        }
        return null;
    }

    async extractVideoInfo(url) {
        const videoId = this.extractVideoId(url);
        if (!videoId) {
            throw new Error('Could not extract video ID from URL');
        }

        // Try multiple sources for video info
        try {
            // Try Invidious first (more reliable for metadata)
            return await this.getVideoInfoFromInvidious(videoId);
        } catch (error) {
            console.log('Invidious video info failed:', error.message);
        }

        try {
            // Try YouTube's oEmbed API
            const oEmbedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
            console.log('Trying oEmbed API:', oEmbedUrl);
            
            const oEmbedResponse = await fetch(oEmbedUrl);
            
            if (oEmbedResponse.ok) {
                const data = await oEmbedResponse.json();
                console.log('oEmbed data received');
                
                return {
                    videoId: videoId,
                    title: data.title || `Video ${videoId}`,
                    channel: data.author_name || 'Unknown Channel',
                    duration: 'Unknown',
                    thumbnail: data.thumbnail_url || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
                };
            }
        } catch (error) {
            console.log('oEmbed failed:', error.message);
        }

        // Fallback method
        console.log('Using fallback method for video info');
        return {
            videoId: videoId,
            title: `YouTube Video ${videoId.substring(0, 8)}`,
            channel: 'Unknown Channel',
            duration: 'Unknown',
            thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
        };
    }

    async getVideoInfoFromInvidious(videoId) {
        const instances = [
            'https://invidious.privacydev.net',
            'https://invidious.io.lol',
            'https://invidious.protokolla.fi'
        ];

        for (const instance of instances) {
            try {
                console.log(`Getting video info from: ${instance}`);
                const response = await fetch(`${instance}/api/v1/videos/${videoId}`);
                
                if (response.ok) {
                    const data = await response.json();
                    
                    return {
                        videoId: videoId,
                        title: data.title || `Video ${videoId}`,
                        channel: data.author || 'Unknown Channel',
                        duration: this.formatDuration(data.lengthSeconds || 0),
                        thumbnail: data.videoThumbnails?.[0]?.url || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
                    };
                }
            } catch (error) {
                console.log(`Invidious instance ${instance} failed for video info:`, error.message);
            }
        }
        
        throw new Error('All Invidious instances failed for video info');
    }

    formatDuration(seconds) {
        if (!seconds || seconds === 0) return 'Unknown';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    async getAudioUrl(videoId) {
        console.log('Extracting audio for video ID:', videoId);
        
        // Try different extraction methods based on deployment
        
        // 1. Try serverless function (works for both Netlify and localhost with Netlify CLI)
        try {
            console.log('Trying serverless extraction...');
            const functionUrl = `/.netlify/functions/extract-audio?videoId=${videoId}`;
            console.log('Function URL:', functionUrl);
            
            // Add timeout to prevent hanging
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 12000); // 12 second timeout
            
            const response = await fetch(functionUrl, {
                headers: { 'Accept': 'application/json' },
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            console.log('Serverless response status:', response.status);
            
            if (response.ok) {
                const data = await response.json();
                console.log('Serverless response data:', data);
                
                if (data.audioUrl) {
                    console.log('✅ Serverless extraction succeeded!');
                    return data.audioUrl;
                } else {
                    console.log('⚠️ Serverless responded but no audio URL:', data.error);
                }
            } else {
                const errorText = await response.text();
                console.log('❌ Serverless returned error:', response.status, errorText);
            }
        } catch (error) {
            console.log('❌ Serverless extraction failed:', error.message);
            if (error.name === 'AbortError') {
                console.log('⚠️ Serverless function timed out - likely not deployed or taking too long');
            }
        }
        
        // 2. Try local backend (for development)
        const backendPorts = [3001, 3002, 3000];
        for (const port of backendPorts) {
            try {
                console.log(`Trying local backend on port ${port}...`);
                const response = await fetch(`http://localhost:${port}/api/extract-audio/${videoId}`);
                if (response.ok) {
                    const data = await response.json();
                    if (data.audioUrl) {
                        console.log(`✅ Local backend extraction succeeded on port ${port}!`);
                        return data.audioUrl;
                    }
                }
            } catch (error) {
                console.log(`❌ Backend port ${port} not available:`, error.message);
            }
        }
        
        // Then try online extraction methods
        try {
            console.log('Trying online extraction methods...');
            const audioUrl = await this.extractYouTubeAudio(videoId);
            if (audioUrl) {
                console.log('✅ Online extraction succeeded!');
                return audioUrl;
            }
        } catch (error) {
            console.error('❌ All extraction methods failed:', error);
        }
        
        // Fallback to demo audio if all extraction fails
        console.log('🔄 Using demo audio as fallback...');
        const demoAudioUrl = this.getDemoAudioUrl(videoId);
        await new Promise(resolve => setTimeout(resolve, 500));
        return demoAudioUrl;
    }

    async extractYouTubeAudio(videoId) {
        console.log('Starting audio extraction for:', videoId);
        
        // Try multiple methods for audio extraction - prioritizing ones that work like SaveFrom.net
        const methods = [
            { name: 'YouTube Downloader API', fn: () => this.tryDownloaderAPI(videoId) },
            { name: 'SaveFrom-like Service', fn: () => this.trySaveFromAPI(videoId) },
            { name: 'Invidious API', fn: () => this.tryInvidiousAPI(videoId) },
            { name: 'Piped API', fn: () => this.tryPipedAPI(videoId) },
            { name: 'Direct YouTube Extraction', fn: () => this.tryDirectYouTubeExtraction(videoId) }
        ];

        for (const method of methods) {
            try {
                console.log(`Trying ${method.name}...`);
                const result = await method.fn();
                if (result) {
                    console.log(`✅ ${method.name} succeeded!`);
                    return result;
                }
            } catch (error) {
                console.log(`❌ ${method.name} failed:`, error.message);
            }
        }

        console.log('All extraction methods failed, using fallback');
        throw new Error('All extraction methods failed');
    }

    async tryInvidiousAPI(videoId) {
        // Updated Invidious instances with CORS-friendly ones
        const instances = [
            'https://inv.nadeko.net',
            'https://invidious.privacyredirect.com',
            'https://y.com.sb',
            'https://invidious.nerdvpn.de',
            'https://inv.bp.projectsegfau.lt'
        ];

        for (const instance of instances) {
            try {
                console.log(`Trying Invidious: ${instance}`);
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 8000);
                
                const response = await fetch(`${instance}/api/v1/videos/${videoId}?fields=adaptiveFormats,title,author,lengthSeconds`, {
                    signal: controller.signal,
                    headers: { 
                        'Accept': 'application/json'
                    },
                    mode: 'cors'
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                
                const data = await response.json();
                
                // Find audio-only format
                const audioFormats = data.adaptiveFormats?.filter(format => 
                    format.type && format.type.includes('audio') && format.url
                ) || [];
                
                if (audioFormats.length > 0) {
                    // Prefer OPUS format
                    const opusFormat = audioFormats.find(f => f.type.includes('opus'));
                    const selectedFormat = opusFormat || audioFormats[0];
                    
                    console.log('✅ Invidious found format:', selectedFormat.type);
                    return selectedFormat.url;
                }
            } catch (error) {
                console.log(`❌ Invidious ${instance}:`, error.message);
            }
        }
        
        throw new Error('All Invidious instances failed');
    }

    async tryPipedAPI(videoId) {
        // Try Piped instances (another YouTube proxy)
        const instances = [
            'https://pipedapi.kavin.rocks',
            'https://api-piped.mha.fi',
            'https://pipedapi.palveluntarjoaja.eu'
        ];

        for (const instance of instances) {
            try {
                console.log(`Trying Piped: ${instance}`);
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000);
                
                const response = await fetch(`${instance}/streams/${videoId}`, {
                    signal: controller.signal,
                    headers: { 'Accept': 'application/json' }
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                
                const data = await response.json();
                
                // Find audio streams
                const audioStreams = data.audioStreams?.filter(stream => 
                    stream.url && stream.mimeType
                ) || [];
                
                if (audioStreams.length > 0) {
                    // Prefer OPUS format
                    const opusStream = audioStreams.find(s => s.mimeType.includes('opus'));
                    const selectedStream = opusStream || audioStreams[0];
                    
                    console.log('✅ Piped found format:', selectedStream.mimeType);
                    return selectedStream.url;
                }
            } catch (error) {
                console.log(`❌ Piped ${instance}:`, error.message);
            }
        }
        
        throw new Error('All Piped instances failed');
    }

    async tryCORSProxy(videoId) {
        // Try using CORS proxy to access YouTube directly
        const proxies = [
            'https://api.allorigins.win/get?url=',
            'https://corsproxy.io/?',
            'https://cors-anywhere.herokuapp.com/'
        ];

        for (const proxy of proxies) {
            try {
                console.log(`Trying CORS proxy: ${proxy}`);
                const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
                const proxyUrl = `${proxy}${encodeURIComponent(videoUrl)}`;
                
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000);
                
                const response = await fetch(proxyUrl, {
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                
                const result = await response.text();
                const pageContent = proxy.includes('allorigins') ? JSON.parse(result).contents : result;
                
                // Extract player config
                const configMatch = pageContent.match(/ytcfg\.set\s*\(\s*({.+?})\s*\)/);
                const playerMatch = pageContent.match(/var ytInitialPlayerResponse = ({.+?});/);
                
                if (playerMatch) {
                    const playerData = JSON.parse(playerMatch[1]);
                    const formats = playerData?.streamingData?.adaptiveFormats || [];
                    
                    const audioFormats = formats.filter(f => 
                        f.mimeType && f.mimeType.includes('audio') && f.url
                    );
                    
                    if (audioFormats.length > 0) {
                        const opusFormat = audioFormats.find(f => f.mimeType.includes('opus'));
                        const selectedFormat = opusFormat || audioFormats[0];
                        
                        console.log('✅ CORS proxy found format:', selectedFormat.mimeType);
                        return selectedFormat.url;
                    }
                }
            } catch (error) {
                console.log(`❌ CORS proxy failed:`, error.message);
            }
        }
        
        throw new Error('All CORS proxy methods failed');
    }

    async tryDownloaderAPI(videoId) {
        // Try YouTube downloader APIs that work like SaveFrom.net
        const apis = [
            {
                name: 'YouTube-DL API',
                url: `https://youtube-dl-api-omega.vercel.app/api/video/${videoId}`,
                parser: (data) => {
                    const formats = data.formats || [];
                    const audioFormats = formats.filter(f => f.acodec && f.acodec !== 'none' && !f.vcodec);
                    return audioFormats.find(f => f.ext === 'webm' || f.ext === 'm4a')?.url;
                }
            },
            {
                name: 'YT-DLP API',
                url: `https://api.cobalt.tools/api/json`,
                method: 'POST',
                body: {
                    url: `https://youtube.com/watch?v=${videoId}`,
                    vQuality: 'max',
                    aFormat: 'opus',
                    isAudioOnly: true
                },
                parser: (data) => data.url
            }
        ];

        for (const api of apis) {
            try {
                console.log(`Trying ${api.name}...`);
                
                const options = {
                    method: api.method || 'GET',
                    headers: { 
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    }
                };
                
                if (api.body) {
                    options.body = JSON.stringify(api.body);
                }
                
                const response = await fetch(api.url, options);
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                
                const data = await response.json();
                console.log(`${api.name} response:`, data);
                
                const audioUrl = api.parser(data);
                if (audioUrl) {
                    console.log(`✅ ${api.name} found audio URL`);
                    return audioUrl;
                }
            } catch (error) {
                console.log(`❌ ${api.name}:`, error.message);
            }
        }
        
        throw new Error('All downloader APIs failed');
    }

    async trySaveFromAPI(videoId) {
        // Try SaveFrom.net-style APIs
        const apis = [
            `https://api.savefrom.net/ajax.php?url=https://youtube.com/watch?v=${videoId}`,
            `https://loader.to/ajax/search.php?query=https://youtube.com/watch?v=${videoId}`,
            `https://9convert.com/api/ajaxSearch/index`,
        ];

        for (const apiUrl of apis) {
            try {
                console.log(`Trying SaveFrom-style API: ${apiUrl}`);
                
                const formData = new FormData();
                formData.append('query', `https://youtube.com/watch?v=${videoId}`);
                
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    body: formData,
                    headers: {
                        'Accept': 'application/json, text/javascript, */*; q=0.01',
                        'X-Requested-With': 'XMLHttpRequest'
                    }
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                
                const text = await response.text();
                console.log('SaveFrom response:', text.substring(0, 200) + '...');
                
                // Try to parse as JSON
                let data;
                try {
                    data = JSON.parse(text);
                } catch {
                    // If not JSON, try to extract URLs from HTML/text
                    const urlRegex = /https?:\/\/[^\s"'<>]+\.(webm|m4a|opus|mp3)/gi;
                    const matches = text.match(urlRegex);
                    if (matches && matches.length > 0) {
                        console.log('✅ Found audio URL in text response');
                        return matches[0];
                    }
                    throw new Error('No audio URLs found in response');
                }
                
                // Look for audio URLs in JSON response
                const findAudioUrl = (obj) => {
                    if (typeof obj === 'string' && /https?:\/\/.*\.(webm|m4a|opus|mp3)/i.test(obj)) {
                        return obj;
                    }
                    if (typeof obj === 'object' && obj !== null) {
                        for (const key in obj) {
                            const result = findAudioUrl(obj[key]);
                            if (result) return result;
                        }
                    }
                    return null;
                };
                
                const audioUrl = findAudioUrl(data);
                if (audioUrl) {
                    console.log('✅ SaveFrom-style API found audio URL');
                    return audioUrl;
                }
                
            } catch (error) {
                console.log(`❌ SaveFrom API failed:`, error.message);
            }
        }
        
        throw new Error('All SaveFrom-style APIs failed');
    }

    async tryDirectYouTubeExtraction(videoId) {
        // Enhanced direct YouTube extraction using newer methods
        try {
            console.log('Trying direct YouTube extraction...');
            
            // Method 1: Try YouTube's get_video_info endpoint
            const infoUrl = `https://www.youtube.com/get_video_info?video_id=${videoId}&el=embedded&ps=default&eurl=&gl=US&hl=en`;
            
            try {
                const response = await fetch(infoUrl);
                if (response.ok) {
                    const data = await response.text();
                    const params = new URLSearchParams(data);
                    const playerResponse = params.get('player_response');
                    
                    if (playerResponse) {
                        const parsed = JSON.parse(playerResponse);
                        const formats = parsed?.streamingData?.adaptiveFormats || [];
                        
                        const audioFormats = formats.filter(f => 
                            f.mimeType && f.mimeType.includes('audio') && f.url
                        );
                        
                        if (audioFormats.length > 0) {
                            const opusFormat = audioFormats.find(f => f.mimeType.includes('opus'));
                            const selectedFormat = opusFormat || audioFormats[0];
                            
                            console.log('✅ Direct extraction via get_video_info');
                            return selectedFormat.url;
                        }
                    }
                }
            } catch (error) {
                console.log('get_video_info failed:', error.message);
            }
            
            // Method 2: Try YouTube's player API
            const playerUrl = `https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8`;
            const playerData = {
                context: {
                    client: {
                        clientName: 'WEB',
                        clientVersion: '2.20230728.00.00'
                    }
                },
                videoId: videoId
            };
            
            try {
                const response = await fetch(playerUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(playerData)
                });
                
                if (response.ok) {
                    const data = await response.json();
                    const formats = data?.streamingData?.adaptiveFormats || [];
                    
                    const audioFormats = formats.filter(f => 
                        f.mimeType && f.mimeType.includes('audio') && f.url
                    );
                    
                    if (audioFormats.length > 0) {
                        const opusFormat = audioFormats.find(f => f.mimeType.includes('opus'));
                        const selectedFormat = opusFormat || audioFormats[0];
                        
                        console.log('✅ Direct extraction via player API');
                        return selectedFormat.url;
                    }
                }
            } catch (error) {
                console.log('Player API failed:', error.message);
            }
            
            throw new Error('All direct extraction methods failed');
            
        } catch (error) {
            console.log('❌ Direct YouTube extraction failed:', error.message);
            throw error;
        }
    }

    getDemoAudioUrl(videoId) {
        // For testing purposes, create a data URL with a simple tone
        // This ensures we always have a working audio source for demo
        // In production, this would be replaced with actual YouTube audio extraction
        
        // Create a simple audio tone using Web Audio API data
        const sampleRate = 22050;
        const duration = 30; // 30 seconds
        const frequency = 440; // A4 note
        const samples = sampleRate * duration;
        
        // Generate a simple sine wave
        const buffer = new ArrayBuffer(44 + samples * 2);
        const view = new DataView(buffer);
        
        // WAV header
        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        };
        
        writeString(0, 'RIFF');
        view.setUint32(4, 36 + samples * 2, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeString(36, 'data');
        view.setUint32(40, samples * 2, true);
        
        // Generate audio data
        for (let i = 0; i < samples; i++) {
            const sample = Math.sin(2 * Math.PI * frequency * i / sampleRate) * 0.3;
            view.setInt16(44 + i * 2, sample * 32767, true);
        }
        
        const blob = new Blob([buffer], { type: 'audio/wav' });
        return URL.createObjectURL(blob);
    }

    loadCurrentTrack() {
        if (this.currentIndex < 0 || this.currentIndex >= this.queue.length) {
            this.currentTitle.textContent = 'No audio selected';
            this.currentChannel.textContent = 'Select a video from the queue';
            this.audioPlayer.src = '';
            return;
        }

        const track = this.queue[this.currentIndex];
        this.currentTitle.textContent = track.title;
        this.currentChannel.textContent = track.channel;
        this.audioPlayer.src = track.audioUrl;
        
        // Update media session metadata
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: track.title,
                artist: track.channel,
                artwork: [
                    { src: track.thumbnail, sizes: '512x512', type: 'image/jpeg' }
                ]
            });
        }
        
        this.updateQueueDisplay();
    }

    togglePlayPause() {
        if (this.audioPlayer.paused) {
            this.play();
        } else {
            this.pause();
        }
    }

    play() {
        if (this.audioPlayer.src) {
            this.audioPlayer.play();
            this.playPauseBtn.textContent = '⏸️';
            this.isPlaying = true;
        }
    }

    pause() {
        this.audioPlayer.pause();
        this.playPauseBtn.textContent = '▶️';
        this.isPlaying = false;
    }

    playPrevious() {
        if (this.queue.length === 0) return;
        
        if (this.shuffle) {
            this.currentIndex = Math.floor(Math.random() * this.queue.length);
        } else {
            this.currentIndex = this.currentIndex <= 0 ? this.queue.length - 1 : this.currentIndex - 1;
        }
        
        this.loadCurrentTrack();
        if (this.isPlaying) {
            this.play();
        }
    }

    playNext() {
        if (this.queue.length === 0) return;
        
        if (this.shuffle) {
            this.currentIndex = Math.floor(Math.random() * this.queue.length);
        } else {
            this.currentIndex = this.currentIndex >= this.queue.length - 1 ? 0 : this.currentIndex + 1;
        }
        
        this.loadCurrentTrack();
        if (this.isPlaying) {
            this.play();
        }
    }

    handleTrackEnd() {
        if (this.repeat === 'one') {
            this.audioPlayer.currentTime = 0;
            this.play();
        } else if (this.repeat === 'all' || this.currentIndex < this.queue.length - 1) {
            this.playNext();
        } else {
            this.pause();
        }
    }

    toggleShuffle() {
        this.shuffle = !this.shuffle;
        this.shuffleBtn.className = this.shuffle ? 'shuffle-on' : 'shuffle-off';
        this.showStatus(`Shuffle ${this.shuffle ? 'enabled' : 'disabled'}`, 'info');
    }

    toggleRepeat() {
        const states = [false, 'all', 'one'];
        const currentIndex = states.indexOf(this.repeat);
        this.repeat = states[(currentIndex + 1) % states.length];
        
        const labels = ['off', 'all', 'one'];
        this.repeatBtn.className = `repeat-${labels[states.indexOf(this.repeat)]}`;
        this.repeatBtn.textContent = this.repeat === 'one' ? '🔂' : '🔁';
        
        this.showStatus(`Repeat ${this.repeat || 'disabled'}`, 'info');
    }

    seek() {
        const seekTime = (this.progressBar.value / 100) * this.audioPlayer.duration;
        this.audioPlayer.currentTime = seekTime;
    }

    updateProgress() {
        if (this.audioPlayer.duration) {
            const progress = (this.audioPlayer.currentTime / this.audioPlayer.duration) * 100;
            this.progressBar.value = progress;
            
            this.currentTimeEl.textContent = this.formatTime(this.audioPlayer.currentTime);
        }
    }

    updateDuration() {
        this.durationEl.textContent = this.formatTime(this.audioPlayer.duration);
    }

    formatTime(seconds) {
        if (isNaN(seconds)) return '0:00';
        
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    updateQueueDisplay() {
        this.queueCount.textContent = this.queue.length;
        
        if (this.queue.length === 0) {
            this.queueList.innerHTML = `
                <div class="queue-empty">
                    <p>Queue is empty</p>
                    <p>Add YouTube videos using the input above</p>
                </div>
            `;
            return;
        }

        this.queueList.innerHTML = this.queue.map((item, index) => `
            <div class="queue-item ${index === this.currentIndex ? 'playing' : ''}" data-index="${index}">
                <img src="${item.thumbnail}" alt="${item.title}" class="queue-thumbnail">
                <div class="queue-info">
                    <div class="queue-title">${this.escapeHtml(item.title)}</div>
                    <div class="queue-channel">${this.escapeHtml(item.channel)}</div>
                </div>
                <div class="queue-controls">
                    <button class="play-item" data-index="${index}" aria-label="Play this track">▶️</button>
                    <button class="remove-item" data-index="${index}" aria-label="Remove from queue">🗑️</button>
                </div>
            </div>
        `).join('');

        // Bind queue item events
        this.queueList.querySelectorAll('.play-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.currentIndex = parseInt(e.target.dataset.index);
                this.loadCurrentTrack();
                this.play();
            });
        });

        this.queueList.querySelectorAll('.remove-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.dataset.index);
                this.removeFromQueue(index);
            });
        });
    }

    removeFromQueue(index) {
        if (index < 0 || index >= this.queue.length) return;
        
        const removedItem = this.queue.splice(index, 1)[0];
        
        // Adjust current index if necessary
        if (index === this.currentIndex) {
            // If we removed the currently playing track
            if (this.queue.length === 0) {
                this.currentIndex = -1;
            } else if (this.currentIndex >= this.queue.length) {
                this.currentIndex = 0;
            }
            this.loadCurrentTrack();
        } else if (index < this.currentIndex) {
            this.currentIndex--;
        }
        
        this.updateQueueDisplay();
        this.saveToStorage();
        this.showStatus(`Removed "${removedItem.title}" from queue`, 'info');
    }

    clearQueue() {
        if (this.queue.length === 0) return;
        
        this.queue = [];
        this.currentIndex = -1;
        this.pause();
        this.loadCurrentTrack();
        this.updateQueueDisplay();
        this.saveToStorage();
        this.showStatus('Queue cleared', 'info');
    }

    handleKeyboard(e) {
        // Don't handle keyboard shortcuts when typing in input fields
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }

        switch (e.code) {
            case 'Space':
                e.preventDefault();
                this.togglePlayPause();
                break;
            case 'ArrowLeft':
                e.preventDefault();
                this.playPrevious();
                break;
            case 'ArrowRight':
                e.preventDefault();
                this.playNext();
                break;
            case 'KeyS':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    this.toggleShuffle();
                }
                break;
            case 'KeyR':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    this.toggleRepeat();
                }
                break;
        }
    }

    handleAudioError(e) {
        console.error('Audio error:', e);
        this.showStatus('Failed to load audio. The link may have expired.', 'error');
        
        // Try to play next track if available
        if (this.queue.length > 1) {
            this.playNext();
        }
    }

    showStatus(message, type = 'info') {
        this.statusMessage.textContent = message;
        this.statusMessage.className = `status-message ${type}`;
        this.statusMessage.style.display = 'block';
        
        setTimeout(() => {
            this.statusMessage.style.display = 'none';
        }, 3000);
    }

    showLoading(show) {
        this.loading.classList.toggle('hidden', !show);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    saveToStorage() {
        try {
            localStorage.setItem('youtube-audio-queue', JSON.stringify(this.queue));
            localStorage.setItem('youtube-audio-settings', JSON.stringify({
                currentIndex: this.currentIndex,
                shuffle: this.shuffle,
                repeat: this.repeat,
                volume: this.volume
            }));
        } catch (error) {
            console.error('Failed to save to storage:', error);
        }
    }

    loadFromStorage() {
        try {
            const savedQueue = localStorage.getItem('youtube-audio-queue');
            if (savedQueue) {
                this.queue = JSON.parse(savedQueue);
            }

            const savedSettings = localStorage.getItem('youtube-audio-settings');
            if (savedSettings) {
                const settings = JSON.parse(savedSettings);
                this.currentIndex = settings.currentIndex || -1;
                this.shuffle = settings.shuffle || false;
                this.repeat = settings.repeat || false;
                this.volume = settings.volume || 1;
                
                // Update UI elements
                this.shuffleBtn.className = this.shuffle ? 'shuffle-on' : 'shuffle-off';
                const repeatStates = [false, 'all', 'one'];
                const repeatLabels = ['off', 'all', 'one'];
                this.repeatBtn.className = `repeat-${repeatLabels[repeatStates.indexOf(this.repeat)]}`;
                this.repeatBtn.textContent = this.repeat === 'one' ? '🔂' : '🔁';
                this.audioPlayer.volume = this.volume;
            }
        } catch (error) {
            console.error('Failed to load from storage:', error);
        }
    }

    updateUI() {
        this.updateQueueDisplay();
        this.loadCurrentTrack();
    }

    addDebugUI() {
        // Add debug controls to the page
        const debugPanel = document.createElement('div');
        debugPanel.style.cssText = `
            position: fixed; top: 10px; right: 10px; 
            background: rgba(0,0,0,0.8); color: white; 
            padding: 10px; border-radius: 5px; 
            font-size: 12px; z-index: 9999;
            max-width: 300px; font-family: monospace;
        `;
        debugPanel.innerHTML = `
            <div><strong>🐛 Debug Mode</strong></div>
            <div id="debug-log" style="max-height: 200px; overflow-y: auto; margin-top: 5px;"></div>
            <button onclick="document.getElementById('debug-log').innerHTML=''" style="margin-top: 5px;">Clear Log</button>
        `;
        document.body.appendChild(debugPanel);
        
        this.debugLog = document.getElementById('debug-log');
        
        // Override console.log for debug mode
        const originalLog = console.log;
        console.log = (...args) => {
            originalLog.apply(console, args);
            if (this.debugLog) {
                const message = args.map(arg => 
                    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
                ).join(' ');
                this.debugLog.innerHTML += `<div>${new Date().toLocaleTimeString()}: ${message}</div>`;
                this.debugLog.scrollTop = this.debugLog.scrollHeight;
            }
        };
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.player = new YouTubeAudioPlayer();
    
    // Handle URL parameters (for shortcuts)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('action') === 'add') {
        document.getElementById('youtube-url').focus();
    }
});