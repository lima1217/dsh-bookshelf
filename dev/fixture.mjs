/**
 * A realistic shelf for screenshots and audits: mixed Chinese and English,
 * long titles and names, every status, page progress, ratings, tags,
 * excerpts, and finish dates spread across this year. No cover URLs, so the
 * generated covers render the same offline.
 */
export function fixtureBooks(now = Date.now()) {
  const year = new Date(now).getFullYear()
  const at = (month, day) => new Date(year, month, day, 12).getTime()
  const DAY = 86400000
  const book = (id, fields) => ({ id, addedAt: now - DAY * 30, updatedAt: now - DAY, ...fields })
  return [
    book('want-1', { title: '万历十五年', author: '黄仁宇', status: 'want', tags: ['历史'], addedAt: now - DAY * 2, publisher: '生活·读书·新知三联书店', published: '1997', pages: 304 }),
    book('want-2', { title: 'Thinking, Fast and Slow', author: 'Daniel Kahneman', status: 'want', note: '朋友推荐，说读完会重新认识自己的判断。', addedAt: now - DAY * 5, pages: 499 }),
    book('want-3', { title: '你一生的故事：特德·姜科幻小说集（含《降临》原著中篇）', author: '特德·姜', status: 'want', tags: ['科幻', '小说'], addedAt: now - DAY * 9 }),
    book('want-4', { title: '可能性的艺术', author: '', status: 'want', addedAt: now - DAY * 12 }),
    book('reading-1', { title: '置身事内', author: '兰小欢', status: 'reading', pages: 340, currentPage: 177, startedAt: at(9, 15), tags: ['经济', '中国'], excerpts: [{ id: 'x1', text: '理解政府的行为，是理解中国经济的关键。', page: 3, note: '', createdAt: at(9, 16) }], publisher: '上海人民出版社', published: '2021' }),
    book('reading-2', { title: '百年孤独', author: '加西亚·马尔克斯', status: 'reading', progress: 23, startedAt: at(9, 2), note: '人物名字有点绕，慢慢读。' }),
    book('reading-3', { title: 'The Left Hand of Darkness', author: 'Ursula K. Le Guin', status: 'reading', pages: 304, currentPage: 12, startedAt: now - DAY * 3 }),
    book('read-1', { title: '我与地坛', author: '史铁生', status: 'read', rating: 5, startedAt: at(0, 3), finishedAt: at(0, 20), pages: 236, tags: ['散文'], note: '在园子里坐一会儿，也是一种阅读。' }),
    book('read-2', { title: '小王子', author: '安托万·德·圣埃克苏佩里', status: 'read', rating: 5, startedAt: at(2, 1), finishedAt: at(2, 4), pages: 112, tags: ['小说'] }),
    book('read-3', { title: '献给阿尔吉侬的花束', author: '丹尼尔·凯斯', status: 'read', rating: 4, startedAt: at(3, 10), finishedAt: at(4, 2), pages: 352, tags: ['小说', '科幻'], excerpts: [{ id: 'x2', text: '请帮我在后院的花束上放些花。', page: 351, note: '最后一句', createdAt: at(4, 2) }, { id: 'x3', text: '智慧如果没有爱的调和，就一文不值。', page: 0, note: '', createdAt: at(4, 1) }] }),
    book('read-4', { title: 'Sapiens: A Brief History of Humankind', author: 'Yuval Noah Harari', status: 'read', rating: 3, startedAt: at(5, 1), finishedAt: at(6, 28), pages: 1443, tags: ['历史'] }),
    book('read-5', { title: '三体', author: '刘慈欣', status: 'read', rating: 4, finishedAt: at(9, 30), pages: 302, tags: ['科幻'] }),
    book('read-6', { title: '活着', author: '余华', status: 'read', rating: 0, finishedAt: new Date(year - 1, 11, 2, 12).getTime(), pages: 191 }),
  ]
}
