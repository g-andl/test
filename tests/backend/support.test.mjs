// Тесты «Окна поддержки»: кто может писать, кто видит, лимиты, уведомления, удаление, блокировка.
// Запуск: npm run test:support (нужен локальный Supabase)
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  execSync('npx supabase status -o env', { encoding: 'utf8' })
    .split('\n').filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]),
);
const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const run = Date.now().toString(36).slice(-6);

async function mk(name) {
  const username = `${name}_${run}`;
  const email = `u_${username}@users.nastroy.local`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password: 'Passw0rd!x', email_confirm: true,
    user_metadata: { username, display_name: name },
  });
  if (error) throw error;
  const c = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
  await c.auth.signInWithPassword({ email, password: 'Passw0rd!x' });
  return { c, id: data.user.id, username };
}
const setPriv = (u, patch) => u.c.from('privacy_settings').update(patch).eq('user_id', u.id);
const wall = async (viewer, owner) => (await viewer.c.rpc('get_support_wall', { p_user: owner.id })).data;
const post = (viewer, owner, body) => viewer.c.rpc('post_support_message', { p_user: owner.id, p_body: body });

let owner, friend, stranger, boss;
before(async () => {
  owner = await mk('own');
  friend = await mk('frd');
  stranger = await mk('str');
  boss = await mk('bos');
  await admin.from('admins').insert({ user_id: boss.id });
  await friend.c.rpc('send_friend_request', { p_addressee: owner.id });
  const { data: fr } = await owner.c.from('friendships').select('id').eq('requester_id', friend.id).single();
  await owner.c.from('friendships').update({ status: 'accepted' }).eq('id', fr.id);
});

test('по умолчанию писать и видеть могут все', async () => {
  const { data: s } = await owner.c.from('privacy_settings').select('support_write, support_view').single();
  assert.equal(s.support_write, 'all');
  assert.equal(s.support_view, 'all');
  const w = await wall(stranger, owner);
  assert.equal(w.can_write, true);
  assert.equal(w.can_view, true);
});

test('посторонний пишет, владелец и все видят, уведомление приходит', async () => {
  const { data: id, error } = await post(stranger, owner, '  Ты молодец, держись!  ');
  assert.ifError(error);
  assert.ok(id);
  const w = await wall(friend, owner);
  assert.equal(w.total, 1);
  assert.equal(w.messages[0].body, 'Ты молодец, держись!', 'текст обрезан по краям');
  assert.equal(w.messages[0].author_username, stranger.username);
  assert.equal(w.messages[0].can_delete, false, 'чужой друг удалить не может');
  const mine = await wall(owner, owner);
  assert.equal(mine.messages[0].can_delete, true, 'владелец может удалить');
  assert.equal(mine.can_write, false, 'себе писать нельзя');
  const { data: n } = await owner.c.from('notifications').select('type, actor_id, data').eq('type', 'support_message');
  assert.equal(n.length, 1);
  assert.equal(n[0].actor_id, stranger.id);
  assert.equal(JSON.stringify(n[0].data), '{}', 'в уведомлении нет текста сообщения');
});

test('проверка текста', async () => {
  assert.ok((await post(friend, owner, '   ')).error, 'пустое нельзя');
  assert.ok((await post(friend, owner, 'я'.repeat(501))).error, 'длиннее 500 нельзя');
  assert.ok((await post(owner, owner, 'себе')).error, 'себе нельзя');
});

test('«видят только друзья» и «видит только я»', async () => {
  await setPriv(owner, { support_view: 'friends' });
  assert.equal((await wall(stranger, owner)).can_view, false);
  assert.equal((await wall(stranger, owner)).messages.length, 0, 'сообщения не отдаются');
  assert.equal((await wall(friend, owner)).can_view, true);
  assert.equal((await wall(stranger, owner)).can_write, true, 'писать при этом можно — видит только владелец и друзья');

  await setPriv(owner, { support_view: 'owner' });
  assert.equal((await wall(friend, owner)).can_view, false);
  assert.equal((await wall(owner, owner)).can_view, true);
  assert.equal((await wall(owner, owner)).total, 1);
  assert.equal((await wall(boss, owner)).can_view, true, 'администратор видит для модерации');
  assert.ok((await owner.c.from('privacy_settings').update({ support_view: 'hack' }).eq('user_id', owner.id)).error);
});

test('«писать могут друзья» и «никто»', async () => {
  await setPriv(owner, { support_view: 'all', support_write: 'friends' });
  assert.equal((await wall(stranger, owner)).can_write, false);
  assert.ok((await post(stranger, owner, 'привет')).error);
  assert.equal((await wall(friend, owner)).can_write, true);
  assert.ifError((await post(friend, owner, 'ты справишься')).error);

  await setPriv(owner, { support_write: 'none' });
  assert.ok((await post(friend, owner, 'ещё')).error, 'никто — значит и друзья нет');
  assert.equal((await wall(friend, owner)).can_view, true, 'смотреть по-прежнему можно');
  await setPriv(owner, { support_write: 'all' });
});

test('прямой доступ к таблице закрыт', async () => {
  const r = await stranger.c.from('support_messages').select('*');
  assert.ok(r.error || r.data.length === 0);
  const ins = await stranger.c.from('support_messages').insert({ recipient_id: owner.id, author_id: stranger.id, body: 'в обход' });
  assert.ok(ins.error);
});

test('защита от спама: 3 сообщения в час одному человеку', async () => {
  const spammer = await mk('spm');
  for (let i = 0; i < 3; i++) assert.ifError((await post(spammer, owner, `сообщение ${i}`)).error);
  const r = await post(spammer, owner, 'четвёртое');
  assert.ok(r.error);
  assert.match(r.error.message, /Слишком часто/);
});

test('удаление: автор, получатель и админ — да, посторонний — нет', async () => {
  const { data: id } = await post(friend, owner, 'для удаления автором');
  assert.ok((await stranger.c.rpc('delete_support_message', { p_id: id })).error, 'посторонний не удаляет');
  assert.ifError((await friend.c.rpc('delete_support_message', { p_id: id })).error);
  const { data: id2 } = await post(stranger, owner, 'для удаления владельцем');
  assert.ifError((await owner.c.rpc('delete_support_message', { p_id: id2 })).error);
  const { data: n } = await owner.c.from('notifications').select('id').eq('reference_id', id2);
  assert.equal(n.length, 0, 'уведомление удалено вместе с сообщением');
  const { data: id3 } = await post(friend, owner, 'для удаления админом');
  assert.ifError((await boss.c.rpc('delete_support_message', { p_id: id3 })).error);
  const { data: left } = await admin.from('support_messages').select('id').in('id', [id, id2, id3]);
  assert.equal(left.length, 0);
});

test('админа нельзя поддержать, админ не пишет; заблокированный не пишет', async () => {
  assert.equal((await wall(friend, boss)).can_write, false);
  assert.ok((await post(friend, boss, 'привет, админ')).error);
  assert.ok((await post(boss, owner, 'от админа')).error);
  const bad = await mk('bad');
  await admin.from('user_blocks').insert({ user_id: bad.id, blocked_until: null, reason: 'тест' });
  assert.equal((await wall(bad, owner)).can_write, false);
  assert.ok((await post(bad, owner, 'от заблокированного')).error);
});

test('при отключённых уведомлениях от автора уведомление не создаётся', async () => {
  const quiet = await mk('qui');
  const loud = await mk('lou');
  await quiet.c.from('muted_friends').insert({ user_id: quiet.id, muted_id: loud.id });
  assert.ifError((await post(loud, quiet, 'привет')).error);
  const { data } = await quiet.c.from('notifications').select('id').eq('type', 'support_message');
  assert.equal(data.length, 0);
  assert.equal((await wall(quiet, quiet)).total, 1, 'сообщение при этом сохранилось');
});

test('админ правит сообщения и добавляет их от имени пользователя, только он видит пометки', async () => {
  const { data: id } = await post(friend, owner, 'исходный текст');
  assert.ok((await stranger.c.rpc('admin_edit_support_message', { p_id: id, p_body: 'взлом' })).error, 'обычный пользователь не правит');
  assert.ifError((await boss.c.rpc('admin_edit_support_message', { p_id: id, p_body: 'исправлено админом' })).error);
  assert.ok((await boss.c.rpc('admin_edit_support_message', { p_id: id, p_body: '' })).error, 'пустой текст нельзя');

  const forged = await boss.c.rpc('admin_post_support_message', { p_recipient: owner.id, p_author_username: `@${stranger.username}`, p_body: 'от лица пользователя' });
  assert.ifError(forged.error);
  assert.ok((await stranger.c.rpc('admin_post_support_message', { p_recipient: owner.id, p_author_username: friend.username, p_body: 'x' })).error, 'обычный пользователь так не может');
  assert.ok((await boss.c.rpc('admin_post_support_message', { p_recipient: owner.id, p_author_username: 'no_such_user_x', p_body: 'x' })).error, 'автор не найден');
  assert.ok((await boss.c.rpc('admin_post_support_message', { p_recipient: owner.id, p_author_username: boss.username, p_body: 'x' })).error, 'от лица админа нельзя');

  const forAdmin = await wall(boss, owner);
  const mEdited = forAdmin.messages.find((m) => m.id === id);
  assert.equal(mEdited.body, 'исправлено админом');
  assert.equal(mEdited.admin_edited, true);
  const mForged = forAdmin.messages.find((m) => m.id === forged.data);
  assert.equal(mForged.author_username, stranger.username, 'автор — выбранный пользователь');
  assert.equal(mForged.admin_created, true);

  const forOwner = await wall(owner, owner);
  const seen = forOwner.messages.find((m) => m.id === forged.data);
  assert.equal(seen.admin_created, null, 'владельцу пометка админа не показывается');
  const { data: n } = await owner.c.from('notifications').select('actor_id').eq('reference_id', forged.data);
  assert.equal(n[0].actor_id, stranger.id, 'уведомление приходит как от обычного автора');
  const { data: row } = await admin.from('support_messages').select('created_by_admin').eq('id', forged.data).single();
  assert.equal(row.created_by_admin, boss.id, 'в базе записано, что создал админ');
});
