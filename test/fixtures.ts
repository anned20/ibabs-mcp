import type { Config } from "../src/config.js";
import { redirect, html, json, type Route } from "./scripted-transport.js";

export const MEETING_IDS = {
  council: "council-1",
  webinar: "webinar-1",
  allDay: "allday-1",
} as const;

export const DOCUMENT_IDS = {
  pdf: "pdf-doc-1",
  text: "txt-doc-1",
  docx: "docx-doc-1",
  confidential: "conf-doc-1",
  meetingLevel: "meeting-doc-1",
  webinarLevel: "webinar-doc-1",
} as const;

export const TEST_SITE = "example-site";
export const TEST_EMAIL = "test@example.com";
export const TEST_PASSWORD = "test-password";

export function testConfig(dir: string, overrides: Partial<Config> = {}): Config {
  return {
    site: TEST_SITE,
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    portalUrl: "https://portal.ibabs.eu",
    authorizeUrl: "https://signon.ibabs.eu/OAuth/Authorize",
    loginUrl: "https://signon.ibabs.eu/Login",
    clientId: "A5D450B5-D6C3-4C75-8BEF-665152DBD455",
    redirectUri: "https://portal.ibabs.eu/signin-iBabs",
    cacheDir: dir,
    downloadDir: `${dir}/downloads`,
    ...overrides,
  };
}

export function authorizeUrl(config: Config): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    state: "test-state",
  });
  return `${config.authorizeUrl}?${params.toString()}`;
}

export function loginPageHtml(): string {
  return `<!doctype html>
<html><head><title>Inloggen</title></head><body>
<form method="post" action="/Login">
  <input type="hidden" name="__RequestVerificationToken" value="test-antiforgery" />
  <input type="hidden" name="viewState" value="test-viewstate" />
  <label>E-mailadres <input type="text" name="EmailAddress" /></label>
  <label>Wachtwoord <input type="password" name="Password" /></label>
</form>
</body></html>`;
}

export function authRoutes(config: Config): Route[] {
  const authorize = authorizeUrl(config);
  const loginWithReturn = `${config.loginUrl}?ReturnUrl=${encodeURIComponent(authorize)}`;
  const signonOrigin = new URL(config.loginUrl).origin;
  const portalOrigin = new URL(config.portalUrl).origin;

  return [
    {
      name: "portal-login",
      method: "GET",
      match: (req) => req.url.startsWith(`${portalOrigin}/Account/Login`),
      handler: () => redirect(302, authorize, ["__TempData=temp; Path=/; Secure; HttpOnly"]),
    },
    {
      name: "authorize",
      method: "GET",
      match: (req) => req.url.startsWith(config.authorizeUrl),
      handler: (_req, { count }) => {
        // Odd calls are the pre-login authorize (step 2); even calls are the
        // post-login authorize that hands back an authorization code (step 6).
        if (count % 2 === 1) {
          return redirect(302, loginWithReturn, [
            "temp-check=abc; Path=/; Secure; HttpOnly",
            "redirect-check=1; Path=/; Secure",
          ]);
        }
        return redirect(
          302,
          `${config.redirectUri}?code=test-code&state=test-state`,
        );
      },
    },
    {
      name: "login-page",
      method: "GET",
      match: (req) => req.url.startsWith(config.loginUrl),
      handler: () =>
        html(200, loginPageHtml(), {
          setCookie: ["__RequestVerificationToken=test-antiforgery; Path=/; Secure; HttpOnly"],
        }),
    },
    {
      name: "login-options",
      method: "POST",
      match: (req) => req.url.includes("/Site/GetLoginOptions/"),
      handler: () => json(200, { success: true }),
    },
    {
      name: "login-submit",
      method: "POST",
      match: (req) => req.url.startsWith(config.loginUrl),
      handler: () =>
        redirect(302, authorize, [
          "ibabs-auth-server=opaque-auth; Path=/; Secure; HttpOnly",
        ]),
    },
    {
      name: "portal-signin",
      method: "GET",
      match: (req) => req.url.startsWith(`${portalOrigin}/signin-iBabs`),
      handler: () =>
        redirect(302, "/Account/ExternalLoginCallback?ReturnUrl=%2F", [
          "device_key=opaque-device; Domain=.ibabs.eu; Path=/; Secure; HttpOnly",
        ]),
    },
    {
      name: "external-login-callback",
      method: "GET",
      match: (req) => req.url.startsWith(`${portalOrigin}/Account/ExternalLoginCallback`),
      handler: () =>
        redirect(302, "/", [
          "__Host-ibabsportal=test-portal-session; Path=/; Secure; HttpOnly",
        ]),
    },
    {
      name: "portal-root",
      method: "GET",
      match: (req) => {
        const url = new URL(req.url);
        return url.origin === portalOrigin && url.pathname === "/";
      },
      handler: () => html(200, "<html><body>iBabs portal</body></html>"),
    },
  ];
}

export const CALENDAR_EVENTS = [
  {
    id: MEETING_IDS.webinar,
    title: "Webinar Omgevingswet",
    start: "2026-09-02T10:00:00+02:00",
    end: "2026-09-02T11:00:00+02:00",
    allDay: false,
    url: `/Meeting/View/${MEETING_IDS.webinar}`,
    description: "Extern webinar over de Omgevingswet.",
  },
  {
    id: MEETING_IDS.council,
    title: "Raadsvergadering Beslút 31 augustus 2026",
    start: "2026-08-31T19:30:00+02:00",
    end: "2026-08-31T23:00:00+02:00",
    allDay: false,
    url: `/Agenda/View/${MEETING_IDS.council}`,
    description: "Beslút is de raadsvergadering waarin besluiten worden genomen.",
  },
  {
    id: MEETING_IDS.allDay,
    title: "Werkbezoek",
    start: "2026-09-10T00:00:00+02:00",
    end: "2026-09-11T00:00:00+02:00",
    allDay: true,
    url: `/Meeting/View/${MEETING_IDS.allDay}`,
    description: null,
  },
];

export function councilMeetingHtml(): string {
  return `<!doctype html>
<html><head><title>${CALENDAR_EVENTS[1]!.title}</title></head><body>
<section class="meeting"
  data-meeting-id="${MEETING_IDS.council}"
  data-meeting-title="${CALENDAR_EVENTS[1]!.title}"
  data-meeting-start="2026-08-31T19:30:00+02:00"
  data-meeting-end="2026-08-31T23:00:00+02:00">
  <dl>
    <dt>Subtitel:</dt><dd>Behandeling bestuursakkoord</dd>
    <dt>Tijd:</dt><dd>19:30 - 23:00</dd>
    <dt>Toelichting:</dt>
    <dd><p>Beslút is de raadsvergadering waarin de gemeenteraad de besluiten neemt.</p>
    <p>De raad vergadert over het nieuwe bestuursakkoord.</p></dd>
  </dl>

  <h3>Bijlagen</h3>
  <ul class="meeting-documents">
    <li class="document-row">
      <a href="/Document/Agenda/${MEETING_IDS.council}/${DOCUMENT_IDS.meetingLevel}">Vastgestelde besluitenlijst</a>
      <span class="document-size">161 KB</span>
    </li>
  </ul>

  <h3>Agendapunten</h3>
  <div class="agenda-items">
    <div class="agendaitem" data-agendaitem-id="item-1" data-agendaitem-title="Opening">
      <span class="agendaitem-number">1</span>
      <h4>Opening</h4>
      <p>De voorzitter opent de vergadering.</p>
    </div>

    <div class="agendaitem" data-agendaitem-id="item-4" data-agendaitem-number="4">
      <h4>Bestuursakkoord gemeente Voorbeeld 2026-2030</h4>
      <p>Over het raadsvoorstel en de behandeling.</p>
      <ul class="documents">
        <li class="document-row">
          <a href="/Document/AgendaItem/${MEETING_IDS.council}/item-4/${DOCUMENT_IDS.pdf}">04 - A - Raadsvoorstel.pdf</a>
          <span class="document-size">151 KB</span>
        </li>
        <li class="document-row">
          <a href="/Document/AgendaItem/${MEETING_IDS.council}/item-4/${DOCUMENT_IDS.docx}">04 - Bijlage 1.docx</a>
          <span class="document-size">15 MB</span>
        </li>
      </ul>
    </div>

    <div class="agendaitem" data-agendaitem-id="item-5">
      <input type="hidden" name="IsConfidential" value="true" />
      <span class="agendaitem-number">5</span>
      <h4>Benoeming voorzitter rekenkamer</h4>
      <ul class="documents">
        <li class="document-row">
          <a href="/Document/AgendaItem/${MEETING_IDS.council}/item-5/${DOCUMENT_IDS.confidential}">Vertrouwelijke bijlage.pdf</a>
          <span class="document-size">95 KB</span>
        </li>
      </ul>
    </div>
  </div>
</section>
</body></html>`;
}

export function webinarMeetingHtml(): string {
  return `<!doctype html>
<html><head><title>Webinar Omgevingswet</title></head><body>
<section class="meeting"
  data-meeting-id="${MEETING_IDS.webinar}"
  data-meeting-title="Webinar Omgevingswet"
  data-meeting-start="2026-09-02T10:00:00+02:00"
  data-meeting-end="2026-09-02T11:00:00+02:00">
  <dl>
    <dt>Toelichting:</dt>
    <dd><p>Extern webinar over de Omgevingswet.</p></dd>
  </dl>

  <h3>Bijlagen</h3>
  <div class="documents">
    <div class="document document-row document-download">
      <input type="hidden" data-document-id="${DOCUMENT_IDS.webinarLevel}" />
      <div class="document-col document-col-filetype">
        <a href="/Document/Agenda/${MEETING_IDS.webinar}/${DOCUMENT_IDS.webinarLevel}"
           class="icon icon-file icon-pdf" data-document-id="${DOCUMENT_IDS.webinarLevel}"
           title="1-10-2026 08:46:55"></a>
      </div>
      <div class="document-col document-col-title">
        <a href="/Document/Agenda/${MEETING_IDS.webinar}/${DOCUMENT_IDS.webinarLevel}"
           data-document-id="${DOCUMENT_IDS.webinarLevel}">Presentatie Omgevingswet.pdf</a>
      </div>
      <div class="document-col document-col-filesize">2 MB</div>
    </div>
  </div>
</section>
</body></html>`;
}

export function makePdf(text: string): Uint8Array {
  const content = `BT /F1 24 Tf 72 700 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return new TextEncoder().encode(pdf);
}

export const PDF_TEXT = "Hello iBabs";
export const TEXT_FILE_BODY = "Notulen van de vergadering.";

export function documentRoutes(): Route[] {
  const pdfBytes = makePdf(PDF_TEXT);
  return [
    {
      method: "GET",
      match: (req) => req.url.includes(`/Document/Download/${DOCUMENT_IDS.pdf}/`),
      handler: () => ({
        status: 200,
        headers: {
          "content-type": "application/pdf",
          "content-disposition": 'attachment; filename="04 - A - Raadsvoorstel.pdf"',
        },
        body: pdfBytes,
      }),
    },
    {
      method: "GET",
      match: (req) => req.url.includes(`/Document/Download/${DOCUMENT_IDS.confidential}/`),
      handler: () => ({
        status: 200,
        headers: {
          "content-type": "application/pdf",
          "content-disposition": 'attachment; filename="Vertrouwelijke bijlage.pdf"',
        },
        body: pdfBytes,
      }),
    },
    {
      method: "GET",
      match: (req) => req.url.includes(`/Document/Download/${DOCUMENT_IDS.text}/`),
      handler: () => ({
        status: 200,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "content-disposition": 'attachment; filename="notulen.txt"',
        },
        body: new TextEncoder().encode(TEXT_FILE_BODY),
      }),
    },
    {
      method: "GET",
      match: (req) => req.url.includes(`/Document/Download/${DOCUMENT_IDS.docx}/`),
      handler: () => ({
        status: 200,
        headers: {
          "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "content-disposition": 'attachment; filename="04 - Bijlage 1.docx"',
        },
        body: new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
      }),
    },
    {
      method: "GET",
      match: (req) => req.url.includes(`/Document/Download/${DOCUMENT_IDS.meetingLevel}/`),
      handler: () => ({
        status: 200,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "content-disposition": 'attachment; filename="Vastgestelde besluitenlijst.txt"',
        },
        body: new TextEncoder().encode("Besluitenlijst van de vergadering."),
      }),
    },
  ];
}

export function portalDataRoutes(config: Config): Route[] {
  return [
    {
      method: "GET",
      match: (req) => req.url.includes("/Meeting/GetCalendarEvents"),
      handler: () => json(200, CALENDAR_EVENTS),
    },
    {
      method: "GET",
      match: (req) => req.url.startsWith(`${config.portalUrl}/Agenda/View/${MEETING_IDS.council}`),
      handler: () => html(200, councilMeetingHtml()),
    },
    {
      method: "GET",
      match: (req) => req.url.includes("/Agenda/View/"),
      handler: () => ({ status: 404, headers: { "content-type": "text/html" } }),
    },
    {
      method: "GET",
      match: (req) => req.url.includes(`/Meeting/View/${MEETING_IDS.webinar}`),
      handler: () => html(200, webinarMeetingHtml()),
    },
    {
      method: "GET",
      match: (req) => req.url.includes(`/Meeting/View/${MEETING_IDS.allDay}`),
      handler: () => html(200, "<html><body>Werkbezoek</body></html>"),
    },
    ...documentRoutes(),
  ];
}
