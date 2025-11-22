// Simple test function to verify Netlify Functions are working
exports.handler = async (event, context) => {
  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: 'Netlify Functions are working!',
      timestamp: new Date().toISOString(),
      videoId: event.queryStringParameters?.videoId || 'none'
    })
  };
};