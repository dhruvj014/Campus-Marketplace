#!/bin/bash

# Frontend deployment script for Google Cloud Run
set -e

PROJECT_ID="campus-marketplace-202"
SERVICE_NAME="campus-marketplace-frontend"
REGION="us-central1"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo "🚀 Building frontend Docker image..."
gcloud builds submit --tag ${IMAGE_NAME}

echo "🚀 Deploying to Cloud Run..."
gcloud run deploy ${SERVICE_NAME} \
  --image ${IMAGE_NAME} \
  --platform managed \
  --region ${REGION} \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --cpu 1 \
  --max-instances 10 \
  --min-instances 0

echo "✅ Frontend deployment complete!"
echo "🌐 Your frontend is now available at the Cloud Run URL"
