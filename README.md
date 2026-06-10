# Wix ↔ HubSpot Bi-Directional Sync

This is a Full Stack Next.js application that implements a robust, bi-directional sync engine between Wix and HubSpot contacts, alongside a Wix-to-HubSpot form submission integration with full UTM attribution.

## 🚀 Features

*   **Bi-Directional Contact Sync:** Real-time sync between Wix Contacts and HubSpot Contacts.
*   **Conflict Resolution:** "Last Updated Wins" deterministic conflict handling.
*   **Infinite Loop Prevention:** Idempotency (SHA-256 state hashing) and 15-second deduplication windows prevent ping-pong syncing.
*   **Form & Lead Capture:** Syncs Wix Form submissions to HubSpot, automatically capturing and mapping UTM parameters (`utm_source`, `utm_medium`, `utm_campaign`, etc.) and referral URLs.
*   **Dynamic Field Mapping:** A UI that allows users to map Wix fields to HubSpot properties and apply data transformations (`trim`, `lowercase`).
*   **Security First:** Uses AES-256-GCM encryption to safely store HubSpot OAuth access and refresh tokens. Strict webhook HMAC signature verification ensures endpoints are secure.

## 🛠️ Setup & Installation

### 1. Prerequisites
You will need Node.js (v18+) and npm installed. The app uses a local SQLite database (`database.sqlite`) which will be created automatically.

### 2. Environment Variables
Copy the `.env.example` file to `.env`:
```bash
cp .env.example .env
```

Fill out the `.env` file. You will need:
*   A 32+ character random string for `ENCRYPTION_KEY`
*   HubSpot OAuth App credentials (`HUBSPOT_CLIENT_ID`, `HUBSPOT_CLIENT_SECRET`)
*   Wix API credentials (`WIX_API_KEY`, `WIX_SITE_ID`, `WIX_WEBHOOK_SECRET`)

*(Note: For webhooks to work locally, you will need to tunnel your localhost using a tool like `ngrok` and point your Wix/HubSpot webhook configurations to your ngrok URL).*

### 3. Install Dependencies
```bash
npm install
```

### 4. Run the Application
```bash
npm run dev
```
Open [http://localhost:3001](http://localhost:3001) with your browser to view the mapping dashboard and connect your HubSpot account.

## 🧪 Testing

This project includes a fast, zero-config `vitest` suite that mathematically verifies the core encryption, idempotency hashing, and webhook signature verification algorithms.

Run the test suite:
```bash
npm run test
```
