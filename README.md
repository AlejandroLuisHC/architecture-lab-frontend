# Stack Playground

A guided, English-language AWS architecture simulation for beginners. Visitors can finish the entire serverless web app lab without an account. Signing in adds saved progress and the ability to resume on another device. The simulation never deploys AWS resources or estimates costs.

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

1. The overview introduces the practice sandbox. The module picker lists the active beginner lab and clearly marked future modules.
2. The sandbox provides service navigation, resource lists, create/detail/edit/delete flows, and a guide on the right. Services unlock as the learner completes each stage; earlier services stay available.
3. Resource relationships and settings are simulated in browser state. **Check configuration** asks the backend for stage feedback and unlocks the next stage only when the configuration is valid.
4. The final screen displays the assembled architecture and key lessons. The simulator uses service names as factual text references and is not affiliated with AWS.
5. Guests keep state only in the open page. When they register, their current run is saved. If an existing account already has progress, they choose which run to continue.

## Quality check

```bash
npm run build
```

Run the guest flow with the backend locally. With Firebase configured, also verify sign-up, save, sign-out, sign-in from another browser, and progress isolation between accounts.

## Vercel deployment

Connect this repository as a separate Vercel project. Set `VITE_API_BASE_URL` to the deployed backend URL and all four `VITE_FIREBASE_*` variables from the Firebase web app configuration, then deploy. Vercel builds the Vite app with `npm run build`. Deploy the backend first so the frontend environment points to a working API. Because Vite embeds `VITE_` variables at build time, redeploy the frontend after changing them.
