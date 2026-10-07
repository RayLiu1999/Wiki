import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBookmarks, readBookmarks, writeBookmarks, BOOKMARK_KEY } from '../src/lib/bookmarks.mjs';

test('損壞或舊格式的儲存內容仍能開啟收藏頁', () => {
  for (const raw of [null, '{broken', 'null', '{}', '42', '"x"']) {
    assert.deepEqual(parseBookmarks(raw, ['a']), []);
  }
});
test('收藏只保留存在的文章，並去除重複與無效值', () => {
  assert.deepEqual(parseBookmarks('["b","a","a","removed",2,null]', ['a', 'b']), ['b', 'a']);
});
test('寫入後重新開啟仍能找回收藏，取消收藏也會儲存', () => {
  const data = new Map();
  const storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  assert.equal(writeBookmarks(storage, ['a', 'a', 'b']), true);
  assert.deepEqual(readBookmarks(storage, ['a', 'b']), ['a', 'b']);
  writeBookmarks(storage, ['b']);
  assert.deepEqual(readBookmarks(storage, ['a', 'b']), ['b']);
  assert.equal(data.get(BOOKMARK_KEY), '["b"]');
});
test('瀏覽器禁止儲存或空間不足時，不回報寫入成功', () => {
  const blocked = {
    getItem: () => { throw new Error('Storage unavailable'); },
    setItem: () => { throw new Error('Quota exceeded'); },
  };
  assert.deepEqual(readBookmarks(blocked, ['a']), []);
  assert.equal(writeBookmarks(blocked, ['a']), false);
  assert.equal(writeBookmarks(undefined, ['a']), false);
});
