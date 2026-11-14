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
  assert.deepEqual(Object.keys(n[0].data), ['wall'], 'в уведомлении только адрес окна, без текста сообщения');
  assert.ok(!JSON.stringify(n[0].data).includes('молодец'));
});

test('проверка текста', async () => {
  assert.ok((await post(friend, owner, '   ')).error, 'пустое нельзя');
  assert.ok((await post(friend, owner, 'я'.repeat(501))).error, 'длиннее 500 нельзя');
  assert.ok((await post(owner, owner, 'себе')).error, 'себе нельзя');
});

test('«видят только друзья» и «видит только я»', async () => {
  await setPriv(owner, { support_view: 'friends' });
  assert.equal((await wall(stranger, owner)).can_view, false);
  const strangerView = (await wall(stranger, owner)).messages;
  assert.ok(strangerView.every((m) => m.author_id === stranger.id), 'чужие сообщения не отдаются, остаются только свои');
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


// ---------- Ответы и комментарии ----------
const reply = (viewer, owner, parent, body) => viewer.c.rpc('post_support_message', { p_user: owner.id, p_body: body, p_parent: parent });
const find = (w, id) => w.messages.find((m) => m.id === id);

test('ответы: владелец отвечает, автор отвечает в ответ, ветка в один уровень', async () => {
  const o = await mk('rto'), a = await mk('rta'), b = await mk('rtb');
  const { data: root } = await post(a, o, 'Держись!');
  const r1 = await reply(o, o, root, 'Спасибо!');
  assert.ifError(r1.error);
  const r2 = await reply(a, o, r1.data, 'Обращайся');             // ответ на ответ
  assert.ifError(r2.error);
  const r3 = await reply(b, o, r2.data, 'И от меня тоже');         // третий участник, окно открыто всем
  assert.ifError(r3.error);

  const w = await wall(b, o);
  assert.equal(w.total, 1, 'в счётчике только корневые сообщения');
  const m1 = find(w, r1.data), m2 = find(w, r2.data);
  assert.equal(m1.parent_id, root);
  assert.equal(m2.parent_id, root, 'ответ на ответ остаётся в той же ветке');
  assert.equal(m2.reply_to_id, r1.data);
  assert.equal(m2.reply_to_name, 'rto', 'видно, кому ответили');
  assert.equal(w.messages.length, 4);
  assert.equal(find(w, root).can_reply, true);
  assert.equal(find(await wall(o, o), root).can_delete, true, 'владелец удаляет всё');
  assert.ok((await reply(a, o, '00000000-0000-0000-0000-000000000000', 'в никуда')).error, 'нет такого сообщения');
  assert.ok((await reply(a, a, root, 'чужое окно')).error, 'ответ привязан к окну владельца сообщения');
});

test('ответы: уведомления получают владелец и автор того, кому ответили, без дублей и себе', async () => {
  const o = await mk('nto'), a = await mk('nta'), b = await mk('ntb');
  const { data: root } = await post(a, o, 'Привет');
  await o.c.from('notifications').delete().eq('user_id', o.id);
  await a.c.from('notifications').delete().eq('user_id', a.id);
  const { data: r1 } = await reply(o, o, root, 'Привет-привет');          // владелец отвечает автору
  const na = (await a.c.from('notifications').select('type, data').eq('type', 'support_reply')).data;
  assert.equal(na.length, 1, 'автор сообщения получил уведомление об ответе');
  assert.equal(na[0].data.wall, o.username, 'уведомление ведёт на окно владельца');
  assert.equal((await o.c.from('notifications').select('id').eq('type', 'support_reply')).data.length, 0, 'себе не уведомляет');

  await reply(b, o, r1, 'Мне тоже понравилось');                           // третий отвечает владельцу
  const no = (await o.c.from('notifications').select('id').eq('type', 'support_reply')).data;
  assert.equal(no.length, 1, 'владелец получил уведомление');

  await a.c.from('notifications').delete().eq('user_id', a.id);
  const { data: r3 } = await reply(a, o, r1, 'Спасибо');                   // автор отвечает владельцу
  assert.equal((await a.c.from('notifications').select('id').eq('type', 'support_reply')).data.length, 0, 'себе не уведомляет');
  void r3;
});

test('ответы: права зависят от настроек окна', async () => {
  const o = await mk('pto'), f = await mk('ptf'), s = await mk('pts');
  await admin.from('friendships').insert({ requester_id: f.id, addressee_id: o.id, status: 'accepted' });
  const { data: root } = await post(f, o, 'от друга');
  await setPriv(o, { support_write: 'friends' });
  assert.ifError((await reply(f, o, root, 'друг отвечает')).error, 'друзьям можно');
  assert.ok((await reply(s, o, root, 'посторонний')).error, 'постороннему нельзя, когда пишут только друзья');
  await setPriv(o, { support_write: 'none' });
  assert.ok((await reply(f, o, root, 'друг после запрета')).error, 'при «никто» отвечает только владелец');
  assert.ifError((await reply(o, o, root, 'владелец всегда может')).error);
  await setPriv(o, { support_write: 'all' });
});

test('ответы: при «видит только я» автор видит свою ветку и ответ владельца, чужое — нет', async () => {
  const o = await mk('qto'), a = await mk('qta'), b = await mk('qtb');
  await setPriv(o, { support_view: 'owner' });
  const { data: rootA } = await post(a, o, 'Сообщение A');
  await post(b, o, 'Сообщение B');
  await reply(o, o, rootA, 'Ответ владельца автору A');
  const wa = await wall(a, o);
  assert.equal(wa.can_view, false);
  assert.deepEqual(wa.messages.map((m) => m.body).sort(), ['Ответ владельца автору A', 'Сообщение A'], 'A видит только свою переписку');
  assert.ifError((await reply(a, o, rootA, 'A отвечает владельцу')).error, 'и может продолжать её');
  assert.equal(find(await wall(a, o), rootA).can_reply, true);
  const wb = await wall(b, o);
  assert.ok(wb.messages.every((m) => m.author_id === b.id || m.parent_id === null && m.author_id === b.id), 'B не видит ветку A');
  assert.equal((await wall(o, o)).messages.length, 4, 'владелец видит всё');
});

test('ответы: удаление ветки убирает ответы и их уведомления; ответ можно удалить отдельно', async () => {
  const o = await mk('dto'), a = await mk('dta');
  const { data: root } = await post(a, o, 'Корень');
  const { data: r1 } = await reply(o, o, root, 'Ответ 1');
  const { data: r2 } = await reply(a, o, r1, 'Ответ 2');
  assert.ifError((await a.c.rpc('delete_support_message', { p_id: r2 })).error, 'автор удаляет свой ответ');
  assert.equal(((await admin.from('support_messages').select('id').eq('id', r2)).data).length, 0);
  assert.equal(((await admin.from('support_messages').select('id').eq('id', root)).data).length, 1, 'корень остался');
  assert.ifError((await o.c.rpc('delete_support_message', { p_id: root })).error, 'владелец удаляет ветку целиком');
  assert.equal(((await admin.from('support_messages').select('id').in('id', [root, r1])).data).length, 0, 'ответы ушли вместе с корнем');
  const left = (await admin.from('notifications').select('id').in('reference_id', [root, r1, r2])).data;
  assert.equal(left.length, 0, 'уведомления тоже');
});

test('ответы: лимиты, заблокированный и админ', async () => {
  const o = await mk('lto'), a = await mk('lta');
  const { data: root } = await post(a, o, 'Корень');
  for (let i = 0; i < 30; i++) assert.ifError((await reply(o, o, root, `ответ ${i}`)).error);
  const r = await reply(o, o, root, 'тридцать первый');
  assert.ok(r.error);
  assert.match(r.error.message, /Слишком часто/);
  const bad = await mk('ltb');
  await admin.from('user_blocks').insert({ user_id: bad.id, blocked_until: null, reason: 'тест' });
  assert.ok((await reply(bad, o, root, 'от заблокированного')).error);
  assert.ok((await reply(boss, o, root, 'от админа')).error, 'админ сам не пишет, только модерирует');
});
