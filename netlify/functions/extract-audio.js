// Netlify serverless function for YouTube audio extraction
// Uses Y2Mate API (reliable third-party service)

exports.handler = async (event, context) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const videoId = event.queryStringParameters?.videoId;
  
  if (!videoId) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Missing videoId parameter' })
    };
  }
  
  console.log('Serverless function: Extracting audio for:', videoId);
  
  // Try Y2Mate API
  try {
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    // Step 1: Analyze video
    const analyzeResponse = await fetch('https://www.y2mate.com/mates/analyzeV2/ajax', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: `k_query=${encodeURIComponent(videoUrl)}&k_page=home&hl=en&q_auto=0`
    });
    
    if (!analyzeResponse.ok) {
      throw new Error(`Y2Mate analyze failed: ${analyzeResponse.status}`);
    }
    
    const analyzeData = await analyzeResponse.json();
    
    if (analyzeData.status !== 'ok' || !analyzeData.links || !analyzeData.links.mp3) {
      throw new Error('No audio formats available');
    }
    
    // Find best quality audio (usually 128kbps)
    const audioFormats = Object.entries(analyzeData.links.mp3);
    const bestAudio = audioFormats.find(([key]) => key.includes('128')) || audioFormats[0];
    
    if (!bestAudio) {
      throw new Error('No audio format found');
    }
    
    const [quality, audioInfo] = bestAudio;
    
    // Step 2: Convert and get download link
    const convertResponse = await fetch('https://www.y2mate.com/mates/convertV2/index', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: `vid=${analyzeData.vid}&k=${audioInfo.k}`
    });
    
    if (!convertResponse.ok) {
      throw new Error(`Y2Mate convert failed: ${convertResponse.status}`);
    }
    
    const convertData = await convertResponse.json();
    
    if (convertData.status !== 'ok' || !convertData.dlink) {
      throw new Error('Failed to get download link');
    }
    
    console.log(`✅ Y2Mate extraction successful`);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        audioUrl: convertData.dlink,
        format: 'mp3',
        codec: 'mp3',
        quality: quality,
        title: analyzeData.title,
        duration: analyzeData.t,
        uploader: analyzeData.a || 'Unknown',
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
      })
    };
    
  } catch (y2mateError) {
    console.error('Y2Mate failed:', y2mateError.message);
    
    // Fallback to Invidious instances
    const invidiousInstances = [
      'https://invidious.fdn.fr',
      'https://iv.nboeck.de',
      'https://invidious.projectsegfau.lt',
      'https://yewtu.be',
      'https://invidious.protokolla.fi',
      'https://iv.melmac.space'
    ];
  
  // Try instances in parallel for faster response
  const tryInstance = async (instance) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${instance}/api/v1/videos/${videoId}?fields=adaptiveFormats,title,author,lengthSeconds`, {
        headers: { 'Accept': 'application/json' },
        signal: controller.signal
      });
      
      clearTimeout(timeout);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      // Find audio-only format
      const audioFormats = data.adaptiveFormats?.filter(format => 
        format.type && format.type.includes('audio') && format.url
      ) || [];
      
      if (audioFormats.length > 0) {
        const opusFormat = audioFormats.find(f => f.type.includes('opus'));
        const selectedFormat = opusFormat || audioFormats[0];
        
        console.log(`✅ Success with ${instance}`);
        
        return {
          audioUrl: selectedFormat.url,
          format: selectedFormat.container || 'webm',
          codec: selectedFormat.encoding || 'opus',
          quality: selectedFormat.bitrate || 'unknown',
          title: data.title,
          duration: data.lengthSeconds,
          uploader: data.author,
          thumbnail: data.videoThumbnails?.[0]?.url
        };
      }
      
      throw new Error('No audio formats found');
      
    } catch (error) {
      console.log(`Invidious ${instance} failed:`, error.message);
      throw error;
    }
  };
  
  // Try first 3 instances in parallel
  try {
    const results = await Promise.race(
      invidiousInstances.slice(0, 3).map(tryInstance)
    );
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(results)
    };
  } catch (firstBatchError) {
    console.log('First batch failed, trying remaining instances...');
    
    // Try remaining instances one by one
    for (const instance of invidiousInstances.slice(3)) {
      try {
        const result = await tryInstance(instance);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(result)
        };
      } catch (error) {
        continue;
      }
    }
  }
  
  // If all Invidious instances fail, try Piped API
  const pipedInstances = [
    'https://pipedapi.kavin.rocks',
    'https://pipedapi-libre.kavin.rocks',
    'https://api-piped.mha.fi'
  ];
  
  for (const instance of pipedInstances) {
    try {
      console.log(`Trying Piped instance: ${instance}`);
      
      const response = await fetch(`${instance}/streams/${videoId}`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8000)
      });
      
      if (!response.ok) continue;
      
      const data = await response.json();
      const audioStreams = data.audioStreams?.filter(s => s.url && s.mimeType) || [];
      
      if (audioStreams.length > 0) {
        const opusStream = audioStreams.find(s => s.mimeType.includes('opus'));
        const selectedStream = opusStream || audioStreams[0];
        
        console.log(`✅ Success with Piped ${instance}`);
        
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            audioUrl: selectedStream.url,
            format: selectedStream.format || 'webm',
            codec: selectedStream.codec || 'opus',
            quality: selectedStream.bitrate || 'unknown',
            title: data.title,
            duration: data.duration,
            uploader: data.uploader,
            thumbnail: data.thumbnailUrl
          })
        };
      }
      
    } catch (error) {
      console.log(`Piped ${instance} failed:`, error.message);
      continue;
    }
  }
  
    // All methods failed
    console.error('All extraction methods failed for videoId:', videoId);
    
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({ 
        error: 'All audio extraction services are currently unavailable',
        videoId: videoId,
        message: 'Please try again later or check if the video exists'
      })
    };
  }
};