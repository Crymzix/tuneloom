# tuneloom Web Application

The web application for **tuneloom** - a SaaS platform for fine-tuning and deploying language models. Built with Next.js 15.5.5, TypeScript, and React 19.

## Overview

This application provides a complete user interface for managing the model fine-tuning lifecycle, from training data generation to model deployment and inference. It features a modern, responsive design with real-time updates and streaming capabilities.

## Technology Stack

### Core Framework
- **Next.js 15.5.5** with App Router and Server Components
- **React 19.1.0** for UI components
- **TypeScript 5** for type safety
- **Turbopack** for fast development builds

### UI & Styling
- **Tailwind CSS 4** for utility-first styling
- **Radix UI** for accessible component primitives
- **Lucide React** for icons
- **Motion** for animations
- **next-themes** for dark mode support

### State Management
- **Zustand** for client state management
- **React Query** (@tanstack/react-query) for server state and caching

### API & Backend Integration
- **Hono 4.10.2** for API routes
- **Vercel AI SDK** (@ai-sdk/react, @ai-sdk/openai) for streaming inference
- **Vercel Workflow** for long-running job orchestration
- **Firebase SDK** (client) for authentication and storage
- **Firebase Admin SDK** (server) for secure API operations

### Authentication & Security
- **Firebase Authentication** for user management
- **Upstash Redis** + **@upstash/ratelimit** for rate limiting
- **react-google-recaptcha** for bot protection
- **Zod** for schema validation

### AI & ML Integration
- **@ai-sdk/google** for Google Gemini API (training data generation)
- **@ai-sdk/openai-compatible** for custom model inference
- **@google-cloud/run** for Cloud Run job management

### Content & Markdown
- **react-markdown** with **remark-gfm** for GitHub-flavored markdown
- **rehype-katex** and **remark-math** for mathematical expressions
- **react-syntax-highlighter** with **shiki** for code highlighting

### Forms & Validation
- **React Hook Form** for form management
- **Zod 4** for schema validation

## Features

### Training Data Generation
- AI-powered training data generation using Google Gemini
- Multiple format support (text, chat, instruction-following)
- Interactive dataset editor with preview
- File upload and download capabilities

### Model Fine-Tuning
- Fine-tuning job creation with configurable parameters
- LoRA/QLoRA configuration options
- Real-time job status monitoring
- Training logs and progress tracking
- Integration with Cloud Run Jobs via Vercel Workflow

### Model Deployment & Inference
- Real-time chat interface with streaming responses
- Model version management and activation
- API key generation and management
- OpenAI-compatible API endpoints
- Rate limiting and usage tracking

### User Management
- Firebase Authentication (email/password, social providers)
- Per-user model isolation
- Secure API key storage with encryption
- User dashboard with model overview

## Getting Started

### Prerequisites

- Node.js 18+ (recommended: 20+)
- npm or yarn
- Firebase project with Authentication and Firestore enabled
- Google Cloud Platform account for backend services

### Installation

1. Install dependencies:

```bash
npm install
```

2. Configure environment variables:

Create a `.env.local` file in the web directory:

```env
# Firebase Client Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-auth-domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-storage-bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id

# Firebase Admin (base64-encoded service account JSON)
FIREBASE_SERVICE_ACCOUNT_KEY=base64-encoded-json

# API Configuration
OPENAI_COMPATIBLE_BASE_URL=https://your-inference-service-url
BASE_MODEL_API_KEY=your-base-model-api-key

# Rate Limiting
UPSTASH_REDIS_REST_URL=your-redis-url
UPSTASH_REDIS_REST_TOKEN=your-redis-token

# Training Data Generation
GOOGLE_GENERATIVE_AI_API_KEY=your-gemini-api-key

# Security
API_KEY_ENCRYPTION_SECRET=your-encryption-secret
RECAPTCHA_SECRET_KEY=your-recaptcha-secret
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=your-recaptcha-site-key

# Cloud Run Configuration
GCP_PROJECT_ID=your-gcp-project-id
GCP_REGION=europe-west1
FINE_TUNE_JOB_NAME=finetune-job
GCS_BUCKET=your-gcs-bucket
```

3. Run the development server:

```bash
npm run dev
```

The application will be available at http://localhost:1011

### Building for Production

```bash
npm run build
npm start
```

## Project Structure

```
web/
├── app/                          # Next.js App Router
│   ├── api/                      # API routes (Hono)
│   │   ├── [...route]/          # Main API handler
│   │   ├── controllers/         # API controllers
│   │   ├── middleware/          # Authentication & rate limiting
│   │   ├── utils/               # API utilities
│   │   ├── workflows/           # Vercel Workflow definitions
│   │   ├── config/              # API configuration
│   │   └── types/               # TypeScript types
│   ├── .well-known/workflow/    # Workflow webhook endpoints
│   ├── page.tsx                 # Home page
│   ├── layout.tsx               # Root layout
│   ├── privacy-policy/          # Privacy policy page
│   └── terms-of-service/        # Terms of service page
├── components/                   # React components
│   ├── ui/                      # Reusable UI components
│   ├── chat/                    # Chat interface components
│   ├── training/                # Training data components
│   └── models/                  # Model management components
├── lib/                          # Utilities and helpers
│   ├── firebase/                # Firebase configuration
│   ├── stores/                  # Zustand stores
│   └── utils/                   # Helper functions
├── public/                       # Static assets
├── package.json                 # Dependencies and scripts
└── README.md                    # This file
```

## API Routes

All API routes are implemented using Hono and mounted at `/api/[...route]`. The API includes:

### Authentication
- User authentication via Firebase Auth
- Rate limiting per user/IP
- API key validation

### Training Data
- `POST /api/generate-training-data` - Generate training data using Gemini
- `GET /api/training-data/:id` - Retrieve training data
- `POST /api/training-data/upload` - Upload training data file

### Fine-Tuning
- `POST /api/fine-tune/start` - Start fine-tuning job
- `GET /api/fine-tune/jobs` - List user's fine-tuning jobs
- `GET /api/fine-tune/jobs/:id` - Get job status
- `GET /api/fine-tune/jobs/:id/logs` - Get training logs

### Models
- `GET /api/models` - List user's models
- `GET /api/models/:id` - Get model details
- `POST /api/models/:id/versions/:versionId/activate` - Activate model version
- `GET /api/models/:id/api-key` - Get or generate API key

### Inference
- `POST /api/chat` - Chat completion (streaming)
- `POST /api/completion` - Text completion (streaming)

## Vercel Workflow Integration

The application uses Vercel Workflow to orchestrate long-running fine-tuning jobs:

1. User submits fine-tuning request via web interface
2. Workflow is triggered with job configuration
3. Workflow submits Cloud Run Job to GCP
4. Workflow monitors job status via webhooks
5. Upon completion, workflow updates Firestore and generates API key
6. User is notified of job completion

Workflow definitions are located in `app/api/workflows/`.

## Firebase Integration

### Authentication
- Email/password authentication
- Social provider authentication (Google, GitHub)
- Protected routes with middleware
- Server-side token verification

### Firestore Collections
- `fine-tune-jobs` - Fine-tuning job metadata
- `models` - User models
- `models/{modelId}/versions` - Model versions (subcollection)
- `api-keys` - Encrypted API keys for model access

### Storage
- Training data files
- User uploads
- Generated datasets

## Rate Limiting

Rate limiting is implemented using Upstash Redis with the following limits:
- Training data generation: 10 requests per hour per user
- Fine-tuning job creation: 5 jobs per day per user
- Inference requests: 100 requests per minute per API key

## Development

### Running Tests

```bash
npm run lint
```

### Code Style

The project uses:
- ESLint for code linting
- TypeScript strict mode
- Prettier for code formatting (configure as needed)

### Adding New Features

1. **New API endpoint**: Add controller in `app/api/controllers/`
2. **New UI component**: Add to `components/` directory
3. **New state**: Create or update Zustand store in `lib/stores/`
4. **New workflow**: Add definition to `app/api/workflows/`

## Deployment

### Vercel (Recommended)

1. Connect your repository to Vercel
2. Configure environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

### Docker

Create a `Dockerfile`:

```dockerfile
FROM node:20-alpine AS base

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "start"]
```

Build and run:

```bash
docker build -t modelsmith-web .
docker run -p 3000:3000 --env-file .env modelsmith-web
```

### Cloud Run

Deploy as a containerized application to Cloud Run for seamless integration with backend services.

## Environment Variables

All environment variables must be configured before deployment:

| Variable | Description | Required |
|----------|-------------|----------|
| `NEXT_PUBLIC_FIREBASE_*` | Firebase client configuration | Yes |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Firebase Admin credentials (base64) | Yes |
| `OPENAI_COMPATIBLE_BASE_URL` | Inference service URL | Yes |
| `BASE_MODEL_API_KEY` | API key for base model inference | Yes |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis URL for rate limiting | Yes |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis token | Yes |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Google Gemini API key | Yes |
| `API_KEY_ENCRYPTION_SECRET` | Secret for encrypting user API keys | Yes |
| `RECAPTCHA_SECRET_KEY` | reCAPTCHA server-side secret | Yes |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | reCAPTCHA client-side site key | Yes |
| `GCP_PROJECT_ID` | Google Cloud project ID | Yes |
| `GCP_REGION` | Cloud Run region | Yes |
| `FINE_TUNE_JOB_NAME` | Cloud Run Job name | Yes |
| `GCS_BUCKET` | GCS bucket for storage | Yes |

## Troubleshooting

### Build Errors

If you encounter build errors with Turbopack:
```bash
npm run build -- --no-turbopack
```

### Firebase Authentication Issues

Ensure Firebase configuration is correct and project has Authentication enabled.

### Rate Limiting Issues

Check Upstash Redis connection and verify rate limit configuration.

## Support

For more information, see the main [ModelSmith documentation](../README.md).
