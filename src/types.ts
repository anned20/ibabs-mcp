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

export interface Bijlage {
  documentId: string;
  name: string;
  size: string | null;
}

export interface Agendapunt {
  number: string;
  title: string;
  agendaitemId: string;
  confidential: boolean;
  bijlagen: Bijlage[];
}

export interface Meeting {
  id: string;
  title: string;
  start: string | null;
  end: string | null;
  kind: MeetingKind;
  description?: string;
  agendapunten: Agendapunt[];
  bijlagen: Bijlage[];
}

export interface Attachment {
  documentId: string;
  name: string;
  mime: string;
  path: string;
  text?: string;
}
