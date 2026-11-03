import test from 'node:test';
import assert from 'node:assert/strict';

function formatRelativeTime(mtime?: number, mockNow?: number): string {
  if (!mtime) return '';
  const now = mockNow ?? (Date.now() / 1000);
  const diff = Math.max(0, now - mtime);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) {
    const hours = Math.floor(diff / 3600);
    return `${hours}h ago`;
  }
  const days = Math.floor(diff / 86400);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  const d = new Date(mtime * 1000);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatDuration(sec?: number): string {
  if (!sec || sec <= 0) return '0s';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m}m`;
  return `${m}m ${s}s`;
}

type CatalogLesson = {
  id: string;
  title: string;
  mtime?: number;
  duration?: number;
};

function sortCatalogLessons(
  lessons: CatalogLesson[],
  sortBy: 'newest' | 'oldest' | 'duration' | 'title'
): CatalogLesson[] {
  const list = [...lessons];
  if (sortBy === 'newest') {
    return list.sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
  }
  if (sortBy === 'oldest') {
    return list.sort((a, b) => (a.mtime || 0) - (b.mtime || 0));
  }
  if (sortBy === 'duration') {
    return list.sort((a, b) => (b.duration || 0) - (a.duration || 0));
  }
  if (sortBy === 'title') {
    return list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  }
  return list;
}

test('formatRelativeTime formats relative durations accurately', () => {
  const now = 1700000000;
  assert.equal(formatRelativeTime(now - 15, now), 'Just now');
  assert.equal(formatRelativeTime(now - 120, now), '2m ago');
  assert.equal(formatRelativeTime(now - 3600 * 3, now), '3h ago');
  assert.equal(formatRelativeTime(now - 86400 * 1.2, now), 'Yesterday');
  assert.equal(formatRelativeTime(now - 86400 * 4, now), '4d ago');
});

test('formatDuration formats seconds cleanly into minutes and seconds', () => {
  assert.equal(formatDuration(45), '45s');
  assert.equal(formatDuration(120), '2m');
  assert.equal(formatDuration(106.6), '1m 47s');
  assert.equal(formatDuration(270.9), '4m 31s');
});

test('sortCatalogLessons orders lessons by newest, oldest, duration, and title', () => {
  const lessons: CatalogLesson[] = [
    { id: '1', title: 'Zebra Stripes', mtime: 1000, duration: 60 },
    { id: '2', title: 'Anotasyon ni Rizal', mtime: 3000, duration: 106.6 },
    { id: '3', title: 'Binary Search', mtime: 2000, duration: 180 },
  ];

  // Newest first (default)
  const byNewest = sortCatalogLessons(lessons, 'newest');
  assert.deepEqual(byNewest.map(l => l.id), ['2', '3', '1']);

  // Oldest first
  const byOldest = sortCatalogLessons(lessons, 'oldest');
  assert.deepEqual(byOldest.map(l => l.id), ['1', '3', '2']);

  // Duration (longest first)
  const byDuration = sortCatalogLessons(lessons, 'duration');
  assert.deepEqual(byDuration.map(l => l.id), ['3', '2', '1']);

  // Title (A-Z)
  const byTitle = sortCatalogLessons(lessons, 'title');
  assert.deepEqual(byTitle.map(l => l.id), ['2', '3', '1']);
});
