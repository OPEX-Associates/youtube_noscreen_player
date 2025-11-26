# YouTube Audio Extraction - AWS CDK Deployment

This CDK stack deploys a serverless YouTube audio extraction API to AWS with built-in cost controls and throttling.

## Features

- ✅ **Cost Controls**: Monthly request limits (default: 10,000/month) via API Gateway
- ✅ **Rate Limiting**: API Gateway throttling (default: 10 req/sec)
- ✅ **Minimal Resources**: Only Lambda + API Gateway (no DynamoDB, no CloudWatch)
- ✅ **CORS Support**: Pre-configured for your frontend
- ✅ **Serverless**: Scales automatically, pay only for requests
- ✅ **Ultra-low cost**: ~$0.32/month or FREE within Lambda free tier

## Cost Estimate

**Minimal Setup (10,000 requests/month):**
- **Lambda**: $0.20/month (after free tier: 1M requests/month free)
- **API Gateway**: $0.035/month (REST API: $3.50 per million)
- **Data Transfer**: ~$0.09/month (first 100GB free)
- **Total: ~$0.32/month** or **FREE** if under 1M Lambda requests

**No DynamoDB, No CloudWatch Logs = Lowest possible cost!**

## Prerequisites

1. AWS Account with credentials configured
2. Node.js 18+ installed
3. AWS CDK installed: `npm install -g aws-cdk`

## Configuration

Edit `bin/app.js` to customize:

```javascript
config: {
  monthlyRequestLimit: 10000,    // Max requests per month (API Gateway enforced)
  rateLimit: 10,                 // Max requests per second (API Gateway enforced)
  lambdaTimeout: 30,             // Lambda timeout in seconds
  lambdaMemory: 512,             // Lambda memory in MB
  allowedOrigins: [              // CORS origins
    'https://nexusnoscreenyoutube.netlify.app',
    'http://localhost:8000'
  ]
}
```

## Deployment

1. **Install dependencies**:
   ```bash
   cd cdk
   npm install
   ```

2. **Configure AWS credentials**:
   ```bash
   aws configure
   ```

3. **Bootstrap CDK** (first time only):
   ```bash
   cdk bootstrap
   ```

4. **Deploy**:
   ```bash
   cdk deploy
   ```

## Usage

After deployment, you'll get an API endpoint. Update your frontend:

```javascript
const apiEndpoint = 'https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/prod';

async function getAudioUrl(videoId) {
  const response = await fetch(`${apiEndpoint}/extract-audio?videoId=${videoId}`);
  const data = await response.json();
  return data.audioUrl;
}
```

## Monitoring

View usage and costs:
- **API Gateway Console**: View request metrics
- **Lambda Console**: View invocation count and errors
- **Cost Explorer**: https://console.aws.amazon.com/cost-management

## Throttling Behavior

When limits are hit (enforced by API Gateway):
- **Rate limit exceeded**: Returns 429 "Too Many Requests"
- **Monthly quota exceeded**: Returns 429 until next month resets
- **Automatic enforcement**: No code needed, API Gateway handles it

## Cost Protection

1. **Minimal resources**: Only Lambda + API Gateway (no extras)
2. **Hard monthly quota**: API Gateway stops requests at limit
3. **Rate throttling**: Prevents burst usage
4. **No log retention**: No CloudWatch Logs storage costs
5. **Pay-per-request**: Zero cost when idle

## Adjusting Limits

To change limits after deployment:

```bash
# Edit bin/app.js config
# Then redeploy
cdk deploy
```

## Cleanup

To delete everything:

```bash
cdk destroy
```

⚠️ **Note**: This will delete the DynamoDB table and all request history.

## Troubleshooting

**"Rate limit exceeded"**:
- Increase `rateLimit` in config
- Or wait for the rate window to reset

**"Monthly limit exceeded"**:
- Increase `monthlyRequestLimit` in config
- Or wait until next month

**High costs**:
- Review API Gateway request count
- Consider reducing `lambdaMemory` (256MB minimum)
- Lower `monthlyRequestLimit`

## Security

- CORS restricted to specified origins
- API Gateway rate limiting and quotas
- No data storage (stateless)
- Lambda runs in isolated environment

## Support

For issues or questions, check:
- Lambda Console: Function metrics and errors
- API Gateway Console: Request count and throttling
- Cost Explorer: Daily/monthly costs
