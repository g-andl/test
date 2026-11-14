export type MoodValue = 1 | 2 | 3 | 4 | 5;
export type DayPart = "morning" | "day" | "evening" | "night";

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  timezone: string;
  onboarded: boolean;
  created_at: string;
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
}

/** Что видят пользователи, которые НЕ в друзьях. Друзья видят всё. */
export interface PrivacySettings {
  user_id: string;
  public_visibility: "all" | "latest" | "none";
  photos_public: boolean;
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
  | "new_friend"
  | "friend_mood"
  | "friend_mood_updated";

export interface NotificationRow {
  id: string;
  user_id: string;
  actor_id: string | null;
  type: NotificationType;
  reference_id: string | null;
  data: { mood_value?: MoodValue; entry_date?: string };
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
  is_muted: boolean;
  entries_count: number | null;
  latest: (EntryLite & { updated_at: string }) | null;
}
