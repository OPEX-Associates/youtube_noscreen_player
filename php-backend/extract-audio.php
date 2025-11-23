<?php
/**
 * YouTube Audio Extraction API
 * Secure backend for extracting YouTube audio URLs
 * Only allows requests from https://nexusnoscreenyoutube.netlify.app/
 */

// Security: Only allow requests from your Netlify domain
$allowedOrigins = [
    'https://nexusnoscreenyoutube.netlify.app',
    'https://noscreenyt.opex.associates',  // Your actual domain
    'http://localhost:8000',  // For local testing
    'http://127.0.0.1:8000'   // For local testing
];

$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';

// If no origin header, check if it's a same-origin request
if (empty($origin)) {
    // Same-origin requests (test.html on same domain) don't send Origin header
    // Check referer or host instead
    $referer = isset($_SERVER['HTTP_REFERER']) ? $_SERVER['HTTP_REFERER'] : '';
    $host = isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : '';
    
    // Allow if referer or host matches any allowed origin
    $originAllowed = false;
    foreach ($allowedOrigins as $allowed) {
        $allowedHost = parse_url($allowed, PHP_URL_HOST);
        if (strpos($referer, $allowedHost) !== false || $host === $allowedHost) {
            $origin = $allowed; // Set origin for CORS header
            $originAllowed = true;
            break;
        }
    }
    
    if (!$originAllowed) {
        header('HTTP/1.1 403 Forbidden');
        header('Content-Type: application/json');
        echo json_encode([
            'error' => 'Access denied',
            'message' => 'This API can only be accessed from authorized domains',
            'debug' => [
                'receivedOrigin' => '',
                'referer' => $referer,
                'host' => $host,
                'allowedOrigins' => $allowedOrigins
            ]
        ]);
        exit;
    }
} else {
    // Check if origin is in allowed list
    $originAllowed = false;
    foreach ($allowedOrigins as $allowed) {
        if ($origin === $allowed) {
            $originAllowed = true;
            break;
        }
    }
    
    if (!$originAllowed) {
        header('HTTP/1.1 403 Forbidden');
        header('Content-Type: application/json');
        echo json_encode([
            'error' => 'Access denied',
            'message' => 'This API can only be accessed from authorized domains',
            'debug' => [
                'receivedOrigin' => $origin,
                'allowedOrigins' => $allowedOrigins
            ]
        ]);
        exit;
    }
}

// Set CORS headers for the allowed origin
header("Access-Control-Allow-Origin: $origin");
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Accept');
header('Access-Control-Allow-Credentials: true');
header('Content-Type: application/json');

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Get video ID from query parameter
$videoId = isset($_GET['videoId']) ? trim($_GET['videoId']) : '';

if (empty($videoId)) {
    http_response_code(400);
    echo json_encode([
        'error' => 'Missing videoId parameter',
        'message' => 'Please provide a YouTube video ID'
    ]);
    exit;
}

// Validate video ID format (alphanumeric, hyphens, underscores, 11 chars)
if (!preg_match('/^[a-zA-Z0-9_-]{11}$/', $videoId)) {
    http_response_code(400);
    echo json_encode([
        'error' => 'Invalid videoId format',
        'message' => 'Video ID must be 11 characters'
    ]);
    exit;
}

/**
 * Extract audio using Invidious API
 */
function extractViaInvidious($videoId) {
    $instances = [
        'https://invidious.fdn.fr',
        'https://iv.nboeck.de',
        'https://yewtu.be',
        'https://invidious.protokolla.fi',
        'https://inv.nadeko.net',
        'https://invidious.privacyredirect.com'
    ];
    
    foreach ($instances as $instance) {
        try {
            $url = "$instance/api/v1/videos/$videoId?fields=adaptiveFormats,title,author,lengthSeconds";
            
            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, $url);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 8);
            curl_setopt($ch, CURLOPT_HTTPHEADER, ['Accept: application/json']);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false); // For shared hosting compatibility
            
            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            
            if ($httpCode !== 200 || empty($response)) {
                continue;
            }
            
            $data = json_decode($response, true);
            
            if (!isset($data['adaptiveFormats']) || !is_array($data['adaptiveFormats'])) {
                continue;
            }
            
            // Find audio-only formats
            $audioFormats = array_filter($data['adaptiveFormats'], function($format) {
                return isset($format['type']) && 
                       strpos($format['type'], 'audio') !== false && 
                       isset($format['url']);
            });
            
            if (empty($audioFormats)) {
                continue;
            }
            
            // Prefer OPUS format
            $selectedFormat = null;
            foreach ($audioFormats as $format) {
                if (strpos($format['type'], 'opus') !== false) {
                    $selectedFormat = $format;
                    break;
                }
            }
            
            if (!$selectedFormat) {
                $selectedFormat = reset($audioFormats);
            }
            
            return [
                'success' => true,
                'audioUrl' => $selectedFormat['url'],
                'format' => $selectedFormat['container'] ?? 'webm',
                'codec' => $selectedFormat['encoding'] ?? 'opus',
                'quality' => $selectedFormat['bitrate'] ?? 'unknown',
                'title' => $data['title'] ?? 'Unknown',
                'duration' => $data['lengthSeconds'] ?? 0,
                'uploader' => $data['author'] ?? 'Unknown',
                'thumbnail' => "https://i.ytimg.com/vi/$videoId/hqdefault.jpg",
                'source' => 'Invidious'
            ];
            
        } catch (Exception $e) {
            continue;
        }
    }
    
    return ['success' => false, 'error' => 'All Invidious instances failed'];
}

/**
 * Extract audio using Piped API
 */
function extractViaPiped($videoId) {
    $instances = [
        'https://pipedapi.kavin.rocks',
        'https://pipedapi-libre.kavin.rocks',
        'https://api-piped.mha.fi'
    ];
    
    foreach ($instances as $instance) {
        try {
            $url = "$instance/streams/$videoId";
            
            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, $url);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 8);
            curl_setopt($ch, CURLOPT_HTTPHEADER, ['Accept: application/json']);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
            
            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            
            if ($httpCode !== 200 || empty($response)) {
                continue;
            }
            
            $data = json_decode($response, true);
            
            if (!isset($data['audioStreams']) || !is_array($data['audioStreams'])) {
                continue;
            }
            
            $audioStreams = array_filter($data['audioStreams'], function($stream) {
                return isset($stream['url']) && isset($stream['mimeType']);
            });
            
            if (empty($audioStreams)) {
                continue;
            }
            
            // Prefer OPUS
            $selectedStream = null;
            foreach ($audioStreams as $stream) {
                if (strpos($stream['mimeType'], 'opus') !== false) {
                    $selectedStream = $stream;
                    break;
                }
            }
            
            if (!$selectedStream) {
                $selectedStream = reset($audioStreams);
            }
            
            return [
                'success' => true,
                'audioUrl' => $selectedStream['url'],
                'format' => $selectedStream['format'] ?? 'webm',
                'codec' => $selectedStream['codec'] ?? 'opus',
                'quality' => $selectedStream['bitrate'] ?? 'unknown',
                'title' => $data['title'] ?? 'Unknown',
                'duration' => $data['duration'] ?? 0,
                'uploader' => $data['uploader'] ?? 'Unknown',
                'thumbnail' => $data['thumbnailUrl'] ?? "https://i.ytimg.com/vi/$videoId/hqdefault.jpg",
                'source' => 'Piped'
            ];
            
        } catch (Exception $e) {
            continue;
        }
    }
    
    return ['success' => false, 'error' => 'All Piped instances failed'];
}

/**
 * Extract audio using YouTube's Android client API (most reliable for shared hosting)
 */
function extractViaYouTubeAndroidAPI($videoId) {
    try {
        // Use Android client - less likely to be blocked
        $url = "https://www.youtube.com/youtubei/v1/player?key=AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w&prettyPrint=false";
        
        $postData = json_encode([
            'videoId' => $videoId,
            'context' => [
                'client' => [
                    'clientName' => 'ANDROID',
                    'clientVersion' => '19.09.37',
                    'androidSdkVersion' => 30,
                    'hl' => 'en',
                    'gl' => 'US',
                    'utcOffsetMinutes' => 0
                ]
            ],
            'params' => 'CgIQBg==',
            'playbackContext' => [
                'contentPlaybackContext' => [
                    'html5Preference' => 'HTML5_PREF_WANTS'
                ]
            ],
            'contentCheckOk' => true,
            'racyCheckOk' => true
        ]);
        
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'User-Agent: com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip',
            'X-YouTube-Client-Name: 3',
            'X-YouTube-Client-Version: 19.09.37',
            'Accept-Encoding: gzip, deflate'
        ]);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);
        
        if (!empty($curlError)) {
            return ['success' => false, 'error' => "cURL error: $curlError"];
        }
        
        if ($httpCode !== 200 || empty($response)) {
            return ['success' => false, 'error' => "YouTube API returned HTTP $httpCode"];
        }
        
        // Decompress if gzipped
        if (function_exists('gzdecode') && substr($response, 0, 2) === "\x1f\x8b") {
            $response = gzdecode($response);
        }
        
        $data = json_decode($response, true);
        
        if (!$data) {
            $jsonError = json_last_error_msg();
            return ['success' => false, 'error' => "JSON parse error: $jsonError", 'preview' => substr($response, 0, 200)];
        }
        
        // Check playability
        if (isset($data['playabilityStatus']['status']) && $data['playabilityStatus']['status'] !== 'OK') {
            $reason = $data['playabilityStatus']['reason'] ?? 'Unknown reason';
            return ['success' => false, 'error' => "Video not playable: $reason"];
        }
        
        if (!isset($data['streamingData']['adaptiveFormats'])) {
            return ['success' => false, 'error' => 'No streaming data available'];
        }
        
        // Find audio-only formats
        $audioFormats = array_filter($data['streamingData']['adaptiveFormats'], function($format) {
            return isset($format['mimeType']) && 
                   strpos($format['mimeType'], 'audio') !== false && 
                   isset($format['url']);
        });
        
        if (empty($audioFormats)) {
            return ['success' => false, 'error' => 'No audio formats with direct URLs found'];
        }
        
        // Prefer OPUS format, fallback to any audio
        $selectedFormat = null;
        foreach ($audioFormats as $format) {
            if (strpos($format['mimeType'], 'opus') !== false) {
                $selectedFormat = $format;
                break;
            }
        }
        
        if (!$selectedFormat) {
            $selectedFormat = reset($audioFormats);
        }
        
        $videoDetails = $data['videoDetails'] ?? [];
        
        return [
            'success' => true,
            'audioUrl' => $selectedFormat['url'],
            'format' => 'webm',
            'codec' => strpos($selectedFormat['mimeType'], 'opus') !== false ? 'opus' : 'mp4a',
            'quality' => $selectedFormat['bitrate'] ?? 'unknown',
            'title' => $videoDetails['title'] ?? 'Unknown',
            'duration' => $videoDetails['lengthSeconds'] ?? 0,
            'uploader' => $videoDetails['author'] ?? 'Unknown',
            'thumbnail' => "https://i.ytimg.com/vi/$videoId/hqdefault.jpg",
            'source' => 'YouTube Android API'
        ];
        
    } catch (Exception $e) {
        return ['success' => false, 'error' => "Exception: " . $e->getMessage()];
    }
}

/**
 * Extract audio using YouTube Mobile Web client (bypasses bot detection better)
 */
function extractViaYouTubeMWeb($videoId) {
    try {
        $url = "https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8&prettyPrint=false";
        
        $postData = json_encode([
            'videoId' => $videoId,
            'context' => [
                'client' => [
                    'clientName' => 'MWEB',
                    'clientVersion' => '2.20240304.08.00',
                    'hl' => 'en',
                    'gl' => 'US',
                    'utcOffsetMinutes' => 0
                ]
            ],
            'playbackContext' => [
                'contentPlaybackContext' => [
                    'html5Preference' => 'HTML5_PREF_WANTS',
                    'signatureTimestamp' => time()
                ]
            ]
        ]);
        
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'User-Agent: Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.101 Mobile Safari/537.36',
            'X-YouTube-Client-Name: 2',
            'X-YouTube-Client-Version: 2.20240304.08.00',
            'Origin: https://m.youtube.com',
            'Referer: https://m.youtube.com/'
        ]);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_ENCODING, '');
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);
        
        if (!empty($curlError)) {
            return ['success' => false, 'error' => "cURL error: $curlError"];
        }
        
        if ($httpCode !== 200 || empty($response)) {
            return ['success' => false, 'error' => "HTTP $httpCode"];
        }
        
        $data = json_decode($response, true);
        
        if (!$data) {
            return ['success' => false, 'error' => 'JSON parse failed: ' . json_last_error_msg()];
        }
        
        // Check playability
        if (isset($data['playabilityStatus']['status']) && $data['playabilityStatus']['status'] !== 'OK') {
            $reason = $data['playabilityStatus']['reason'] ?? 'Unknown';
            return ['success' => false, 'error' => "Not playable: $reason"];
        }
        
        if (!isset($data['streamingData']['adaptiveFormats'])) {
            return ['success' => false, 'error' => 'No streaming data'];
        }
        
        // Find audio-only formats
        $audioFormats = array_filter($data['streamingData']['adaptiveFormats'], function($format) {
            return isset($format['mimeType']) && 
                   strpos($format['mimeType'], 'audio') !== false && 
                   isset($format['url']);
        });
        
        if (empty($audioFormats)) {
            return ['success' => false, 'error' => 'No audio formats with URLs'];
        }
        
        // Prefer OPUS
        $selectedFormat = null;
        foreach ($audioFormats as $format) {
            if (strpos($format['mimeType'], 'opus') !== false) {
                $selectedFormat = $format;
                break;
            }
        }
        
        if (!$selectedFormat) {
            $selectedFormat = reset($audioFormats);
        }
        
        $videoDetails = $data['videoDetails'] ?? [];
        
        return [
            'success' => true,
            'audioUrl' => $selectedFormat['url'],
            'format' => 'webm',
            'codec' => strpos($selectedFormat['mimeType'], 'opus') !== false ? 'opus' : 'mp4a',
            'quality' => $selectedFormat['bitrate'] ?? 'unknown',
            'title' => $videoDetails['title'] ?? 'Unknown',
            'duration' => $videoDetails['lengthSeconds'] ?? 0,
            'uploader' => $videoDetails['author'] ?? 'Unknown',
            'thumbnail' => "https://i.ytimg.com/vi/$videoId/hqdefault.jpg",
            'source' => 'YouTube Mobile Web'
        ];
        
    } catch (Exception $e) {
        return ['success' => false, 'error' => $e->getMessage()];
    }
}

/**
 * Extract audio using YouTube iOS client (another reliable method)
 */
function extractViaYouTubeiOS($videoId) {
    try {
        $url = "https://www.youtube.com/youtubei/v1/player?key=AIzaSyB-63vPrdThhKuerbB2N_l7Kwwcxj6yUAc&prettyPrint=false";
        
        $postData = json_encode([
            'videoId' => $videoId,
            'context' => [
                'client' => [
                    'clientName' => 'IOS',
                    'clientVersion' => '19.09.3',
                    'deviceModel' => 'iPhone14,3',
                    'hl' => 'en',
                    'gl' => 'US',
                    'utcOffsetMinutes' => 0
                ]
            ],
            'playbackContext' => [
                'contentPlaybackContext' => [
                    'html5Preference' => 'HTML5_PREF_WANTS'
                ]
            ]
        ]);
        
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'User-Agent: com.google.ios.youtube/19.09.3 (iPhone14,3; U; CPU iOS 15_6 like Mac OS X)',
            'X-YouTube-Client-Name: 5',
            'X-YouTube-Client-Version: 19.09.3'
        ]);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_ENCODING, ''); // Accept all encodings
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);
        
        if (!empty($curlError)) {
            return ['success' => false, 'error' => "cURL error: $curlError"];
        }
        
        if ($httpCode !== 200 || empty($response)) {
            return ['success' => false, 'error' => "HTTP $httpCode"];
        }
        
        $data = json_decode($response, true);
        
        if (!$data) {
            return ['success' => false, 'error' => 'JSON parse failed: ' . json_last_error_msg()];
        }
        
        // Check playability
        if (isset($data['playabilityStatus']['status']) && $data['playabilityStatus']['status'] !== 'OK') {
            $reason = $data['playabilityStatus']['reason'] ?? 'Unknown';
            return ['success' => false, 'error' => "Not playable: $reason"];
        }
        
        if (!isset($data['streamingData']['adaptiveFormats'])) {
            return ['success' => false, 'error' => 'No streaming data'];
        }
        
        // Find audio-only formats
        $audioFormats = array_filter($data['streamingData']['adaptiveFormats'], function($format) {
            return isset($format['mimeType']) && 
                   strpos($format['mimeType'], 'audio') !== false && 
                   isset($format['url']);
        });
        
        if (empty($audioFormats)) {
            return ['success' => false, 'error' => 'No audio formats with URLs'];
        }
        
        // Prefer OPUS
        $selectedFormat = null;
        foreach ($audioFormats as $format) {
            if (strpos($format['mimeType'], 'opus') !== false) {
                $selectedFormat = $format;
                break;
            }
        }
        
        if (!$selectedFormat) {
            $selectedFormat = reset($audioFormats);
        }
        
        $videoDetails = $data['videoDetails'] ?? [];
        
        return [
            'success' => true,
            'audioUrl' => $selectedFormat['url'],
            'format' => 'webm',
            'codec' => strpos($selectedFormat['mimeType'], 'opus') !== false ? 'opus' : 'mp4a',
            'quality' => $selectedFormat['bitrate'] ?? 'unknown',
            'title' => $videoDetails['title'] ?? 'Unknown',
            'duration' => $videoDetails['lengthSeconds'] ?? 0,
            'uploader' => $videoDetails['author'] ?? 'Unknown',
            'thumbnail' => "https://i.ytimg.com/vi/$videoId/hqdefault.jpg",
            'source' => 'YouTube iOS'
        ];
        
    } catch (Exception $e) {
        return ['success' => false, 'error' => $e->getMessage()];
    }
}

/**
 * Extract audio using YouTube TV client (very reliable, used by yt-dlp)
 */
function extractViaYouTubeTV($videoId) {
    try {
        $url = "https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8&prettyPrint=false";
        
        $postData = json_encode([
            'videoId' => $videoId,
            'context' => [
                'client' => [
                    'clientName' => 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
                    'clientVersion' => '2.0',
                    'hl' => 'en',
                    'gl' => 'US',
                    'platform' => 'TV'
                ],
                'thirdParty' => [
                    'embedUrl' => 'https://www.youtube.com/'
                ]
            ],
            'playbackContext' => [
                'contentPlaybackContext' => [
                    'signatureTimestamp' => 0
                ]
            ]
        ]);
        
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'User-Agent: Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version',
            'Origin: https://www.youtube.com'
        ]);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);
        
        if (!empty($curlError)) {
            return ['success' => false, 'error' => "cURL error: $curlError"];
        }
        
        if ($httpCode !== 200 || empty($response)) {
            return ['success' => false, 'error' => "HTTP $httpCode"];
        }
        
        $data = json_decode($response, true);
        
        if (!$data) {
            return ['success' => false, 'error' => 'JSON parse failed'];
        }
        
        // Check playability
        if (isset($data['playabilityStatus']['status']) && $data['playabilityStatus']['status'] !== 'OK') {
            $reason = $data['playabilityStatus']['reason'] ?? 'Unknown';
            return ['success' => false, 'error' => "Not playable: $reason"];
        }
        
        if (!isset($data['streamingData']['adaptiveFormats'])) {
            return ['success' => false, 'error' => 'No streaming data'];
        }
        
        // Find audio-only formats
        $audioFormats = array_filter($data['streamingData']['adaptiveFormats'], function($format) {
            return isset($format['mimeType']) && 
                   strpos($format['mimeType'], 'audio') !== false && 
                   isset($format['url']);
        });
        
        if (empty($audioFormats)) {
            return ['success' => false, 'error' => 'No audio formats'];
        }
        
        // Prefer OPUS
        $selectedFormat = null;
        foreach ($audioFormats as $format) {
            if (strpos($format['mimeType'], 'opus') !== false) {
                $selectedFormat = $format;
                break;
            }
        }
        
        if (!$selectedFormat) {
            $selectedFormat = reset($audioFormats);
        }
        
        $videoDetails = $data['videoDetails'] ?? [];
        
        return [
            'success' => true,
            'audioUrl' => $selectedFormat['url'],
            'format' => 'webm',
            'codec' => strpos($selectedFormat['mimeType'], 'opus') !== false ? 'opus' : 'mp4a',
            'quality' => $selectedFormat['bitrate'] ?? 'unknown',
            'title' => $videoDetails['title'] ?? 'Unknown',
            'duration' => $videoDetails['lengthSeconds'] ?? 0,
            'uploader' => $videoDetails['author'] ?? 'Unknown',
            'thumbnail' => "https://i.ytimg.com/vi/$videoId/hqdefault.jpg",
            'source' => 'YouTube TV'
        ];
        
    } catch (Exception $e) {
        return ['success' => false, 'error' => $e->getMessage()];
    }
}

// Try extraction methods in order of reliability (inspired by yt-dlp's approach)
$allErrors = [];

// 1. YouTube TV Client (used by yt-dlp, very reliable)
$result = extractViaYouTubeTV($videoId);
if ($result['success']) {
    http_response_code(200);
    unset($result['success']);
    echo json_encode($result);
    exit;
}
$allErrors['TV Client'] = $result['error'] ?? 'Unknown error';

// 2. YouTube Mobile Web (best for avoiding bot detection)
$result = extractViaYouTubeMWeb($videoId);
if ($result['success']) {
    http_response_code(200);
    unset($result['success']);
    echo json_encode($result);
    exit;
}
$allErrors['Mobile Web'] = $result['error'] ?? 'Unknown error';

// 3. YouTube Android API
$result = extractViaYouTubeAndroidAPI($videoId);
if ($result['success']) {
    http_response_code(200);
    unset($result['success']);
    echo json_encode($result);
    exit;
}
$allErrors['Android API'] = $result['error'] ?? 'Unknown error';

// 4. YouTube iOS API
$result = extractViaYouTubeiOS($videoId);
if ($result['success']) {
    http_response_code(200);
    unset($result['success']);
    echo json_encode($result);
    exit;
}
$allErrors['iOS API'] = $result['error'] ?? 'Unknown error';

// 5. Fallback to Piped
$result = extractViaPiped($videoId);
if ($result['success']) {
    http_response_code(200);
    unset($result['success']);
    echo json_encode($result);
    exit;
}
$allErrors['Piped'] = $result['error'] ?? 'Unknown error';

// 6. Last resort: Invidious
$result = extractViaInvidious($videoId);
if ($result['success']) {
    http_response_code(200);
    unset($result['success']);
    echo json_encode($result);
    exit;
}
$allErrors['Invidious'] = $result['error'] ?? 'Unknown error';

// All methods failed - return comprehensive error
http_response_code(503);
echo json_encode([
    'error' => 'All extraction methods failed',
    'videoId' => $videoId,
    'message' => 'Unable to extract audio from this video. Please try again later.',
    'errors' => $allErrors
]);
?>
