# iBabs authentication flow

Captured via `portal.ibabs.eu` for an example site.

iBabs uses a standard OAuth 2.0 **authorization-code** flow, but the token
exchange happens **server-side** inside the portal (`/signin-iBabs`). The
client is confidential: the browser never sees a `client_secret` or an
access/refresh token. After the callback the portal issues its own
**session cookies** and all subsequent API calls are authenticated with those
cookies.

## Actors / endpoints

| Role            | Value                                                              |
| --------------- | ----------------------------------------------------------------- |
| Authorization   | `https://signon.ibabs.eu/OAuth/Authorize`                          |
| Login page      | `https://signon.ibabs.eu/Login`                                    |
| Login options   | `https://signon.ibabs.eu/Site/GetLoginOptions/{siteName}`          |
| Portal (client) | `https://portal.ibabs.eu`                                          |
| Redirect URI    | `https://portal.ibabs.eu/signin-iBabs`                             |
| `client_id`     | `A5D450B5-D6C3-4C75-8BEF-665152DBD455`                             |
| Response type   | `code`                                                             |

## Flow

```
1. GET  portal.ibabs.eu/Account/Login?ReturnUrl=/
        -> 302  signon.ibabs.eu/OAuth/Authorize
                ?response_type=code
                &client_id=A5D450B5-D6C3-4C75-8BEF-665152DBD455
                &redirect_uri=https%3A%2F%2Fportal.ibabs.eu%2Fsignin-iBabs
                &state=<random-128-char>
        Set-Cookie: __TempData=...
        Set-Cookie: .AspNet.Correlation.iBabs=...
        (portal.ibabs.eu also has ASP.NET_SessionId)

2. GET  signon.ibabs.eu/OAuth/Authorize?...   -> 302  signon.ibabs.eu/Login?ReturnUrl=<encoded authorize url>
        Set-Cookie: temp-check=<guid>
        Set-Cookie: redirect-check=1

3. GET  signon.ibabs.eu/Login?ReturnUrl=...  -> 200 (login form)
        Set-Cookie: __RequestVerificationToken=<antiforgery token>

4. POST signon.ibabs.eu/Site/GetLoginOptions/example-site?ReturnUrl=...
        Content-Type: application/x-www-form-urlencoded
        Body: __RequestVerificationToken=<token>
        (AJAX: loads which login options are enabled for the site)
        Set-Cookie: ibabs-sitename=example-site

5. POST signon.ibabs.eu/Login?ReturnUrl=...
        Content-Type: application/x-www-form-urlencoded
        Body:
          __RequestVerificationToken=<antiforgery token>
          viewState=<ASP.NET view state>
          SiteName=example-site
          EmailAddress=user@example.com
          Password=<password>
          RememberPassword=false
        -> 302  /OAuth/Authorize?...
        Set-Cookie: .AspNet.ExternalCookie=...
        Set-Cookie: ibabs-auth-server=<long opaque token>

6. GET  signon.ibabs.eu/OAuth/Authorize?...   -> 302
        Location: https://portal.ibabs.eu/signin-iBabs?code=<code>&state=<state>

7. GET  portal.ibabs.eu/signin-iBabs?code=<code>&state=<state>  -> 302
        Location: /Account/ExternalLoginCallback?ReturnUrl=%2F
        Set-Cookie: .AspNet.Correlation.iBabs=
        Set-Cookie: device_key=<opaque>                       (domain .ibabs.eu)
        Set-Cookie: .AspNet.ExternalCookie=<opaque>

8. GET  portal.ibabs.eu/Account/ExternalLoginCallback?ReturnUrl=/  -> 302  /
        Set-Cookie: __Host-ibabsportal=<opaque>               (the portal session)
        Set-Cookie: __TempData=
        Set-Cookie: .AspNet.ExternalCookie=

9. GET  portal.ibabs.eu/                    (authenticated)
        -> normal app: /Resources, /Meeting/GetCalendarEvents, /Script/DocumentDownloadToken, ...
```

Note: the `code` in step 7 is single-use and is exchanged for tokens by the
portal server (step 7-8). The state parameter is echoed back and validated.

## Cookies that matter

Set on `portal.ibabs.eu` (all HttpOnly, Secure, SameSite=Lax unless noted):

| Cookie                | Purpose                                             |
| --------------------- | --------------------------------------------------- |
| `__Host-ibabsportal`  | **Portal session / auth. The important one.**       |
| `ASP.NET_SessionId`   | ASP.NET session                                     |
| `ibabsrvt`            | Request verification token (antiforgery)            |
| `ibabsddt`            | Device/download token (SameSite=Strict)             |

Set on `signon.ibabs.eu`:

| Cookie                       | Purpose                                    |
| ---------------------------- | ------------------------------------------ |
| `ibabs-auth-server`          | SSO session at the identity provider        |
| `__RequestVerificationToken` | Antiforgery                                 |
| `ibabs-sitename`             | Remembered tenant                           |
| `temp-check`, `redirect-check` | OAuth redirect/login-flow bookkeeping     |

Shared on `.ibabs.eu`:

| Cookie        | Purpose                                  |
| ------------- | ---------------------------------------- |
| `device_key`  | Device identity (long-lived, ~30 days)   |

## Implications for an MCP server

- There is no public OAuth client credentials flow exposed to the browser;
  the confidential exchange is server-side. An MCP server has two realistic
  options:
  1. **Replay the browser flow** (headless Playwright/puppeteer): perform the
     OAuth authorize + `/Login` form POST, capture the resulting
     `__Host-ibabsportal` cookie, and reuse it for API calls. Must handle the
     `__RequestVerificationToken`/`viewState` values parsed out of the login
     HTML.
  2. **Import an existing session cookie** (`__Host-ibabsportal` + friends)
     and call the portal's internal endpoints directly.
- Both need the session cookies listed above; requests must send the
  `__RequestVerificationToken` for POST endpoints (also available from the
  rendered page).
- The portal is a normal MVC app; internal JSON endpoints (e.g.
  `/Meeting/GetCalendarEvents`, `/Resources`) are the data surface to wrap.

See `captures/` for the concrete request/response capture and cookies.
