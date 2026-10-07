import fs from "node:fs/promises";
import path from "node:path";
import type { PortalClient } from "./portal-client.js";
import type { DownloadedAttachment } from "./types.js";

interface AttachmentMeta {
  documentId: string;
  name: string;
  mime: string;
  file: string;
}

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function sanitizeFilename(name: string, fallback: string): string {
  const base = path.basename(name).replace(/[\u0000-\u001f]/g, "").trim();
  if (!base || base === "." || base === "..") return fallback;
  return base;
}

export function isTextMime(mime: string): boolean {
  const value = mime.toLowerCase().trim();
  if (value.startsWith("text/")) return true;
  if (value === "application/json" || value.endsWith("+json")) return true;
  if (value === "application/xml" || value.endsWith("+xml")) return true;
  if (value === "application/csv") return true;
  if (value === "application/javascript" || value === "application/x-javascript") return true;
  return false;
}

export function isPdfMime(mime: string): boolean {
  return mime.toLowerCase().includes("pdf");
}

export class DocumentService {
  constructor(
    private readonly client: PortalClient,
    private readonly downloadDir: string,
    private readonly maxTextChars = 100_000,
  ) {}

  private dirFor(documentId: string): string {
    return path.join(this.downloadDir, sanitizeId(documentId));
  }

  private async readMeta(dir: string): Promise<AttachmentMeta | undefined> {
    try {
      const raw = await fs.readFile(path.join(dir, "meta.json"), "utf8");
      const meta = JSON.parse(raw) as AttachmentMeta;
      await fs.access(path.join(dir, meta.file));
      return meta;
    } catch {
      return undefined;
    }
  }

  private async extract(body: Uint8Array, mime: string): Promise<string | undefined> {
    if (isTextMime(mime)) {
      return new TextDecoder("utf-8").decode(body);
    }
    if (isPdfMime(mime)) {
      try {
        const { extractText } = await import("unpdf");
        const result = await extractText(body, { mergePages: true });
        return result.text;
      } catch (error) {
        throw new Error(
          `Failed to extract text from PDF: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return undefined;
  }

  private truncate(text: string): string {
    if (text.length <= this.maxTextChars) return text;
    return `${text.slice(0, this.maxTextChars)}\n\n[truncated: document text exceeded ${this.maxTextChars} characters]`;
  }

  async fetch(documentId: string, extractText = true): Promise<DownloadedAttachment> {
    const dir = this.dirFor(documentId);
    let meta = await this.readMeta(dir);

    if (!meta) {
      const downloaded = await this.client.download(documentId);
      await fs.mkdir(dir, { recursive: true });
      const file = sanitizeFilename(downloaded.filename, documentId);
      await fs.writeFile(path.join(dir, file), downloaded.body);
      meta = { documentId, name: downloaded.filename, mime: downloaded.mime, file };
      await fs.writeFile(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2), "utf8");
    }

    const filePath = path.join(dir, meta.file);
    const attachment: DownloadedAttachment = {
      documentId,
      name: meta.name,
      mime: meta.mime,
      path: filePath,
    };

    if (extractText) {
      const body = await fs.readFile(filePath);
      const text = await this.extract(new Uint8Array(body), meta.mime);
      if (text !== undefined) {
        attachment.text = this.truncate(text);
      }
    }

    return attachment;
  }
}
