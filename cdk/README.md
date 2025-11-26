# YouTube Audio Extraction - AWS CDK Deployment

This CDK stack deploys a serverless YouTube audio extraction API to AWS with built-in cost controls and throttling.

## Features

- ✅ **Cost Controls**: Monthly request limits (default: 10,000/month)
- ✅ **Rate Limiting**: Per-IP throttling (default: 10 req/min)
- ✅ **CloudWatch Alerts**: Email notifications for high usage or errors
- ✅ **DynamoDB Tracking**: Request tracking with auto-cleanup (90-day TTL)
- ✅ **API Gateway**: Managed API with CORS support
- ✅ **Lambda Function**: Serverless audio extraction
- ✅ **Pay-as-you-go**: Only pay for what you use

## Cost Estimate

With default settings (10,000 requests/month):
- **Lambda**: ~$0.20 (first 1M free)
- **API Gateway**: ~$0.01 (first 1M free for 12 months)
- **DynamoDB**: ~$0.00 (free tier covers it)
- **CloudWatch**: ~$0.50
- **Total: $0-5/month** (mostly free tier)

## Prerequisites

1. AWS Account with credentials configured
2. Node.js 18+ installed
3. AWS CDK installed: `npm install -g aws-cdk`

## Configuration

Edit `bin/app.js` to customize:

```javascript
config: {
  monthlyRequestLimit: 10000,    // Max requests per month
  rateLimit: 10,                 // Max requests per IP per minute
  lambdaTimeout: 30,             // Lambda timeout in seconds
  lambdaMemory: 512,             // Lambda memory in MB
  costAlertThreshold: 10,        // Email alert threshold ($)
  alertEmail: 'your@email.com',  // Alert recipient
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

4. **Set alert email**:
   ```bash
   export ALERT_EMAIL="your-email@example.com"
   ```

5. **Deploy**:
   ```bash
   cdk deploy
   ```

6. **Confirm email subscription**: Check your email for SNS subscription confirmation

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
- **CloudWatch**: https://console.aws.amazon.com/cloudwatch
- **Cost Explorer**: https://console.aws.amazon.com/cost-management
- **DynamoDB Console**: View request logs

## Throttling Behavior

When limits are hit:
- **Rate limit**: Returns 429 with `Retry-After` header
- **Monthly limit**: Returns 429 until next month
- **Graceful degradation**: Continues working within limits

## Cost Protection

1. **Hard monthly limit**: Stops at configured limit
2. **CloudWatch alarms**: Email alerts before overspending
3. **Short log retention**: 7 days to reduce storage costs
4. **DynamoDB TTL**: Auto-cleanup of old records
5. **Pay-per-request**: No idle costs

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
- Check CloudWatch Logs retention
- Review DynamoDB request patterns
- Consider reducing `lambdaMemory`

## Security

- CORS restricted to specified origins
- Optional API key authentication
- Rate limiting per IP
- No sensitive data stored
- CloudWatch audit logs

## Support

For issues or questions, check:
- CloudWatch Logs: `/aws/lambda/youtube-audio-extractor`
- DynamoDB Table: `youtube-audio-requests`
- API Gateway Logs: Check deployment stage
