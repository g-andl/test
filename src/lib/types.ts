export type MoodValue = 1 | 2 | 3 | 4 | 5;
export type DayPart = "morning" | "day" | "evening" | "night";

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  timezone: string;
  onboarded: boolean;
  /** Аккаунт администратора: виден с пометкой, в друзья не добавляется */
  is_admin: boolean;
}

/** Строка списка аккаунтов в админ-панели */
export interface AdminUser {
  id: string;
  email: string;
  /** Почта для восстановления */
  contact_email: string | null;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  entries_count: number;
  friends_count: number;
  public_visibility: string | null;
  is_admin: boolean;
  is_blocked: boolean;
  /** null при is_blocked = true означает «навсегда» */
  blocked_until: string | null;
  block_reason: string | null;
  total: number;
}

export interface BlockStatus {
  blocked: boolean;
  until?: string | null;
  reason?: string | null;
}

export interface RecoveryRequest {
  id: string;
  username: string;
  user_id: string | null;
  contact: string;
  message: string;
  status: "new" | "in_progress" | "done";
  admin_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface MoodEntry {
  id: string;
  user_id: string;
  entry_date: string; // YYYY-MM-DD
  mood_value: MoodValue;
  mood_label: string;
  note: string | null;
  photo_path: string | null;
  mood_time: string;
  day_part: DayPart;
  created_at: string;
  updated_at: string;
}

/** Минимальные данные записи для статистики и календаря */
export interface EntryLite {
  id: string;
  entry_date: string;
  mood_value: MoodValue;
  day_part: DayPart;
  mood_time: string;
  note?: string | null;
  photo_path?: string | null;
  updated_at?: string;
  /** Для чужих отметок: заметка/фото есть, но скрыты автором */
  has_note?: boolean;
  has_photo?: boolean;
}

/** Что видят пользователи, которые НЕ в друзьях. Друзья видят всё. */
export interface PrivacySettings {
  user_id: string;
  public_visibility: "all" | "latest" | "none";
  /** Заметки и фото из отметок для не-друзей (друзья видят всегда) */
  notes_public: boolean;
  photos_public: boolean;
  /** Окно поддержки: кто может писать / кто видит сообщения */
  support_write: "all" | "friends" | "none";
  support_view: "all" | "friends" | "owner";
}

/** Статус пользователя: цветная пометка рядом с именем */
export interface Badge {
  id: string;
  name: string;
  color: string; // #rrggbb
  /** Подсказка: за что выдаётся (для автоматических) */
  hint?: string | null;
  /** Ключ автоматического статуса; у выданных вручную и своих — null */
  auto_key?: string | null;
}

export interface SupportMessage {
  id: string;
  body: string;
  created_at: string;
  author_id: string;
  author_username: string;
  author_display_name: string;
  author_avatar_url: string | null;
  /** Корневое сообщение ветки (у обычного сообщения null) и сообщение, на которое ответили */
  parent_id: string | null;
  reply_to_id: string | null;
  reply_to_name: string | null;
  can_delete: boolean;
  can_reply: boolean;
  /** Только для администратора */
  admin_created?: boolean | null;
  admin_edited?: boolean | null;
}

export interface SupportWall {
  can_view: boolean;
  can_write: boolean;
  total: number;
  messages: SupportMessage[];
}

/** Среднее настроение за день и число отметок */
export interface DayAgg {
  value: number;
  count: number;
}

export interface NotificationSettings {
  user_id: string;
  push_enabled: boolean;
  inapp_enabled: boolean;
  friend_mood_enabled: boolean;
  friend_update_enabled: boolean;
  friend_request_enabled: boolean;
}

export interface FriendRow {
  friendship_id: string;
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  since: string | null;
  mood_value: MoodValue | null;
  entry_date: string | null;
  day_part: DayPart | null;
  mood_updated_at: string | null;
}

export interface FriendRequest {
  friendship_id: string;
  direction: "incoming" | "outgoing";
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
}

export interface ActivityRow {
  entry_id: string;
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  mood_value: MoodValue;
  entry_date: string;
  is_update: boolean;
  updated_at: string;
}

export type NotificationType =
  | "friend_request"
  | "request_accepted"
  | "request_declined"
  | "support_message"
  | "support_reply"
  | "new_friend"
  | "friend_mood"
  | "friend_mood_updated";

export interface NotificationRow {
  id: string;
  user_id: string;
  actor_id: string | null;
  type: NotificationType;
  reference_id: string | null;
  data: { mood_value?: MoodValue; entry_date?: string; wall?: string };
  is_read: boolean;
  created_at: string;
  actor?: Pick<Profile, "id" | "username" | "display_name" | "avatar_url"> | null;
}

export interface UserProfileView {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  relation: "self" | "friends" | "outgoing" | "incoming" | "none";
  friendship_id: string | null;
  /** self | friend — всё; all — всё (не друг); latest — последняя отметка; none — ничего */
  access: "self" | "friend" | "all" | "latest" | "none";
  can_see_history: boolean;
  can_see_photos: boolean;
  can_see_notes: boolean;
  is_admin: boolean;
  is_muted: boolean;
  entries_count: number | null;
  latest: (EntryLite & { updated_at: string }) | null;
}
