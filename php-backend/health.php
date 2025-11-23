<?php
/**
 * Health Check Endpoint
 * Simple endpoint to verify the API is working
 */

$allowedOrigins = [
    'https://nexusnoscreenyoutube.netlify.app',
    'https://noscreenyt.opex.associates',
    'http://localhost:8000',
    'http://127.0.0.1:8000'
];

$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';

// If no origin header, check if it's a same-origin request
if (empty($origin)) {
    $referer = isset($_SERVER['HTTP_REFERER']) ? $_SERVER['HTTP_REFERER'] : '';
    $host = isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : '';
    
    $originAllowed = false;
    foreach ($allowedOrigins as $allowed) {
        $allowedHost = parse_url($allowed, PHP_URL_HOST);
        if (strpos($referer, $allowedHost) !== false || $host === $allowedHost) {
            $origin = $allowed;
            $originAllowed = true;
            break;
        }
    }
    
    if (!$originAllowed) {
        header('HTTP/1.1 403 Forbidden');
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Access denied', 'host' => $host, 'referer' => $referer]);
        exit;
    }
} else {
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
        echo json_encode(['error' => 'Access denied', 'receivedOrigin' => $origin]);
        exit;
    }
}

header("Access-Control-Allow-Origin: $origin");
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

http_response_code(200);
echo json_encode([
    'status' => 'ok',
    'message' => 'YouTube Audio API is running',
    'version' => '1.0.0',
    'timestamp' => time(),
    'date' => date('Y-m-d H:i:s')
]);
?>
