// Интеграционные тесты безопасности базы (RLS, приватность, уведомления).
// Запуск: npm run test:db (нужен запущенный локальный Supabase: npx supabase start)
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  execSync('npx supabase status -o env', { encoding: 'utf8' })
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')];
    }),
);

const URL = env.API_URL;
const admin = createClient(URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const run = Date.now().toString(36);

async function makeUser(name) {
  const email = `${name}_${run}@test.local`;
  const password = 'Passw0rd!x';
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username: `${name}_${run}`.slice(0, 24), display_name: name, timezone: 'Asia/Novosibirsk' },
  });
  if (error) throw error;
  const c = createClient(URL, env.ANON_KEY, { auth: { persistSession: false } });
  const { data, error: e2 } = await c.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  return { c, id: data.user.id, username: `${name}_${run}`.slice(0, 24) };
}

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Novosibirsk' });

let masha, dima, anon, stranger;

before(async () => {
  masha = await makeUser('masha');
  dima = await makeUser('dima');
  stranger = await makeUser('stranger');
  anon = createClient(URL, env.ANON_KEY, { auth: { persistSession: false } });
});

test('профиль и настройки создаются при регистрации', async () => {
  const { data: p } = await masha.c.from('profiles').select('username, timezone').eq('id', masha.id).single();
  assert.equal(p.username, masha.username);
  assert.equal(p.timezone, 'Asia/Novosibirsk');
  const { data: s } = await masha.c.from('privacy_settings').select('*').single();
  assert.equal(s.public_visibility, 'all', 'для остальных по умолчанию открыто');
  assert.equal(s.photos_public, true, 'фото для остальных видно по умолчанию');
  assert.equal(s.notes_public, true, 'заметки для остальных видны по умолчанию');
});

test('anon не видит данные, но может проверить username', async () => {
  const { data } = await anon.from('profiles').select('*');
  assert.equal((data ?? []).length, 0);
  const { data: free } = await anon.rpc('username_available', { p_username: masha.username });
  assert.equal(free, false);
  const { data: free2 } = await anon.rpc('username_available', { p_username: 'free_' + run });
  assert.equal(free2, true);
});

const row = (uid, value, hour, note = null) => {
  const t = new Date(); t.setUTCHours(hour, 0, 0, 0);
  return { user_id: uid, entry_date: today(), mood_value: value, note, mood_time: t.toISOString(), day_part: hour < 12 ? 'morning' : 'evening' };
};

test('несколько отметок в день, чужие записи напрямую недоступны', async () => {
  const a = await masha.c.from('mood_entries').insert(row(masha.id, 4, 2, 'утро')).select().single();
  assert.ifError(a.error);
  const b = await masha.c.from('mood_entries').insert(row(masha.id, 2, 13, 'секретная заметка')).select().single();
  assert.ifError(b.error, 'вторая отметка за день разрешена');
  assert.equal(b.data.mood_label, 'Грустно');

  const { data: seen } = await dima.c.from('mood_entries').select('*').eq('user_id', masha.id);
  assert.equal(seen.length, 0, 'прямой доступ к таблице только у владельца');
  const fake = await dima.c.from('mood_entries').insert({ ...row(masha.id, 5, 3) });
  assert.ok(fake.error, 'нельзя создать запись за другого');
});

test('посторонний при «всё открыто» видит записи, заметки и пометку о фото', async () => {
  const { data } = await stranger.c.rpc('get_user_entries', { p_user: masha.id, p_from: '2000-01-01', p_to: '2100-01-01' });
  assert.equal(data.length, 2);
  assert.ok(data.some((e) => e.note === 'секретная заметка'));
  const { data: prof } = await stranger.c.rpc('get_user_profile', { p_username: masha.username });
  assert.equal(prof.access, 'all');
  assert.equal(prof.can_see_photos, true, 'фото видно по умолчанию');
  assert.equal(prof.latest.mood_value, 2, 'последняя — вечерняя');
});

test('«только последнее» и «ничего» для посторонних', async () => {
  await masha.c.from('privacy_settings').update({ public_visibility: 'latest' }).eq('user_id', masha.id);
  let { data } = await stranger.c.rpc('get_user_entries', { p_user: masha.id, p_from: '2000-01-01', p_to: '2100-01-01' });
  assert.equal(data.length, 1);
  assert.equal(data[0].mood_value, 2);
  await masha.c.from('privacy_settings').update({ public_visibility: 'none' }).eq('user_id', masha.id);
  ({ data } = await stranger.c.rpc('get_user_entries', { p_user: masha.id, p_from: '2000-01-01', p_to: '2100-01-01' }));
  assert.equal(data.length, 0);
  const { data: prof } = await stranger.c.rpc('get_user_profile', { p_username: masha.username });
  assert.equal(prof.access, 'none');
  assert.equal(prof.latest, null);
  const bad = await masha.c.from('privacy_settings').update({ public_visibility: 'hacked' }).eq('user_id', masha.id);
  assert.ok(bad.error, 'недопустимое значение отклоняется');
});

test('отклонённая заявка уведомляет отправителя, отменённая — нет', async () => {
  await stranger.c.rpc('send_friend_request', { p_addressee: masha.id });
  const { data: fr } = await masha.c.from('friendships').select('id').eq('requester_id', stranger.id).single();
  await masha.c.from('friendships').delete().eq('id', fr.id);
  const { data: n } = await stranger.c.from('notifications').select('*').eq('type', 'request_declined');
  assert.equal(n.length, 1);
  assert.equal(n[0].actor_id, masha.id);

  await stranger.c.rpc('send_friend_request', { p_addressee: dima.id });
  const { data: fr2 } = await stranger.c.from('friendships').select('id').eq('addressee_id', dima.id).single();
  await stranger.c.from('friendships').delete().eq('id', fr2.id);
  const { data: n2 } = await dima.c.from('notifications').select('*').eq('type', 'request_declined');
  assert.equal(n2.length, 0, 'отмена своей заявки никого не уведомляет');
});

test('заявка в друзья, уведомления и принятие', async () => {
  const { data: st, error } = await dima.c.rpc('send_friend_request', { p_addressee: masha.id });
  assert.ifError(error);
  assert.equal(st, 'pending');
  const { data: n } = await masha.c.from('notifications').select('*').eq('type', 'friend_request');
  assert.equal(n.length, 1);
  assert.equal(n[0].actor_id, dima.id);

  const { data: fr } = await dima.c.from('friendships').select('*').eq('addressee_id', masha.id).single();
  const self = await dima.c.from('friendships').update({ status: 'accepted' }).eq('id', fr.id).select();
  assert.equal((self.data ?? []).length, 0, 'отправитель не может сам принять');
  const acc = await masha.c.from('friendships').update({ status: 'accepted' }).eq('id', fr.id).select();
  assert.ifError(acc.error);
  assert.equal(acc.data.length, 1);
  const { data: n2 } = await dima.c.from('notifications').select('*').eq('type', 'request_accepted');
  assert.equal(n2.length, 1);
});

test('друг видит всё даже при закрытом профиле', async () => {
  // у Маши сейчас public_visibility = none
  const { data } = await dima.c.rpc('get_user_entries', { p_user: masha.id, p_from: '2000-01-01', p_to: '2100-01-01' });
  assert.equal(data.length, 2);
  const { data: prof } = await dima.c.rpc('get_user_profile', { p_username: masha.username });
  assert.equal(prof.access, 'friend');
  assert.equal(prof.can_see_photos, true);
  const { data: friends } = await dima.c.rpc('get_friends');
  assert.equal(friends[0].mood_value, 2);
});

test('новая отметка и изменение уведомляют друга без заметки', async () => {
  await dima.c.from('notifications').delete().eq('user_id', dima.id);
  const ins = await masha.c.from('mood_entries').insert(row(masha.id, 5, 15)).select().single();
  await masha.c.from('mood_entries').update({ mood_value: 3 }).eq('id', ins.data.id);
  const { data } = await dima.c.from('notifications').select('*').in('type', ['friend_mood', 'friend_mood_updated']);
  assert.equal(data.length, 1, 'правка той же отметки заменяет её уведомление');
  assert.equal(data[0].type, 'friend_mood_updated');
  assert.equal(data[0].data.note, undefined);
  await masha.c.from('mood_entries').insert(row(masha.id, 1, 17));
  const { data: d2 } = await dima.c.from('notifications').select('*').in('type', ['friend_mood', 'friend_mood_updated']);
  assert.equal(d2.length, 2, 'каждая новая отметка — отдельное уведомление');
});

test('отключение уведомлений от друга', async () => {
  await dima.c.from('muted_friends').insert({ user_id: dima.id, muted_id: masha.id });
  await dima.c.from('notifications').delete().eq('user_id', dima.id);
  await masha.c.from('mood_entries').insert(row(masha.id, 4, 16));
  const { data } = await dima.c.from('notifications').select('*');
  assert.equal(data.length, 0);
  await dima.c.from('muted_friends').delete().eq('muted_id', masha.id);
});

test('фото и заметки: друг видит всегда, посторонний — пока не скрыто, о скрытом он знает', async () => {
  const path = `${masha.id}/${run}.png`;
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  );
  const up = await masha.c.storage.from('mood-photos').upload(path, png, { contentType: 'image/png' });
  assert.ifError(up.error);
  const { data: last } = await masha.c.from('mood_entries').select('id').order('mood_time', { ascending: false }).limit(1).single();
  await masha.c.from('mood_entries').update({ photo_path: path, note: 'видимая заметка' }).eq('id', last.id);
  await masha.c.from('privacy_settings').update({ public_visibility: 'all', photos_public: true, notes_public: true }).eq('user_id', masha.id);
  const range = { p_user: masha.id, p_from: '2000-01-01', p_to: '2100-01-01' };

  // По умолчанию видно всем
  const open = await stranger.c.storage.from('mood-photos').createSignedUrl(path, 60);
  assert.ifError(open.error, 'фото видно по умолчанию');
  let e = (await stranger.c.rpc('get_user_entries', range)).data.find((x) => x.id === last.id);
  assert.equal(e.note, 'видимая заметка');
  assert.equal(e.photo_path, path);

  // Скрыли от посторонних: содержимого нет, но известно, что оно есть
  await masha.c.from('privacy_settings').update({ photos_public: false, notes_public: false }).eq('user_id', masha.id);
  assert.ok((await stranger.c.storage.from('mood-photos').createSignedUrl(path, 60)).error, 'фото скрыто');
  e = (await stranger.c.rpc('get_user_entries', range)).data.find((x) => x.id === last.id);
  assert.equal(e.note, null, 'заметка скрыта');
  assert.equal(e.photo_path, null, 'фото скрыто');
  assert.equal(e.has_note, true, 'зритель знает, что заметка есть');
  assert.equal(e.has_photo, true, 'зритель знает, что фото есть');
  const prof = (await stranger.c.rpc('get_user_profile', { p_username: masha.username })).data;
  assert.equal(prof.latest.note, null);
  assert.equal(prof.latest.has_photo, true);
  assert.equal(prof.can_see_notes, false);

  // Друг видит всё, даже когда скрыто от остальных
  assert.ifError((await dima.c.storage.from('mood-photos').createSignedUrl(path, 60)).error);
  e = (await dima.c.rpc('get_user_entries', range)).data.find((x) => x.id === last.id);
  assert.equal(e.note, 'видимая заметка');
  assert.equal(e.photo_path, path);

  // Владелец видит своё
  e = (await masha.c.rpc('get_user_entries', { ...range, p_user: masha.id })).data.find((x) => x.id === last.id);
  assert.equal(e.note, 'видимая заметка');

  const foreignUpload = await dima.c.storage.from('mood-photos').upload(`${masha.id}/x.png`, png, { contentType: 'image/png' });
  assert.ok(foreignUpload.error, 'нельзя загрузить в чужую папку');
});

test('нельзя менять чужие уведомления и служебные поля', async () => {
  const { data: n } = await dima.c.from('notifications').select('id').limit(1);
  if (n.length) {
    const r = await masha.c.from('notifications').update({ is_read: true }).eq('id', n[0].id).select();
    assert.equal(r.data.length, 0);
  }
  const bad = await masha.c.from('notifications').update({ type: 'new_friend' }).eq('user_id', masha.id);
  assert.ok(bad.error, 'менять тип уведомления нельзя');
});

test('удаление аккаунта удаляет данные каскадно', async () => {
  const { error } = await stranger.c.rpc('delete_account');
  assert.ifError(error);
  const { data } = await admin.from('profiles').select('id').eq('id', stranger.id);
  assert.equal(data.length, 0);
});

test('итоги дня: по умолчанию видны всем, приватность настраивается', async () => {
  // свои итоги можно писать и читать
  const day = '2026-11-14';
  const mine = await masha.c.from('day_reflections').upsert({ user_id: masha.id, day, good: 'кофе', bad: 'дождь', insight: 'надо спать', rating: 4 }, { onConflict: 'user_id,day' });
  assert.ok(!mine.error, mine.error?.message);
  const own = await masha.c.from('day_reflections').select('*').eq('user_id', masha.id);
  assert.equal(own.data.length, 1);
  // частичное обновление не затирает остальное
  await masha.c.from('day_reflections').upsert({ user_id: masha.id, day, rating: 5 }, { onConflict: 'user_id,day' });
  const upd = await masha.c.from('day_reflections').select('good, rating').eq('user_id', masha.id).single();
  assert.equal(upd.data.good, 'кофе');
  assert.equal(upd.data.rating, 5);
  // по умолчанию итоги видны всем, в приватности можно закрыть; писать за другого нельзя
  const peek = await dima.c.from('day_reflections').select('*').eq('user_id', masha.id);
  assert.equal(peek.data.length, 1, 'по умолчанию итоги видят все');
  await masha.c.from('privacy_settings').update({ reflections_visibility: 'friends' }).eq('user_id', masha.id);
  assert.equal((await dima.c.from('day_reflections').select('*').eq('user_id', masha.id)).data.length, 0, 'для друзей — посторонний не видит');
  await masha.c.from('privacy_settings').update({ reflections_visibility: 'me' }).eq('user_id', masha.id);
  assert.equal((await masha.c.from('day_reflections').select('*').eq('user_id', masha.id)).data.length, 1, 'автор видит всегда');
  assert.equal((await anon.from('day_reflections').select('*')).data?.length ?? 0, 0, 'анонимно недоступно');
  const forge = await dima.c.from('day_reflections').insert({ user_id: masha.id, day: '2026-11-13', good: 'подделка' });
  assert.ok(forge.error, 'за другого писать нельзя');
  const bad = await masha.c.from('day_reflections').insert({ user_id: masha.id, day: '2026-11-12', rating: 9 });
  assert.ok(bad.error, 'оценка только от 1 до 5');
});

test('заметки дневника: по умолчанию только автору, открываются в настройках', async () => {
  const note = await masha.c.from('journal_notes').insert({ user_id: masha.id, title: 'Про день', body: 'Длинная мысль '.repeat(500) }).select().single();
  assert.ok(!note.error, note.error?.message);
  assert.equal((await masha.c.from('journal_notes').select('id').eq('user_id', masha.id)).data.length, 1);
  assert.equal((await dima.c.from('journal_notes').select('id').eq('user_id', masha.id)).data.length, 0, 'по умолчанию чужие не видят');
  assert.equal((await anon.from('journal_notes').select('id')).data?.length ?? 0, 0, 'анонимно недоступно');

  await masha.c.from('privacy_settings').update({ journal_visibility: 'friends' }).eq('user_id', masha.id);
  assert.equal((await stranger.c.from('journal_notes').select('id').eq('user_id', masha.id)).data.length, 0, 'для друзей — посторонний не видит');

  await masha.c.from('privacy_settings').update({ journal_visibility: 'all' }).eq('user_id', masha.id);
  assert.equal((await stranger.c.from('journal_notes').select('id').eq('user_id', masha.id)).data.length, 1, 'открыто всем');
  const edit = await stranger.c.from('journal_notes').update({ body: 'взлом' }).eq('id', note.data.id).select();
  assert.equal(edit.data?.length ?? 0, 0, 'чужую заметку менять нельзя');
  const forge = await dima.c.from('journal_notes').insert({ user_id: masha.id, body: 'подделка' });
  assert.ok(forge.error, 'писать от чужого имени нельзя');
  await masha.c.from('privacy_settings').update({ journal_visibility: 'me' }).eq('user_id', masha.id);
  assert.equal((await stranger.c.from('journal_notes').select('id').eq('user_id', masha.id)).data.length, 0, 'снова закрыто');
});

test('группы заметок: только свои, заметка не может уйти в чужую группу', async () => {
  const g = await masha.c.from('journal_groups').insert({ user_id: masha.id, name: 'Личное' }).select().single();
  assert.ok(!g.error, g.error?.message);
  const dup = await masha.c.from('journal_groups').insert({ user_id: masha.id, name: ' личное ' });
  assert.ok(dup.error, 'одинаковые названия запрещены');
  const own = await masha.c.from('journal_notes').insert({ user_id: masha.id, body: 'в группе', group_id: g.data.id });
  assert.ok(!own.error, own.error?.message);
  const alien = await dima.c.from('journal_notes').insert({ user_id: dima.id, body: 'чужая группа', group_id: g.data.id });
  assert.ok(alien.error, 'нельзя положить заметку в чужую группу');
  assert.equal((await dima.c.from('journal_groups').select('id').eq('user_id', masha.id)).data.length, 0, 'чужие группы закрыты');
  // удаление группы оставляет заметки
  await masha.c.from('journal_groups').delete().eq('id', g.data.id);
  const left = await masha.c.from('journal_notes').select('group_id').eq('body', 'в группе').single();
  assert.equal(left.data.group_id, null);
});
