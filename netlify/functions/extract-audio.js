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
  
  // Try multiple Invidious instances
  const invidiousInstances = [
    'https://iv.ggtyler.dev',
    'https://invidious.fdn.fr',
    'https://inv.riverside.rocks',
    'https://invidious.sethforprivacy.com',
    'https://invidious.tiekoetter.com',
    'https://invidious.privacydev.net'
  ];
  
  for (const instance of invidiousInstances) {
    try {
      console.log(`Trying Invidious instance: ${instance}`);
      
      const response = await fetch(`${instance}/api/v1/videos/${videoId}`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8000)
      });
      
      if (!response.ok) {
        console.log(`Invidious ${instance} returned ${response.status}`);
        continue;
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
        
        console.log(`✅ Success with ${instance}`);
        
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            audioUrl: selectedFormat.url,
            format: selectedFormat.container || 'webm',
            codec: selectedFormat.encoding || 'opus',
            quality: selectedFormat.bitrate || 'unknown',
            title: data.title,
            duration: data.lengthSeconds,
            uploader: data.author,
            thumbnail: data.videoThumbnails?.[0]?.url
          })
        };
      }
      
    } catch (error) {
      console.log(`Invidious ${instance} failed:`, error.message);
      continue;
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