export type Role = 'admin' | 'prof' | 'lecture';
export type Level = 'Seconde' | 'Première' | 'Terminale';
export type Domain = 'ind' | 'ter' | 'bat' | 'tra';
export type RoomKind = 'atelier' | 'salle' | 'labo' | 'info' | 'autre';
export type SystemState = 'service' | 'maint' | 'hs';
export type MarkLevel = 'NA' | 'ECA' | 'PA' | 'A';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  active: boolean;
  created_at: string;
  last_seen: string | null;
}

export interface Group {
  code: string;
  level: Level;
  sub: string;
  sort: number;
}

export interface TeacherGroup {
  profile_id: string;
  group_code: string;
}

export interface Room {
  id: string;
  name: string;
  building: string | null;
  kind: RoomKind;
  seats: number | null;
  shared: boolean;
  notes: string | null;
  active: boolean;
  created_at: string;
}

export interface System {
  id: string;
  name: string;
  ref: string | null;
  domain: Domain;
  room_id: string | null;
  qty: number;
  state: SystemState;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Tp {
  id: string;
  code: string | null;
  title: string;
  level: Level;
  domain: Domain;
  hours: number | null;
  system_ids: string[];
  competences: string[];
  created_at: string;
}

export interface Slot {
  id: string;
  room_id: string;
  group_code: string;
  teacher_id: string | null;
  teacher_label: string | null;
  weekday: number;
  start_time: string;
  end_time: string;
  label: string | null;
  tp_id: string | null;
  system_id: string | null;
  valid_from: string;
  valid_to: string;
  created_by: string | null;
  created_at: string;
}

export type SessionStatus = 'planned' | 'done' | 'cancelled';

export interface Session {
  id: string;
  slot_id: string | null;
  session_date: string;
  start_time: string;
  end_time: string;
  room_id: string | null;
  group_code: string | null;
  tp_id: string | null;
  system_id: string | null;
  teacher_id: string | null;
  teacher_label: string | null;
  label: string | null;
  note: string | null;
  status: SessionStatus;
  created_by: string | null;
  created_at: string;
}

export interface Maintenance {
  id: string;
  system_id: string;
  kind: 'prev' | 'corr';
  title: string;
  description: string | null;
  priority: 'n' | 'h' | 'u';
  due_date: string | null;
  status: 'open' | 'wip' | 'done';
  closed_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface MaintenanceNote {
  id: string;
  maintenance_id: string;
  author_id: string | null;
  text: string;
  created_at: string;
}

export type PurchaseStatus = 'req' | 'ok' | 'ord' | 'recv' | 'no';

export interface Purchase {
  id: string;
  kind: 'mat' | 'conso';
  item: string;
  ref: string | null;
  qty: number;
  unit_price: number;
  system_id: string | null;
  justification: string | null;
  urgent: boolean;
  status: PurchaseStatus;
  requested_by: string | null;
  created_at: string;
}

export interface Student {
  id: string;
  name: string;
  group_code: string;
  created_at: string;
}

export interface Progress {
  student_id: string;
  tp_id: string;
  level: MarkLevel;
  updated_at: string;
  updated_by: string | null;
}

export interface DataSet {
  profiles: Profile[];
  teacher_groups: TeacherGroup[];
  rooms: Room[];
  systems: System[];
  tps: Tp[];
  timetable_slots: Slot[];
  sessions: Session[];
  maintenance: Maintenance[];
  maintenance_notes: MaintenanceNote[];
  purchases: Purchase[];
  students: Student[];
  progress: Progress[];
}

export type TableName = keyof DataSet;
