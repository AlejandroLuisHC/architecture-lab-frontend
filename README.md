# Stack Playground

A guided and freeform AWS architecture simulation. The guided module works without an account; the freeform sandbox supports browser drafts, while signing in adds account-backed architectures and cross-device access. The simulation never deploys AWS resources. Cost estimates use live AWS Price List coverage for modeled EC2 and Lambda configurations, and clearly identify unsupported charges.

## Local development

Requires Node.js 22 or newer and the companion `architecture-lab-backend` API.

```bash
npm install
copy .env.example .env.local
npm run dev
```

Set `VITE_API_BASE_URL=http://localhost:3000` while running the API locally. Open `http://localhost:5173`. If Firebase variables are empty, the guest experience still works and the account dialog explains that sign-in is unavailable.

To enable accounts, create a Firebase project, enable **Authentication → Email/Password** and **Firestore**, and place the web app's Firebase configuration in `.env.local`. These `VITE_` values are public client configuration. Keep the Firebase service account private key exclusively in the backend environment.

## Experience

1. The overview leads to separate learning modules and a freeform sandbox.
2. Guided modules use a simulated service console and stage-by-stage feedback. Completing earlier stages unlocks later services.
3. The freeform editor supports common compute, networking, storage, data, security, and operations services. Guests can create, edit, connect, analyze, and reopen drafts stored in this browser.
4. Signed-in users can create, list, save, and reopen versioned architectures. The review checks modeled configuration risks, labels workload-based performance guidance as a rules estimate, and shows the region, freshness, and coverage of public On-Demand pricing.
5. The simulator uses service names for educational reference and is not affiliated with AWS. Price estimates exclude items named in the estimate assumptions.

## Quality check

```bash
npm run build
```

Run the guest flow with the backend locally. With Firebase configured, also verify sign-up, save, sign-out, sign-in from another browser, and progress isolation between accounts.

## Vercel deployment

Connect this repository as a separate Vercel project. Set `VITE_API_BASE_URL` to the deployed backend URL and all four `VITE_FIREBASE_*` variables from the Firebase web app configuration, then deploy. Vercel builds the Vite app with `npm run build`. Deploy the backend first so the frontend environment points to a working API. Because Vite embeds `VITE_` variables at build time, redeploy the frontend after changing them.
