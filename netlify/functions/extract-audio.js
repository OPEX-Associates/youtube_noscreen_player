const { execSync } = require('child_process');

exports.handler = async (event, context) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
  
  try {
    console.log('Extracting audio for:', videoId);
    
    // Use yt-dlp to get audio stream info
    const command = `yt-dlp --dump-json --no-warnings "https://www.youtube.com/watch?v=${videoId}"`;
    const output = execSync(command, { 
      encoding: 'utf8', 
      timeout: 30000,
      maxBuffer: 1024 * 1024 * 10 // 10MB buffer
    });
    
    const info = JSON.parse(output);
    
    // Find the best audio format (prefer OPUS)
    const formats = info.formats || [];
    const audioFormats = formats.filter(f => 
      f.acodec && f.acodec !== 'none' && 
      (!f.vcodec || f.vcodec === 'none') && f.url
    );
    
    if (audioFormats.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'No audio formats found' })
      };
    }
    
    // Prefer OPUS, then M4A, then WebM
    const opusFormat = audioFormats.find(f => f.acodec && f.acodec.includes('opus'));
    const m4aFormat = audioFormats.find(f => f.ext === 'm4a');
    const webmFormat = audioFormats.find(f => f.ext === 'webm');
    
    const bestFormat = opusFormat || m4aFormat || webmFormat || audioFormats[0];
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        audioUrl: bestFormat.url,
        format: bestFormat.ext,
        codec: bestFormat.acodec,
        quality: bestFormat.abr || bestFormat.tbr || 'unknown',
        title: info.title,
        duration: info.duration,
        uploader: info.uploader || info.channel,
        thumbnail: info.thumbnail
      })
    };
    
  } catch (error) {
    console.error('Extraction error:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to extract audio',
        details: error.message 
      })
    };
  }
};