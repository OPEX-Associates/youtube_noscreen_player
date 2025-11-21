// Netlify serverless function for YouTube audio extraction
// Uses Invidious API as a reliable method that doesn't require yt-dlp

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
  
  // Try multiple Invidious instances (faster, CORS-friendly ones first)
  const invidiousInstances = [
    'https://inv.nadeko.net',
    'https://invidious.privacyredirect.com',
    'https://y.com.sb',
    'https://invidious.nerdvpn.de',
    'https://iv.ggtyler.dev',
    'https://inv.bp.projectsegfau.lt'
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
};