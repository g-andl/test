// Понятные сообщения об ошибках на русском.

const MAP: [RegExp, string][] = [
  [/Invalid login credentials/i, "Неверная почта или пароль"],
  [/Email not confirmed/i, "Почта не подтверждена. Проверьте письмо со ссылкой."],
  [/User already registered/i, "Пользователь с такой почтой уже зарегистрирован"],
  [/Password should be at least/i, "Пароль должен быть не короче 8 символов"],
  [/password.*(weak|pwned|known)/i, "Пароль слишком простой — выберите другой"],
  [/should be different from the old/i, "Новый пароль должен отличаться от старого"],
  [/rate limit|too many requests|after \d+ seconds/i, "Слишком много попыток. Подождите немного и повторите."],
  [/Unable to validate email|invalid format|valid email/i, "Проверьте адрес почты"],
  [/Database error saving new user/i, "Не удалось создать аккаунт. Возможно, имя пользователя уже занято."],
  [/duplicate key.*username|profiles_username_key/i, "Это имя пользователя уже занято"],
  [/duplicate key.*friendships/i, "Заявка уже существует"],
  [/badges_name_uidx|duplicate key.*badges/i, "Статус с таким названием уже есть"],
  [/badges_color_check/i, "Цвет должен быть в виде #rrggbb"],
  [/badges_name_check/i, "Название статуса — от 1 до 24 символов"],
  [/duplicate key.*mood_entries/i, "Запись за этот день уже есть"],
  [/Failed to fetch|NetworkError|Load failed|network/i, "Нет соединения с интернетом. Проверьте сеть и повторите."],
  [/JWT expired|session.*(missing|expired)/i, "Сессия истекла. Войдите снова."],
  [/Payload too large|exceeded the maximum allowed size/i, "Файл слишком большой"],
  [/mime type/i, "Этот формат файла не поддерживается"],
];

export function humanError(e: unknown): string {
  const msg =
    typeof e === "string"
      ? e
      : e && typeof e === "object" && "message" in e
        ? String((e as { message: unknown }).message)
        : "";
  if (!msg) return "Что-то пошло не так. Попробуйте ещё раз.";
  for (const [re, text] of MAP) if (re.test(msg)) return text;
  // Сообщения из наших SQL-функций уже на русском
  if (/[а-яё]/i.test(msg)) return msg;
  return "Что-то пошло не так. Попробуйте ещё раз.";
}
