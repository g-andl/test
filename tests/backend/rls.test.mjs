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
  const { data: p } = await masha.c.from('profiles').select('*').eq('id', masha.id).single();
  assert.equal(p.username, masha.username);
  assert.equal(p.timezone, 'Asia/Novosibirsk');
  const { data: s } = await masha.c.from('privacy_settings').select('*').single();
  assert.equal(s.notes_visibility, false, 'заметки приватны по умолчанию');
  assert.equal(s.photos_visibility, false, 'фото приватны по умолчанию');
});

test('anon не видит данные, но может проверить username', async () => {
  const { data } = await anon.from('profiles').select('*');
  assert.equal((data ?? []).length, 0);
  const { data: free } = await anon.rpc('username_available', { p_username: masha.username });
  assert.equal(free, false);
  const { data: free2 } = await anon.rpc('username_available', { p_username: 'free_' + run });
  assert.equal(free2, true);
});

test('одна запись в день, чужие записи недоступны напрямую', async () => {
  const row = {
    user_id: masha.id, entry_date: today(), mood_value: 5,
    note: 'секретная заметка', mood_time: new Date().toISOString(), day_part: 'evening',
  };
  const { data, error } = await masha.c.from('mood_entries').insert(row).select().single();
  assert.ifError(error);
  assert.equal(data.mood_label, 'Отлично');
  const dup = await masha.c.from('mood_entries').insert(row);
  assert.ok(dup.error, 'вторая запись за день запрещена');

  const { data: seen } = await dima.c.from('mood_entries').select('*').eq('user_id', masha.id);
  assert.equal(seen.length, 0, 'не друг не видит записи');

  const fake = await dima.c.from('mood_entries').insert({ ...row, user_id: masha.id, entry_date: '2020-01-01' });
  assert.ok(fake.error, 'нельзя создать запись за другого');
});

test('заявка в друзья, уведомления и принятие', async () => {
  const { data: st, error } = await dima.c.rpc('send_friend_request', { p_addressee: masha.id });
  assert.ifError(error);
  assert.equal(st, 'pending');

  const { data: n } = await masha.c.from('notifications').select('*').eq('type', 'friend_request');
  assert.equal(n.length, 1);
  assert.equal(n[0].actor_id, dima.id);

  // Отправитель не может сам принять свою заявку
  const { data: fr } = await dima.c.from('friendships').select('*').single();
  const self = await dima.c.from('friendships').update({ status: 'accepted' }).eq('id', fr.id).select();
  assert.equal((self.data ?? []).length, 0);

  const acc = await masha.c.from('friendships').update({ status: 'accepted' }).eq('id', fr.id).select();
  assert.ifError(acc.error);
  assert.equal(acc.data.length, 1);

  const { data: n2 } = await dima.c.from('notifications').select('*').eq('type', 'request_accepted');
  assert.equal(n2.length, 1);
});

test('друг видит настроение, но не видит заметку по умолчанию', async () => {
  const { data: friends } = await dima.c.rpc('get_friends');
  assert.equal(friends.length, 1);
  assert.equal(friends[0].mood_value, 5);

  const { data: entries } = await dima.c.rpc('get_friend_entries', {
    p_friend: masha.id, p_from: '2000-01-01', p_to: '2100-01-01',
  });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].note, null, 'заметка скрыта');

  await masha.c.from('privacy_settings').update({ notes_visibility: true }).eq('user_id', masha.id);
  const { data: e2 } = await dima.c.rpc('get_friend_entries', {
    p_friend: masha.id, p_from: '2000-01-01', p_to: '2100-01-01',
  });
  assert.equal(e2[0].note, 'секретная заметка');
});

test('изменение настроения уведомляет друга', async () => {
  await masha.c.from('mood_entries').update({ mood_value: 2 }).eq('entry_date', today());
  const { data } = await dima.c.from('notifications').select('*').eq('type', 'friend_mood_updated');
  assert.equal(data.length, 1);
  assert.equal(data[0].data.mood_value, 2);
  assert.equal(data[0].data.note, undefined, 'уведомление не раскрывает заметку');
});

test('отключение уведомлений от друга', async () => {
  await dima.c.from('muted_friends').insert({ user_id: dima.id, muted_id: masha.id });
  await dima.c.from('notifications').delete().eq('user_id', dima.id);
  await masha.c.from('mood_entries').update({ mood_value: 4 }).eq('entry_date', today());
  const { data } = await dima.c.from('notifications').select('*');
  assert.equal(data.length, 0);
  await dima.c.from('muted_friends').delete().eq('muted_id', masha.id);
});

test('закрытый профиль скрывает всё', async () => {
  await masha.c.from('privacy_settings').update({ profile_visibility: 'private' }).eq('user_id', masha.id);
  const { data: entries } = await dima.c.rpc('get_friend_entries', {
    p_friend: masha.id, p_from: '2000-01-01', p_to: '2100-01-01',
  });
  assert.equal(entries.length, 0);
  const { data: friends } = await dima.c.rpc('get_friends');
  assert.equal(friends[0].mood_value, null);
  const { data: prof } = await dima.c.rpc('get_user_profile', { p_username: masha.username });
  assert.equal(prof.can_see_calendar, false);
  assert.equal(prof.latest, null);
  await masha.c.from('privacy_settings').update({ profile_visibility: 'friends' }).eq('user_id', masha.id);
});

test('посторонний не видит историю', async () => {
  const { data } = await stranger.c.rpc('get_friend_entries', {
    p_friend: masha.id, p_from: '2000-01-01', p_to: '2100-01-01',
  });
  assert.equal(data.length, 0);
  const { data: prof } = await stranger.c.rpc('get_user_profile', { p_username: masha.username });
  assert.equal(prof.relation, 'none');
  assert.equal(prof.latest, null);
});

test('фото: приватно, друг видит только при разрешении', async () => {
  const path = `${masha.id}/${run}.png`;
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  );
  const up = await masha.c.storage.from('mood-photos').upload(path, png, { contentType: 'image/png' });
  assert.ifError(up.error);
  await masha.c.from('mood_entries').update({ photo_path: path }).eq('entry_date', today());

  const denied = await dima.c.storage.from('mood-photos').createSignedUrl(path, 60);
  assert.ok(denied.error, 'фото скрыто по умолчанию');

  await masha.c.from('privacy_settings').update({ photos_visibility: true }).eq('user_id', masha.id);
  const ok = await dima.c.storage.from('mood-photos').createSignedUrl(path, 60);
  assert.ifError(ok.error);

  const strangerTry = await stranger.c.storage.from('mood-photos').createSignedUrl(path, 60);
  assert.ok(strangerTry.error, 'посторонний не видит фото');

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
