# YouTube Audio Extraction API - PHP Backend

Secure PHP backend for extracting YouTube audio URLs. Only accepts requests from `https://nexusnoscreenyoutube.netlify.app/`.

## 📁 Files

- **extract-audio.php** - Main API endpoint for audio extraction
- **health.php** - Health check endpoint
- **.htaccess** - Apache configuration for security and routing

## 🚀 Deployment Instructions

### 1. Upload to Your Shared Hosting

Upload all files in the `php-backend` folder to your shared hosting account:

```
public_html/api/youtube/
├── extract-audio.php
├── health.php
└── .htaccess
```

### 2. Set Correct Permissions

```bash
chmod 644 extract-audio.php
chmod 644 health.php
chmod 644 .htaccess
```

### 3. Test the API

**Health Check:**
```
https://yourdomain.com/api/youtube/health.php
```

**Extract Audio:**
```
https://yourdomain.com/api/youtube/extract-audio.php?videoId=dQw4w9WgXcQ
```

## 🔒 Security Features

- **Origin Restriction**: Only allows requests from `https://nexusnoscreenyoutube.netlify.app/`
- **Input Validation**: Validates video ID format
- **CORS Protection**: Proper CORS headers
- **Rate Limiting**: Can be added via .htaccess (see configuration)

## 📝 API Endpoints

### GET /extract-audio.php

Extract audio URL from YouTube video.

**Parameters:**
- `videoId` (required) - YouTube video ID (11 characters)

**Response (Success - 200):**
```json
{
  "audioUrl": "https://...",
  "format": "webm",
  "codec": "opus",
  "quality": "128000",
  "title": "Video Title",
  "duration": 240,
  "uploader": "Channel Name",
  "thumbnail": "https://i.ytimg.com/vi/.../hqdefault.jpg",
  "source": "Invidious"
}
```

**Response (Error - 503):**
```json
{
  "error": "All extraction methods failed",
  "videoId": "...",
  "message": "Unable to extract audio from this video"
}
```

### GET /health.php

Check API status.

**Response (200):**
```json
{
  "status": "ok",
  "message": "YouTube Audio API is running",
  "version": "1.0.0",
  "timestamp": 1700000000,
  "date": "2025-11-23 12:00:00"
}
```

## 🔧 Configuration

### Update Frontend to Use PHP Backend

After deployment, update your frontend `app.js`:

```javascript
// Replace this line:
const backendUrl = '/.netlify/functions/extract-audio';

// With your PHP backend URL:
const backendUrl = 'https://yourdomain.com/api/youtube/extract-audio.php';
```

## 📊 Extraction Methods

The API tries multiple sources in order:

1. **Invidious API** (6 instances)
   - invidious.fdn.fr
   - iv.nboeck.de
   - yewtu.be
   - invidious.protokolla.fi
   - inv.nadeko.net
   - invidious.privacyredirect.com

2. **Piped API** (3 instances)
   - pipedapi.kavin.rocks
   - pipedapi-libre.kavin.rocks
   - api-piped.mha.fi

## 🛠️ Requirements

- PHP 7.4 or higher
- cURL extension enabled
- Apache with mod_rewrite (optional, for .htaccess)

## 🔍 Troubleshooting

### Use the Test Tool First!
Upload `test.html` to your server and open it in a browser:
```
https://yourdomain.com/api/youtube/test.html
```
This will automatically diagnose common issues.

### "Access denied" error
**Cause:** Origin check failed or CORS issue  
**Solution:**
1. Open browser console (F12) and check the `Origin` header
2. Make sure your Netlify domain is in the `$allowedOrigins` array in `extract-audio.php`
3. If testing locally, the localhost origins are already included

### "Failed to fetch" error
**Cause:** Network/CORS issue  
**Solution:**
1. Open the test.html file and run the CORS test
2. Check browser console for detailed error
3. Verify the PHP file is accessible: try opening `health.php` directly in browser
4. Check `.htaccess` is uploaded and mod_headers is enabled

### "All extraction methods failed"
**Cause:** Invidious/Piped APIs are down or blocked  
**Solution:**
- Check that cURL is enabled: `php -m | grep curl`
- Verify SSL certificate validation (may need to disable on some shared hosts)
- Test individual Invidious/Piped instances manually in browser
- This is temporary - wait a few minutes and try again

### 500 Internal Server Error
**Cause:** PHP error or misconfiguration  
**Solution:**
- Check PHP error logs in your hosting control panel
- Verify file permissions (644 for PHP files)
- Ensure PHP version is 7.4+
- Check syntax: `php -l extract-audio.php`

## 📞 Support

If you encounter issues, check:
- PHP error logs in cPanel/hosting dashboard
- Browser console for CORS errors
- Network tab in developer tools for request/response details
