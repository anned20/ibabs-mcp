export type MeetingKind = "council" | "other";

export interface MeetingSummary {
  id: string;
  title: string;
  start: string | null;
  end: string | null;
  allDay: boolean;
  kind: MeetingKind;
  url: string;
}

export interface Attachment {
  documentId: string;
  name: string;
  size: string | null;
}

export interface AgendaItem {
  number: string;
  title: string;
  agendaItemId: string;
  confidential: boolean;
  attachments: Attachment[];
}

export interface Meeting {
  id: string;
  title: string;
  start: string | null;
  end: string | null;
  kind: MeetingKind;
  description?: string;
  agendaItems: AgendaItem[];
  attachments: Attachment[];
}

export interface DownloadedAttachment {
  documentId: string;
  name: string;
  mime: string;
  path: string;
  text?: string;
}
