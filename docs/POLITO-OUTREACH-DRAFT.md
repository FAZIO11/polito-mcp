# Draft outreach to PoliTO maintainers (post-alpha)

Use this only **after** at least 2 weeks of alpha usage with measurable
adoption and a stable production deployment. The whole point of leading with
a working demo is to make the ask concrete.

Open as a GitHub **discussion** (not an issue) on
<https://github.com/polito/students-app/discussions> under "Ideas".

---

**Title:** Third-party OAuth redirect_uri for an unofficial student-facing MCP integration

Hi everyone — first, thank you for keeping the students-app and the api-spec
repos open. They've been an excellent reference.

I've built and operate an unofficial Model Context Protocol bridge that lets
students query their own PoliTO data (profile, grades, deadlines, today's
lectures, courses, messages) from MCP-aware tools like Cursor, Claude Desktop
and Codex. It is open source under AGPL-3.0 at <https://github.com/FAZIO11/polito-mcp>,
strictly read-mostly (a few safe writes), explicitly branded as unofficial,
and deployed in the EU.

**Where I'm currently stuck.** PoliTO's SSO start URL
(`https://app.didattica.polito.it/auth/students/start?platform={ios|android}`,
referenced in [students-app `src/core/constants.ts`](https://github.com/polito/students-app/blob/main/src/core/constants.ts))
hardcodes its redirect target to the official mobile app's URL scheme /
universal link. There is no `platform=web` callback or `redirect_uri`
parameter, so a hosted third-party service cannot complete the SSO flow.

To ship anything at all, I therefore had to wrap `loginType: basic` and
collect the matricola+password on a hardened form, immediately discard the
password after exchanging it for the API bearer token, and encrypt the token
at rest with per-user HKDF-derived AES-GCM keys. I am not comfortable with
this posture — it makes my server an unintended credential funnel — and I
would much rather not be the one custodying student passwords.

**The ask.** Would you consider any of the following?

1. Add a `platform=web` SSO entry point that accepts a registered
   `redirect_uri` (allow-listed per third-party client_id). This is the
   cleanest path for OAuth-style flows.
2. Or grant a single registered OAuth 2.1 client_id for polito-mcp with a
   `redirect_uri` of `https://polito-mcp.example/oauth/callback`. I can keep
   the rest of the surface exactly as it is.
3. Or, if you prefer not to support third-party integrations at all, please
   tell me explicitly so I can wind the project down with proper disclosure
   to current users.

**Demo and adoption data.**
- Live endpoint: `https://polito-mcp.example/mcp`
- Source + security/privacy posture: <https://github.com/FAZIO11/polito-mcp>
- Active users in past 14 days: NN (sample numbers, share concrete figures here)
- Tool calls in past 14 days: NN
- Upstream 4xx/5xx rate against your API: <1%
- Open issues from students: link

I have zero interest in scraping, redistributing, or commercialising your
data. Every byte stays under user control. If granted a redirect_uri, my
plan is to immediately swap the password form for proper SSO and ship a
v2 release that day.

Happy to jump on a call, sign whatever ToS makes sense, or pull the project
entirely if it is not welcome.

Thanks for considering it.

— Your Name (matricola sXXXXXX)
