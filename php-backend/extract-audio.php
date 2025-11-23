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

// Check if request is from allowed origin
$originAllowed = false;
foreach ($allowedOrigins as $allowed) {
    if ($origin === $allowed) {
        $originAllowed = true;
        break;
    }
}

// If no origin header (direct browser access) or not allowed, deny
if (empty($origin) || !$originAllowed) {
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

// Try extraction methods
$result = extractViaInvidious($videoId);

if (!$result['success']) {
    $result = extractViaPiped($videoId);
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
        'message' => 'Unable to extract audio from this video. Please try again later.'
    ]);
}
?>
