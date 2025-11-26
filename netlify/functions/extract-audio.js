// AWS Lambda function for YouTube audio extraction
// Uses Cobalt API, Piped API, and YouTube's internal APIs

/**
 * Extract audio using Cobalt API (most reliable download service)
 */
async function extractViaCobalt(videoId) {
  const cobaltInstances = [
    'https://api.cobalt.tools',
    'https://co.wuk.sh'
  ];
  
  for (const instance of cobaltInstances) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(`${instance}/api/json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          url: `https://www.youtube.com/watch?v=${videoId}`,
          isAudioOnly: true,
          aFormat: 'best'
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeout);
      
      if (!response.ok) {
        console.log(`Cobalt ${instance} returned ${response.status}`);
        continue;
      }
      
      const data = await response.json();
      
      if (data.status === 'redirect' || data.status === 'stream') {
        const audioUrl = data.url;
        
        return {
          audioUrl: audioUrl,
          format: 'opus',
          codec: 'opus',
          quality: 'best',
          title: `YouTube Video ${videoId}`,
          duration: 0,
          uploader: 'Unknown',
          thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          source: `Cobalt (${instance})`
        };
      }
      
      console.log(`Cobalt ${instance} failed:`, data.text || 'Unknown error');
    } catch (error) {
      console.log(`Cobalt ${instance} error:`, error.message);
      continue;
    }
  }
  
  throw new Error('All Cobalt instances failed');
}

/**
 * Extract audio using Piped API (privacy-focused YouTube frontend)
 */
async function extractViaPiped(videoId) {
  const pipedInstances = [
    'https://pipedapi.kavin.rocks',
    'https://pipedapi.tokhmi.xyz',
    'https://pipedapi.moomoo.me',
    'https://api-piped.mha.fi',
    'https://pipedapi.syncpundit.io'
  ];
  
  const errors = [];
  
  for (const instance of pipedInstances) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      
      const response = await fetch(`${instance}/streams/${videoId}`, {
        headers: { 
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'application/json'
        },
        signal: controller.signal
      });
      
      clearTimeout(timeout);
      
      if (!response.ok) {
        errors.push(`${instance}: HTTP ${response.status}`);
        continue;
      }
      
      const data = await response.json();
      
      const audioStreams = data.audioStreams || [];
      if (audioStreams.length === 0) {
        errors.push(`${instance}: No audio streams`);
        continue;
      }
      
      // Prefer opus format
      const opusStream = audioStreams.find(s => s.codec?.includes('opus')) || audioStreams[0];
      
      console.log(`✅ Piped ${instance} succeeded`);
      
      return {
        audioUrl: opusStream.url,
        format: opusStream.format || 'webm',
        codec: opusStream.codec || 'opus',
        quality: opusStream.bitrate || 'unknown',
        title: data.title,
        duration: data.duration,
        uploader: data.uploader,
        thumbnail: data.thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        source: `Piped (${instance})`
      };
    } catch (error) {
      errors.push(`${instance}: ${error.message}`);
      continue;
    }
  }
  
  throw new Error(`All Piped instances failed: ${errors.join(', ')}`);
}

/**
 * Extract audio using YouTube TV client (very reliable, used by yt-dlp)
 */
async function extractViaYouTubeTV(videoId) {
  const url = "https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8&prettyPrint=false";
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version',
      'Origin': 'https://www.youtube.com'
    },
    body: JSON.stringify({
      videoId: videoId,
      context: {
        client: {
          clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
          clientVersion: '2.0',
          hl: 'en',
          gl: 'US',
          platform: 'TV'
        },
        thirdParty: {
          embedUrl: 'https://www.youtube.com/'
        }
      },
      playbackContext: {
        contentPlaybackContext: {
          signatureTimestamp: 0
        }
      }
    })
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  
  const data = await response.json();
  
  if (data.playabilityStatus?.status !== 'OK') {
    throw new Error(data.playabilityStatus?.reason || 'Video not playable');
  }
  
  const audioFormats = data.streamingData?.adaptiveFormats?.filter(f => 
    f.mimeType?.includes('audio') && f.url
  ) || [];
  
  if (audioFormats.length === 0) {
    throw new Error('No audio formats found');
  }
  
  const opusFormat = audioFormats.find(f => f.mimeType.includes('opus'));
  const selectedFormat = opusFormat || audioFormats[0];
  const videoDetails = data.videoDetails || {};
  
  return {
    audioUrl: selectedFormat.url,
    format: 'webm',
    codec: selectedFormat.mimeType.includes('opus') ? 'opus' : 'mp4a',
    quality: selectedFormat.bitrate || 'unknown',
    title: videoDetails.title || 'Unknown',
    duration: videoDetails.lengthSeconds || 0,
    uploader: videoDetails.author || 'Unknown',
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    source: 'YouTube TV'
  };
}

/**
 * Extract audio using YouTube Mobile Web client
 */
async function extractViaYouTubeMWeb(videoId) {
  const url = "https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8&prettyPrint=false";
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.101 Mobile Safari/537.36',
      'X-YouTube-Client-Name': '2',
      'X-YouTube-Client-Version': '2.20240304.08.00',
      'Origin': 'https://m.youtube.com',
      'Referer': 'https://m.youtube.com/'
    },
    body: JSON.stringify({
      videoId: videoId,
      context: {
        client: {
          clientName: 'MWEB',
          clientVersion: '2.20240304.08.00',
          hl: 'en',
          gl: 'US',
          utcOffsetMinutes: 0
        }
      },
      playbackContext: {
        contentPlaybackContext: {
          html5Preference: 'HTML5_PREF_WANTS',
          signatureTimestamp: Date.now()
        }
      }
    })
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  
  const data = await response.json();
  
  if (data.playabilityStatus?.status !== 'OK') {
    throw new Error(data.playabilityStatus?.reason || 'Video not playable');
  }
  
  const audioFormats = data.streamingData?.adaptiveFormats?.filter(f => 
    f.mimeType?.includes('audio') && f.url
  ) || [];
  
  if (audioFormats.length === 0) {
    throw new Error('No audio formats found');
  }
  
  const opusFormat = audioFormats.find(f => f.mimeType.includes('opus'));
  const selectedFormat = opusFormat || audioFormats[0];
  const videoDetails = data.videoDetails || {};
  
  return {
    audioUrl: selectedFormat.url,
    format: 'webm',
    codec: selectedFormat.mimeType.includes('opus') ? 'opus' : 'mp4a',
    quality: selectedFormat.bitrate || 'unknown',
    title: videoDetails.title || 'Unknown',
    duration: videoDetails.lengthSeconds || 0,
    uploader: videoDetails.author || 'Unknown',
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    source: 'YouTube Mobile Web'
  };
}

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
  
  const errors = {};
  
  // Method 1: Cobalt API (most reliable currently)
  try {
    console.log('Trying Cobalt API...');
    const cobaltResult = await extractViaCobalt(videoId);
    if (cobaltResult.audioUrl) {
      console.log('✅ Cobalt API succeeded');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(cobaltResult)
      };
    }
  } catch (cobaltError) {
    console.error('Cobalt API failed:', cobaltError.message);
    errors['Cobalt'] = cobaltError.message;
  }
  
  // Method 2: Piped API (privacy-focused)
  try {
    console.log('Trying Piped API...');
    const pipedResult = await extractViaPiped(videoId);
    if (pipedResult.audioUrl) {
      console.log('✅ Piped API succeeded');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(pipedResult)
      };
    }
  } catch (pipedError) {
    console.error('Piped API failed:', pipedError.message);
    errors['Piped'] = pipedError.message;
  }
  
  // Method 2: YouTube TV Client
  try {
    console.log('Trying YouTube TV client...');
    const tvResult = await extractViaYouTubeTV(videoId);
    if (tvResult.audioUrl) {
      console.log('✅ TV client succeeded');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(tvResult)
      };
    }
  } catch (tvError) {
    console.error('TV client failed:', tvError.message);
    errors['TV Client'] = tvError.message;
  }
  
  // Method 3: YouTube Mobile Web
  try {
    console.log('Trying YouTube Mobile Web...');
    const mwebResult = await extractViaYouTubeMWeb(videoId);
    if (mwebResult.audioUrl) {
      console.log('✅ Mobile Web succeeded');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(mwebResult)
      };
    }
  } catch (mwebError) {
    console.error('Mobile Web failed:', mwebError.message);
    errors['Mobile Web'] = mwebError.message;
  }
  
  // Method 4: Invidious instances (last resort)
  const invidiousInstances = [
    'https://invidious.fdn.fr',
    'https://iv.nboeck.de',
    'https://invidious.projectsegfau.lt',
    'https://yewtu.be',
    'https://invidious.protokolla.fi',
    'https://iv.melmac.space'
  ];
  
  const tryInvidiousInstance = async (instance) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    try {
      const response = await fetch(`${instance}/api/v1/videos/${videoId}?fields=adaptiveFormats,title,author,lengthSeconds`, {
        headers: { 'Accept': 'application/json' },
        signal: controller.signal
      });
      
      clearTimeout(timeout);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
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
          thumbnail: data.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          source: 'Invidious'
        };
      }
      
      throw new Error('No audio formats found');
      
    } catch (error) {
      console.log(`Invidious ${instance} failed:`, error.message);
      throw error;
    }
  };
  
  // Try Invidious instances one by one
  for (const instance of invidiousInstances) {
    try {
      const result = await tryInvidiousInstance(instance);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(result)
      };
    } catch (error) {
      errors[`Invidious ${instance}`] = error.message;
      continue;
    }
  }
  
  // All methods failed
  console.error('All extraction methods failed for videoId:', videoId);
  console.error('Errors:', errors);
  
  return {
    statusCode: 503,
    headers,
    body: JSON.stringify({ 
      error: 'All audio extraction services are currently unavailable',
      videoId: videoId,
      message: 'Unable to extract audio from this video. Please try again later.',
      errors: errors
    })
  };
};
