// Rate limiting middleware for Lambda
const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

const REQUEST_TABLE = process.env.REQUEST_TABLE;
const MONTHLY_LIMIT = parseInt(process.env.MONTHLY_LIMIT || '10000');
const RATE_LIMIT = parseInt(process.env.RATE_LIMIT || '10');
const RATE_LIMIT_PERIOD = parseInt(process.env.RATE_LIMIT_PERIOD || '60');

async function checkRateLimit(ipAddress) {
  const now = Date.now();
  const periodStart = now - (RATE_LIMIT_PERIOD * 1000);
  
  try {
    // Query recent requests from this IP
    const result = await dynamodb.query({
      TableName: REQUEST_TABLE,
      KeyConditionExpression: 'ipAddress = :ip AND #ts > :periodStart',
      ExpressionAttributeNames: {
        '#ts': 'timestamp'
      },
      ExpressionAttributeValues: {
        ':ip': ipAddress,
        ':periodStart': periodStart
      }
    }).promise();
    
    const recentRequests = result.Items.length;
    
    if (recentRequests >= RATE_LIMIT) {
      return {
        allowed: false,
        message: `Rate limit exceeded. Maximum ${RATE_LIMIT} requests per ${RATE_LIMIT_PERIOD} seconds.`,
        retryAfter: RATE_LIMIT_PERIOD
      };
    }
    
    // Check monthly limit
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    
    const monthResult = await dynamodb.query({
      TableName: REQUEST_TABLE,
      KeyConditionExpression: 'ipAddress = :ip AND #ts > :monthStart',
      ExpressionAttributeNames: {
        '#ts': 'timestamp'
      },
      ExpressionAttributeValues: {
        ':ip': ipAddress,
        ':monthStart': monthStart.getTime()
      }
    }).promise();
    
    const monthlyRequests = monthResult.Items.length;
    
    if (monthlyRequests >= MONTHLY_LIMIT) {
      return {
        allowed: false,
        message: `Monthly limit of ${MONTHLY_LIMIT} requests exceeded. Resets next month.`,
        retryAfter: null
      };
    }
    
    // Log this request
    await dynamodb.put({
      TableName: REQUEST_TABLE,
      Item: {
        ipAddress: ipAddress,
        timestamp: now,
        ttl: Math.floor(now / 1000) + (90 * 24 * 60 * 60) // 90 days TTL
      }
    }).promise();
    
    return {
      allowed: true,
      remaining: MONTHLY_LIMIT - monthlyRequests - 1,
      monthlyRequests: monthlyRequests + 1
    };
    
  } catch (error) {
    console.error('Rate limit check error:', error);
    // Fail open to avoid blocking legitimate requests
    return { allowed: true };
  }
}

module.exports = { checkRateLimit };
