#!/usr/bin/env node
const cdk = require('aws-cdk-lib');
const { YouTubeAudioStack } = require('../lib/youtube-audio-stack');

const app = new cdk.App();

new YouTubeAudioStack(app, 'YouTubeAudioStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1'
  },
  description: 'YouTube Audio Extraction API with cost controls and throttling',
  
  // Configuration
  config: {
    // Monthly request limit (10,000 requests/month = ~333/day)
    monthlyRequestLimit: 10000,
    
    // Rate limiting (requests per second per IP)
    rateLimit: 10,
    rateLimitPeriod: 60, // seconds
    
    // Lambda configuration
    lambdaTimeout: 30, // seconds
    lambdaMemory: 512, // MB
    
    // Cost alert threshold (USD)
    costAlertThreshold: 10,
    
    // Email for cost alerts
    alertEmail: process.env.ALERT_EMAIL || 'your-email@example.com',
    
    // CORS allowed origins
    allowedOrigins: [
      'https://nexusnoscreenyoutube.netlify.app',
      'http://localhost:8000'
    ]
  }
});

app.synth();
