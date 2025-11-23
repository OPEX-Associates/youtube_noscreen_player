# PHP Backend Deployment Guide

Complete guide to deploy and configure your PHP backend.

## 📦 What You Have

A complete PHP backend in the `php-backend` folder:
- `extract-audio.php` - Main API for YouTube audio extraction
- `health.php` - Health check endpoint
- `.htaccess` - Security and Apache configuration
- `README.md` - Full documentation

## 🚀 Step-by-Step Deployment

### Step 1: Access Your Shared Hosting

1. Log into your cPanel or hosting control panel
2. Open **File Manager**
3. Navigate to `public_html` (or your web root)

### Step 2: Create API Directory

Create this folder structure:
```
public_html/
└── api/
    └── youtube/
        ├── extract-audio.php
        ├── health.php
        └── .htaccess
```

### Step 3: Upload Files

1. Navigate to `public_html/api/youtube/`
2. Upload all 3 files from your `php-backend` folder:
   - `extract-audio.php`
   - `health.php`
   - `.htaccess`

### Step 4: Set Permissions

In File Manager, right-click each file and set permissions:
- `extract-audio.php` → **644**
- `health.php` → **644**
- `.htaccess` → **644**

### Step 5: Test Your API

**Test Health Check:**
Open in browser:
```
https://yourdomain.com/api/youtube/health.php
```

You should see:
```json
{
  "status": "ok",
  "message": "YouTube Audio API is running",
  "version": "1.0.0",
  "timestamp": 1700000000,
  "date": "2025-11-23 12:00:00"
}
```

**Test Audio Extraction:**
```
https://yourdomain.com/api/youtube/extract-audio.php?videoId=dQw4w9WgXcQ
```

Should return audio URL and metadata.

### Step 6: Update Frontend Configuration

1. Open `app.js` in your project
2. Find this line (around line 292):
```javascript
const phpBackendUrl = 'YOUR_DOMAIN_HERE';
```

3. Replace with your actual URL:
```javascript
const phpBackendUrl = 'https://yourdomain.com/api/youtube/extract-audio.php';
```

4. Commit and push to GitHub:
```bash
git add app.js
git commit -m "Configure PHP backend URL"
git push origin main
```

Netlify will auto-deploy your updated frontend.

## 🔒 Security Verification

Your API is secured and only accepts requests from:
```
https://nexusnoscreenyoutube.netlify.app/
```

**Test Security:**
1. Try accessing the API directly in a new browser tab
2. You should get: `{"error":"Access denied"}`
3. This is correct! It only works when called from your Netlify site.

## 🧪 Testing from Your Netlify Site

1. Go to `https://nexusnoscreenyoutube.netlify.app/?debug=true`
2. Paste a YouTube URL and click "Add to Queue"
3. Watch the debug logs - you should see:
   ```
   Trying PHP backend extraction...
   PHP backend response status: 200
   ✅ PHP backend extraction succeeded!
   ```

## 🐛 Troubleshooting

### Error: "Access denied"
**Cause:** Origin check failed  
**Fix:** Verify you're accessing from `https://nexusnoscreenyoutube.netlify.app/`

### Error: "500 Internal Server Error"
**Cause:** PHP error or permissions issue  
**Fix:** 
1. Check PHP error logs in cPanel
2. Verify file permissions (644)
3. Ensure PHP 7.4+ is active

### Error: "cURL not enabled"
**Cause:** cURL extension missing  
**Fix:** Enable cURL in PHP settings (cPanel → Select PHP Version → Extensions → curl)

### Error: "All extraction methods failed"
**Cause:** All Invidious/Piped instances are down  
**Fix:** This is temporary - wait a few minutes and try again

### CORS Error in Browser Console
**Cause:** Wrong origin or missing headers  
**Fix:** 
1. Check `.htaccess` is uploaded
2. Verify Apache `mod_headers` is enabled
3. Contact hosting support if needed

## 📊 Monitoring

Check your API health regularly:
```
https://yourdomain.com/api/youtube/health.php
```

Expected response time: < 1 second

## 🔄 Updates

To update the API:
1. Edit files in `php-backend` folder
2. Upload to your hosting via FTP/File Manager
3. No restart required - changes take effect immediately

## 📞 Support Checklist

If you need help, gather this info:
- [ ] Hosting provider name
- [ ] PHP version (`php -v` or cPanel)
- [ ] cURL enabled? (check PHP info)
- [ ] mod_rewrite enabled? (check Apache modules)
- [ ] Error from PHP logs
- [ ] Browser console errors (F12)
- [ ] Response from health.php

## 🎯 Next Steps

After successful deployment:
1. ✅ Test with debug mode: `?debug=true`
2. ✅ Try multiple videos
3. ✅ Check queue functionality
4. ✅ Test on mobile devices
5. ✅ Monitor for a few days

## ⚠️ Important Notes

- **Never share your backend URL publicly** - it's secured but keep it private
- **Monitor usage** - shared hosting has bandwidth limits
- **Rate limiting** - Consider adding if you get high traffic
- **Backup** - Keep a copy of your PHP files locally

Your backend is now ready! 🚀
