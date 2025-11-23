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
 * Extract audio using YouTube's innertube API (more reliable)
 */
function extractViaYouTubeInnertube($videoId) {
    try {
        $apiKey = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8'; // Public YouTube API key
        $url = "https://www.youtube.com/youtubei/v1/player?key=$apiKey";
        
        $postData = json_encode([
            'context' => [
                'client' => [
                    'clientName' => 'WEB',
                    'clientVersion' => '2.20231219.01.00',
                    'hl' => 'en',
                    'gl' => 'US'
                ]
            ],
            'videoId' => $videoId
        ]);
        
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        ]);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        
        if ($httpCode !== 200 || empty($response)) {
            return ['success' => false, 'error' => "YouTube API returned HTTP $httpCode"];
        }
        
        $data = json_decode($response, true);
        
        if (!$data) {
            return ['success' => false, 'error' => 'Failed to parse YouTube response', 'raw' => substr($response, 0, 500)];
        }
        
        if (isset($data['playabilityStatus']['status']) && $data['playabilityStatus']['status'] !== 'OK') {
            return [
                'success' => false, 
                'error' => 'Video not playable: ' . ($data['playabilityStatus']['reason'] ?? 'Unknown reason'),
                'status' => $data['playabilityStatus']['status']
            ];
        }
        
        if (!isset($data['streamingData']['adaptiveFormats'])) {
            return ['success' => false, 'error' => 'No streaming data available', 'debug' => array_keys($data)];
        }
        
        // Find audio-only formats
        $audioFormats = array_filter($data['streamingData']['adaptiveFormats'], function($format) {
            return isset($format['mimeType']) && 
                   strpos($format['mimeType'], 'audio') !== false && 
                   isset($format['url']);
        });
        
        if (empty($audioFormats)) {
            return ['success' => false, 'error' => 'No audio formats found'];
        }
        
        // Prefer OPUS format
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
            'source' => 'YouTube Innertube'
        ];
        
    } catch (Exception $e) {
        return ['success' => false, 'error' => $e->getMessage()];
    }
}

// Try extraction methods in order of reliability
// 1. YouTube's own API (most reliable)
$result = extractViaYouTubeInnertube($videoId);

// 2. Fallback to Piped
if (!$result['success']) {
    $result = extractViaPiped($videoId);
}

// 3. Fallback to Invidious
if (!$result['success']) {
    $result = extractViaInvidious($videoId);
}

// Return result
if ($result['success']) {
    http_response_code(200);
    unset($result['success']);
    echo json_encode($result);
} else {
    http_response_code(503);
    echo json_encode([
        'error' => 'All extraction methods failed',
        'videoId' => $videoId,
        'message' => 'Unable to extract audio from this video. Please try again later.',
        'lastError' => $result['error'] ?? 'Unknown error'
    ]);
}
?>
