# Contributing

## Local checks

```sh
npm ci
npm test
npm run build
```

Frontend tests run in jsdom and mock Firebase and the backend. They do not need `.env.local`, Firebase credentials, or AWS credentials.

## Branch flow

- The maintainer may push directly to `dev`; CI runs on every push and reports its result.
- Contributors send PRs to `dev`. CI must pass and the code owner must approve.
- Promote `dev` to `integration`, then `integration` to `main`, using PRs and merge commits.
- PRs into `integration` from any branch other than `dev`, or into `main` from any branch other than `integration`, fail the branch-flow check.
- `integration` and `main` reject direct updates. Do not force-push or delete protected branches.

GitHub Actions validates the code only. It does not deploy or publish the frontend.

## GitHub repository settings

Apply these rules to the matching branch in **Settings → Rules → Rulesets** (or equivalent branch protection settings) after the workflow has run once so its checks are selectable:

| Branch | Required pull request rules | Required status checks | Bypass |
| --- | --- | --- | --- |
| `dev` | 1 approval; require code-owner review | `Frontend CI / branch-flow`, `Frontend CI / verify` | Allow the maintainer to bypass so direct pushes remain possible; CI still runs and reports |
| `integration` | Require a pull request | `Frontend CI / branch-flow`, `Frontend CI / verify` | None |
| `main` | Require a pull request | `Frontend CI / branch-flow`, `Frontend CI / verify` | None |

For all three branches, block force-pushes and deletion. Require merge commits and disable squash/rebase merges in repository settings so promotions preserve ancestry. Do not require an approval on promotion PRs; their source branch and checks are the gate.
