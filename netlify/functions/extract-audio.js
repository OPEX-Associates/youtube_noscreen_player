// Netlify serverless function for YouTube audio extraction
// Uses direct YouTube extraction with ytdl-core

const ytdl = require('ytdl-core');

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
  
  try {
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    // Get video info and formats
    const info = await ytdl.getInfo(videoUrl);
    
    // Find audio-only formats
    const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
    
    if (audioFormats.length === 0) {
      throw new Error('No audio formats found');
    }
    
    // Prefer OPUS format
    const opusFormat = audioFormats.find(f => f.audioCodec?.includes('opus'));
    const selectedFormat = opusFormat || audioFormats[0];
    
    console.log(`✅ Successfully extracted audio - Format: ${selectedFormat.container}, Codec: ${selectedFormat.audioCodec}`);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        audioUrl: selectedFormat.url,
        format: selectedFormat.container,
        codec: selectedFormat.audioCodec,
        quality: selectedFormat.audioBitrate || 'unknown',
        title: info.videoDetails.title,
        duration: info.videoDetails.lengthSeconds,
        uploader: info.videoDetails.author.name,
        thumbnail: info.videoDetails.thumbnails[0]?.url
      })
    };
    
  } catch (error) {
    console.error('ytdl-core extraction failed:', error.message);
    
    // Fallback to Invidious instances if ytdl-core fails
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