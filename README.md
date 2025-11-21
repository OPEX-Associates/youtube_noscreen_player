# YouTube Audio Player PWA

A Progressive Web App that extracts audio from YouTube videos and plays them with queue management functionality.

## Features

- 🎵 **Audio-only playback** from YouTube videos
- 📱 **Progressive Web App** - installable on mobile and desktop
- 🎯 **Queue management** - add, remove, and reorder tracks
- 🔀 **Shuffle & Repeat** modes
- ⌨️ **Keyboard shortcuts** for easy control
- 💾 **Offline support** with service worker
- 📱 **Responsive design** for all device sizes
- 🎮 **Media Session API** support for mobile notifications

## Installation

### Local Development

1. Clone or download this repository
2. Serve the files using a local HTTP server (required for PWA features)

```bash
# Using Python
python -m http.server 8000

# Using Node.js http-server
npx http-server -p 8000

# Using PHP
php -S localhost:8000
```

3. Open `http://localhost:8000` in your browser
4. Install the PWA when prompted

### Netlify Deployment

1. Connect your GitHub repository to Netlify
2. No build process is required - set publish directory to `.`
3. Deploy!

The app will be available at your Netlify URL and can be installed as a PWA.

## Audio Extraction Backend

**Important**: This app requires a backend service to extract audio URLs from YouTube videos. The current implementation includes placeholder methods that need to be replaced with a real audio extraction service.

### Option 1: yt-dlp Backend Service

Create a simple backend service using yt-dlp:

```python
# backend/app.py
from flask import Flask, jsonify, request
from flask_cors import CORS
import yt_dlp
import os

app = Flask(__name__)
CORS(app)

@app.route('/api/extract-audio/<video_id>')
def extract_audio(video_id):
    try:\n        url = f'https://www.youtube.com/watch?v={video_id}'\n        \n        ydl_opts = {\n            'format': 'bestaudio/best',\n            'quiet': True,\n            'no_warnings': True,\n        }\n        \n        with yt_dlp.YoutubeDL(ydl_opts) as ydl:\n            info = ydl.extract_info(url, download=False)\n            \n            # Find the best audio format\n            audio_url = None\n            for format in info['formats']:\n                if format.get('acodec') != 'none':\n                    audio_url = format['url']\n                    break\n            \n            return jsonify({\n                'audioUrl': audio_url,\n                'title': info.get('title', 'Unknown Title'),\n                'channel': info.get('uploader', 'Unknown Channel'),\n                'duration': info.get('duration', 0),\n                'thumbnail': info.get('thumbnail', '')\n            })\n    except Exception as e:\n        return jsonify({'error': str(e)}), 400\n\nif __name__ == '__main__':\n    app.run(debug=True)\n```

Deploy this to a service like Railway, Heroku, or your own server.

### Option 2: Serverless Function

Deploy a serverless function on Netlify Functions or Vercel:

```javascript\n// netlify/functions/extract-audio.js\nconst { execSync } = require('child_process');\n\nexports.handler = async (event, context) => {\n  const videoId = event.queryStringParameters.video_id;\n  \n  if (!videoId) {\n    return {\n      statusCode: 400,\n      body: JSON.stringify({ error: 'Missing video_id parameter' })\n    };\n  }\n  \n  try {\n    const url = `https://www.youtube.com/watch?v=${videoId}`;\n    const command = `yt-dlp --dump-json --no-warnings \"${url}\"`;\n    const output = execSync(command, { encoding: 'utf8' });\n    const info = JSON.parse(output);\n    \n    const audioFormat = info.formats.find(f => f.acodec !== 'none');\n    \n    return {\n      statusCode: 200,\n      headers: {\n        'Access-Control-Allow-Origin': '*',\n        'Access-Control-Allow-Headers': 'Content-Type'\n      },\n      body: JSON.stringify({\n        audioUrl: audioFormat?.url,\n        title: info.title,\n        channel: info.uploader,\n        duration: info.duration,\n        thumbnail: info.thumbnail\n      })\n    };\n  } catch (error) {\n    return {\n      statusCode: 500,\n      body: JSON.stringify({ error: error.message })\n    };\n  }\n};\n```

### Option 3: Third-party API

Use a third-party YouTube API service that provides audio stream URLs.

## Usage

1. **Add videos**: Paste YouTube URLs in the input field and click \"Add to Queue\"
2. **Control playback**: Use the player controls or keyboard shortcuts
3. **Manage queue**: Click on queue items to play, or remove them with the trash icon
4. **Install PWA**: Click \"Install\" when the banner appears for the best experience

### Keyboard Shortcuts

- `Space` - Play/Pause\n- `←` - Previous track\n- `→` - Next track\n- `Ctrl+S` - Toggle shuffle\n- `Ctrl+R` - Toggle repeat\n\n## Configuration\n\n### Environment Variables (Netlify)\n\n- `BACKEND_URL` - Your backend service URL for audio extraction\n- `YOUTUBE_API_KEY` - Optional: YouTube API key for enhanced metadata\n\n### Customization\n\n- Edit `manifest.json` to change app name, colors, and icons\n- Modify `styles.css` for custom styling\n- Update `app.js` to change functionality or add features\n\n## Browser Support\n\n- Chrome/Edge 80+\n- Firefox 75+\n- Safari 13+\n- Mobile browsers with PWA support\n\n## Legal Notice\n\n⚠️ **Important**: This application is for educational purposes. Make sure you comply with YouTube's Terms of Service and respect copyright laws when using this application. Only use it for content you have rights to or content that allows such usage.\n\n## Contributing\n\n1. Fork the repository\n2. Create a feature branch\n3. Make your changes\n4. Test thoroughly\n5. Submit a pull request\n\n## License\n\nMIT License - see LICENSE file for details\n\n## Troubleshooting\n\n### Audio Not Playing\n- Ensure your backend service is running and accessible\n- Check browser console for CORS errors\n- Verify YouTube URL format is supported\n\n### PWA Installation Issues\n- Serve over HTTPS (required for PWA)\n- Ensure manifest.json is accessible\n- Check service worker registration in DevTools\n\n### Performance Issues\n- Audio URLs may expire - implement refresh mechanism\n- Consider implementing audio caching for offline playback\n- Monitor network requests for failed audio loads\n\n## Roadmap\n\n- [ ] Playlist import from YouTube\n- [ ] Audio caching for offline playback\n- [ ] Background sync for queue management\n- [ ] Search functionality\n- [ ] User accounts and saved playlists\n- [ ] Social sharing features