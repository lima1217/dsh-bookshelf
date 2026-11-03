/**
 * dsh-bookshelf — browser half.
 *
 * Registers one global sidebar entry and its matching central panel. The panel
 * keeps three reading columns (want / reading / read) backed by a Host-owned
 * JSON document, so the shelf survives browser changes, cleared site data, and
 * DSH restarts. localStorage remains an instant cache and the one-time migration
 * source; the Host file is authoritative.
 *
 * The top content is deliberately offset by `--dsh-frame-leading-clearance`:
 * while the sidebar is fully hidden on macOS, the frame mounts window chrome
 * (traffic lights + reopen controls) at the top-left of the main column and
 * publishes that inline inset. Reserving it here keeps the panel title and
 * toolbar clear of the native window buttons.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-bookshelf',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'dsh-bookshelf'
    const PANEL_ID = 'bookshelf'
    const PANEL_ORDER = 20
    /** Legacy key: local cache plus the one-time migration source. */
    const STORAGE_KEY = 'dsh-bookshelf:v1'
    /** A dirty browser copy that must be retried against the Host on the next open. */
    const PENDING_KEY = 'dsh-bookshelf:pending:v1'
    /** The last shelf this browser saw the Host accept: the common ancestor for a rebase. */
    const BASE_KEY = 'dsh-bookshelf:base:v1'
    const STORAGE_VERSION = 1
    /** Host document version; v2 adds dates, page progress, tags, and excerpts. */
    const HOST_STORE_VERSION = 2
    /** Document-relative on purpose: DSH serves the GUI under a configurable base. */
    const HOST_STATE_ROUTE = 'api/dsh-bookshelf/state'
    const HOST_REVISION_ROUTE = 'api/dsh-bookshelf/revision'
    const HOST_TIMEOUT_MS = 8000
    const HOST_SAVE_DEBOUNCE_MS = 250
    /** Agent tools and other windows write too; a cheap revision probe picks those up. */
    const HOST_POLL_MS = 12000
    const MAX_TAGS = 12
    const MAX_EXCERPTS = 300
    const DAY_MS = 86400000

    const STATUSES = ['want', 'reading', 'read']
    const STATUS_META = {
      want: { label: 'status.want', hint: 'status.wantHint' },
      reading: { label: 'status.reading', hint: 'status.readingHint' },
      read: { label: 'status.read', hint: 'status.readHint' },
    }

    const SORT_OPTIONS = [
      { id: 'added', label: 'sort.added' },
      { id: 'title', label: 'sort.title' },
      { id: 'author', label: 'sort.author' },
      { id: 'finished', label: 'sort.finished' },
      { id: 'rating', label: 'sort.rating' },
    ]

    /** Cover palette: decorative artwork, intentionally independent of theme tokens. */
    const COVER_PALETTE = [
      ['#244355', '#F4E8D4'],
      ['#7C4034', '#F8E9DD'],
      ['#4B5738', '#F1EEDC'],
      ['#54364F', '#F6E7F1'],
      ['#7B5B25', '#FFF3D1'],
      ['#26584E', '#E4F1EB'],
    ]

    const SEED_BOOKS = [
      {
        id: 'seed-possibility',
        title: '可能性的艺术',
        author: '刘瑜',
        status: 'want',
        progress: 0,
        rating: 0,
        note: '比较政治学启蒙，先补上这一课。',
        addedAt: Date.UTC(2026, 9, 28),
      },
      {
        id: 'seed-wanli',
        title: '万历十五年',
        author: '黄仁宇',
        status: 'want',
        progress: 0,
        rating: 0,
        note: '',
        addedAt: Date.UTC(2026, 9, 21),
      },
      {
        id: 'seed-sapiens',
        title: '人类简史',
        author: '尤瓦尔·赫拉利',
        status: 'want',
        progress: 0,
        rating: 0,
        note: '想重读一遍，看看十年前划过的线。',
        addedAt: Date.UTC(2026, 8, 30),
      },
      {
        id: 'seed-inside',
        title: '置身事内',
        author: '兰小欢',
        status: 'reading',
        progress: 52,
        rating: 0,
        note: '读到地方政府与土地财政，信息量很大。',
        addedAt: Date.UTC(2026, 9, 15),
      },
      {
        id: 'seed-solitude',
        title: '百年孤独',
        author: '加西亚·马尔克斯',
        status: 'reading',
        progress: 23,
        rating: 0,
        note: '人物名字有点绕，慢慢读。',
        addedAt: Date.UTC(2026, 9, 2),
      },
      {
        id: 'seed-prince',
        title: '小王子',
        author: '圣埃克苏佩里',
        status: 'read',
        progress: 100,
        rating: 5,
        note: '真正重要的东西，用眼睛是看不见的。',
        addedAt: Date.UTC(2026, 8, 18),
      },
      {
        id: 'seed-ditan',
        title: '我与地坛',
        author: '史铁生',
        status: 'read',
        progress: 100,
        rating: 5,
        note: '在园子里坐一会儿，也是一种阅读。',
        addedAt: Date.UTC(2026, 7, 12),
      },
      {
        id: 'seed-algernon',
        title: '献给阿尔吉侬的花束',
        author: '丹尼尔·凯斯',
        status: 'read',
        progress: 100,
        rating: 4,
        note: '读到最后几页，心里空了一块。',
        addedAt: Date.UTC(2026, 6, 3),
      },
    ]

    const zh = {
      'entry.label': '我的书架',
      'panel.eyebrow': '私人藏书',
      'panel.title': '我的书架',
      'panel.subtitle': '想读的、在手的、读完的，都在这里。',
      'panel.shelfCount': '本藏书',
      'panel.filteredCount': '找到 {count} 本',
      'panel.summary': '{reading} 本在读 · {read} 本已读',
      'action.addTo': '添加一本{status}的书',
      'action.close': '关闭',
      'status.want': '想读',
      'status.reading': '在读',
      'status.read': '已读',
      'status.wantHint': '先收进来，等一个合适的下午。',
      'status.readingHint': '正在翻开的书。',
      'status.readHint': '读完的书，留一枚小小印记。',
      'status.label': '阅读状态',
      'search.label': '搜索书架',
      'search.placeholder': '搜索书名、作者、笔记，或 #标签',
      'search.clear': '清除搜索',
      'search.emptyTitle': '没有找到匹配的书',
      'search.emptyHint': '换个关键词，或清空搜索看看全部书架。',
      'search.emptyAction': '清空搜索',
      'sort.label': '排序',
      'sort.added': '最近添加',
      'sort.title': '按书名',
      'sort.author': '按作者',
      'book.unknownAuthor': '佚名',
      'book.edit': '编辑《{title}》',
      'book.statusFor': '《{title}》的阅读状态',
      'book.added': '加入于 {date}',
      'book.progress': '阅读进度',
      'book.ratingValue': '评分 {value} / 5 星',
      'book.empty': '这一格还空着',
      'book.emptyHint': '把想读的书先放进来吧。',
      'book.addFirst': '添加一本',
      'dialog.addEyebrow': 'NEW BOOK',
      'dialog.editEyebrow': 'EDIT BOOK',
      'dialog.addTitle': '添加一本书',
      'dialog.editTitle': '编辑书籍',
      'field.title': '书名',
      'field.titlePlaceholder': '例如：置身事内',
      'field.author': '作者',
      'field.authorPlaceholder': '例如：兰小欢',
      'field.status': '阅读状态',
      'field.progress': '读到百分之几',
      'field.rating': '读完打几星',
      'field.note': '读书笔记',
      'field.notePlaceholder': '一句想记住的话，或为什么想读它。',
      'field.required': '请填写书名。',
      'action.cancel': '取消',
      'action.save': '保存修改',
      'action.create': '加入书架',
      'action.delete': '删除这本书',
      'action.deleteConfirm': '确定删除',
      'action.deleteHint': '再次点击即可永久删除。',
      'action.clearRating': '清除评分',
      'save.failed': '无法连接 Host 存储；当前修改会先暂存在本机浏览器，并在下次打开时自动重试。',
      'storage.loading': '读取 Host…',
      'storage.saving': '保存到 Host…',
      'storage.host': 'Host 已同步',
      'storage.offline': 'Host 离线 · 本机暂存',
      'storage.hint': '书架保存在这台机器的 DSH 数据目录（~/.dsh/storages/bookshelf.json），换浏览器或清缓存不会丢失。',
      'action.import': '导入',
      'action.importTitle': '批量导入书籍',
      'action.sync': '更新信息',
      'action.syncTitle': '联网补全封面、作者和简介',
      'action.syncAllTitle': '所有书籍都已联网查过，点击重新拉取全部',
      'action.stop': '停止',
      'action.dismiss': '知道了',
      'action.lookup': '联网补全',
      'action.lookupBusy': '查找中…',
      'sync.running': '正在补全书籍信息 {done} / {total}',
      'sync.current': '《{title}》',
      'sync.done': '已补全 {updated} 本书的信息',
      'sync.missed': '{count} 本没有找到匹配的资料',
      'sync.failed': '{count} 本请求失败',
      'sync.cancelled': '已停止，补全了 {updated} 本',
      'sync.offline': '无法连接书目服务，请检查网络后重试。',
      'lookup.found': '已从 {source} 找到资料，保存后生效。',
      'lookup.missed': '没有找到匹配的资料，可以修改书名或作者后再试。',
      'lookup.failed': '网络请求失败，请稍后重试。',
      'lookup.needTitle': '先填写书名。',
      'import.eyebrow': 'IMPORT',
      'import.hint': '每行一本书，可写成「书名 - 作者」或《书名》作者；也可以粘贴 JSON，或拖入 .txt / .csv / .json 文件。支持豆瓣（豆伴导出的 CSV）和 Goodreads 导出的 CSV，会保留状态、评分、标签、短评和读完日期。',
      'import.placeholder': '置身事内 - 兰小欢\n《万历十五年》黄仁宇\n百年孤独',
      'import.file': '选择文件',
      'import.fileFailed': '无法读取这个文件。',
      'import.status': '放进',
      'import.autoFill': '导入后自动联网补全封面、作者和简介',
      'import.found': '识别到 {count} 本新书',
      'import.duplicates': '{count} 本已在书架上，将跳过',
      'import.none': '还没有识别到书名',
      'import.submit': '导入 {count} 本',
      'field.cover': '封面图片链接',
      'field.coverPlaceholder': 'https://…',
      'field.description': '简介',
      'field.descriptionPlaceholder': '内容简介，可联网补全。',
      'book.pages': '{count} 页',
      'book.noInfo': '未找到资料',
      'sort.finished': '最近读完',
      'sort.rating': '按评分',
      'view.label': '视图',
      'view.board': '看板',
      'view.list': '列表',
      'view.grid': '封面墙',
      'view.all': '全部',
      'book.started': '{date} 开始',
      'book.finished': '{date} 读完',
      'book.pageOf': '第 {page} / {pages} 页',
      'book.excerpts': '{count} 条摘录',
      'book.filterTag': '只看 #{tag}',
      'field.currentPage': '读到第几页',
      'field.pages': '总页数',
      'field.pagesHint': '填了总页数，进度会按页码自动计算。',
      'field.started': '开始日期',
      'field.finished': '读完日期',
      'field.tags': '标签',
      'field.tagsPlaceholder': '用逗号或空格分隔，例如：经济 历史',
      'field.excerpts': '摘录与划线',
      'field.excerptPlaceholder': '一段想留下来的原文或心得',
      'field.excerptPage': '页码',
      'field.excerptNote': '我的想法（可选）',
      'action.addExcerpt': '添加摘录',
      'action.removeExcerpt': '删除这条摘录',
      'action.export': '导出',
      'action.exportTitle': '导出书架备份',
      'export.eyebrow': 'EXPORT',
      'export.hint': '导出的文件保存在你的电脑上。JSON 是完整备份，可以再导入；CSV 可用 Excel / Numbers 打开，也能导回来；Markdown 适合分享书单。',
      'export.json': 'JSON 完整备份',
      'export.csv': 'CSV 表格',
      'export.markdown': 'Markdown 书单',
      'export.count': '共 {count} 本书，{excerpts} 条摘录',
      'stats.title': '阅读统计',
      'stats.eyebrow': 'YEAR IN BOOKS',
      'stats.thisYear': '今年读完',
      'stats.open': '查看 {year} 年阅读统计',
      'stats.finished': '读完',
      'stats.pages': '页',
      'stats.avgRating': '平均评分',
      'stats.avgDays': '平均天数 / 本',
      'stats.byMonth': '每月读完',
      'stats.month': '{month} 月',
      'stats.list': '读完的书',
      'stats.tags': '常读的标签',
      'stats.empty': '这一年还没有标记读完的书。读完时把书拖到「已读」，就会记下日期。',
      'stats.prev': '上一年',
      'stats.next': '下一年',
      'storage.merged': '已合并其他窗口或 AI 助手的修改',
    }

    const en = {
      'entry.label': 'My Bookshelf',
      'panel.eyebrow': 'PERSONAL LIBRARY',
      'panel.title': 'My Bookshelf',
      'panel.subtitle': 'The books you want, the book in your hands, and the ones you finished.',
      'panel.shelfCount': 'books',
      'panel.filteredCount': '{count} found',
      'panel.summary': '{reading} reading · {read} finished',
      'action.addTo': 'Add a book to {status}',
      'action.close': 'Close',
      'status.want': 'Want to read',
      'status.reading': 'Reading',
      'status.read': 'Finished',
      'status.wantHint': 'Saved for the right afternoon.',
      'status.readingHint': 'The book currently open.',
      'status.readHint': 'Finished books, with a small mark left behind.',
      'status.label': 'Reading status',
      'search.label': 'Search bookshelf',
      'search.placeholder': 'Search title, author, note, or #tag',
      'search.clear': 'Clear search',
      'search.emptyTitle': 'No matching books',
      'search.emptyHint': 'Try another word, or clear the search to see the whole shelf.',
      'search.emptyAction': 'Clear search',
      'sort.label': 'Sort',
      'sort.added': 'Recently added',
      'sort.title': 'By title',
      'sort.author': 'By author',
      'book.unknownAuthor': 'Unknown author',
      'book.edit': 'Edit “{title}”',
      'book.statusFor': 'Reading status for “{title}”',
      'book.added': 'Added {date}',
      'book.progress': 'Reading progress',
      'book.ratingValue': 'Rated {value} out of 5',
      'book.empty': 'This shelf is empty',
      'book.emptyHint': 'Put the next book you want to read here.',
      'book.addFirst': 'Add one',
      'dialog.addEyebrow': 'NEW BOOK',
      'dialog.editEyebrow': 'EDIT BOOK',
      'dialog.addTitle': 'Add a book',
      'dialog.editTitle': 'Edit book',
      'field.title': 'Title',
      'field.titlePlaceholder': 'e.g. The Little Prince',
      'field.author': 'Author',
      'field.authorPlaceholder': 'e.g. Antoine de Saint-Exupéry',
      'field.status': 'Reading status',
      'field.progress': 'How far in',
      'field.rating': 'Your rating',
      'field.note': 'Note',
      'field.notePlaceholder': 'A line worth keeping, or why you want to read it.',
      'field.required': 'Please enter a title.',
      'action.cancel': 'Cancel',
      'action.save': 'Save changes',
      'action.create': 'Add to shelf',
      'action.delete': 'Delete this book',
      'action.deleteConfirm': 'Confirm delete',
      'action.deleteHint': 'Click again to delete permanently.',
      'action.clearRating': 'Clear rating',
      'save.failed': 'Could not reach Host storage; edits stay in this browser and are retried next time.',
      'storage.loading': 'Reading Host…',
      'storage.saving': 'Saving to Host…',
      'storage.host': 'Host synced',
      'storage.offline': 'Host offline · browser cache',
      'storage.hint': 'The shelf lives in this machine’s DSH data directory (~/.dsh/storages/bookshelf.json), so another browser or a cache clear will not lose it.',
      'action.import': 'Import',
      'action.importTitle': 'Import books in bulk',
      'action.sync': 'Update info',
      'action.syncTitle': 'Fetch covers, authors, and descriptions',
      'action.syncAllTitle': 'Every book has been looked up; click to refetch all',
      'action.stop': 'Stop',
      'action.dismiss': 'Dismiss',
      'action.lookup': 'Fetch info',
      'action.lookupBusy': 'Searching…',
      'sync.running': 'Updating book info {done} / {total}',
      'sync.current': '“{title}”',
      'sync.done': 'Updated {updated} books',
      'sync.missed': '{count} had no match',
      'sync.failed': '{count} failed',
      'sync.cancelled': 'Stopped after updating {updated}',
      'sync.offline': 'Could not reach the book catalogs. Check your network and try again.',
      'lookup.found': 'Found on {source}. Save to keep it.',
      'lookup.missed': 'No match found. Adjust the title or author and try again.',
      'lookup.failed': 'The request failed. Try again later.',
      'lookup.needTitle': 'Enter a title first.',
      'import.eyebrow': 'IMPORT',
      'import.hint': 'One book per line, as “Title - Author”; or paste JSON, or drop a .txt / .csv / .json file. Goodreads and Douban CSV exports keep their shelf, rating, tags, review, and read date.',
      'import.placeholder': 'The Little Prince - Antoine de Saint-Exupéry\nSapiens - Yuval Noah Harari\nOne Hundred Years of Solitude',
      'import.file': 'Choose file',
      'import.fileFailed': 'Could not read that file.',
      'import.status': 'Shelve as',
      'import.autoFill': 'Fetch covers, authors, and descriptions after import',
      'import.found': '{count} new books detected',
      'import.duplicates': '{count} already on the shelf will be skipped',
      'import.none': 'No titles detected yet',
      'import.submit': 'Import {count}',
      'field.cover': 'Cover image URL',
      'field.coverPlaceholder': 'https://…',
      'field.description': 'Description',
      'field.descriptionPlaceholder': 'A short synopsis; can be fetched online.',
      'book.pages': '{count} pages',
      'book.noInfo': 'No info found',
      'sort.finished': 'Recently finished',
      'sort.rating': 'By rating',
      'view.label': 'View',
      'view.board': 'Board',
      'view.list': 'List',
      'view.grid': 'Covers',
      'view.all': 'All',
      'book.started': 'Started {date}',
      'book.finished': 'Finished {date}',
      'book.pageOf': 'p. {page} / {pages}',
      'book.excerpts': '{count} excerpts',
      'book.filterTag': 'Show only #{tag}',
      'field.currentPage': 'Current page',
      'field.pages': 'Total pages',
      'field.pagesHint': 'With a page count, progress follows the page you are on.',
      'field.started': 'Started',
      'field.finished': 'Finished',
      'field.tags': 'Tags',
      'field.tagsPlaceholder': 'Separate with commas or spaces, e.g. history economics',
      'field.excerpts': 'Excerpts & highlights',
      'field.excerptPlaceholder': 'A passage worth keeping, or a takeaway',
      'field.excerptPage': 'Page',
      'field.excerptNote': 'My thought (optional)',
      'action.addExcerpt': 'Add excerpt',
      'action.removeExcerpt': 'Remove this excerpt',
      'action.export': 'Export',
      'action.exportTitle': 'Export a backup of the shelf',
      'export.eyebrow': 'EXPORT',
      'export.hint': 'Files are saved on your computer. JSON is a complete backup you can import again; CSV opens in Excel or Numbers and imports back; Markdown is for sharing a reading list.',
      'export.json': 'JSON backup',
      'export.csv': 'CSV spreadsheet',
      'export.markdown': 'Markdown list',
      'export.count': '{count} books, {excerpts} excerpts',
      'stats.title': 'Reading stats',
      'stats.eyebrow': 'YEAR IN BOOKS',
      'stats.thisYear': 'this year',
      'stats.open': 'Open {year} reading stats',
      'stats.finished': 'finished',
      'stats.pages': 'pages',
      'stats.avgRating': 'avg rating',
      'stats.avgDays': 'avg days / book',
      'stats.byMonth': 'Finished per month',
      'stats.month': 'Month {month}',
      'stats.list': 'Books finished',
      'stats.tags': 'Top tags',
      'stats.empty': 'No books marked finished in this year yet. Moving a book to Finished records the date.',
      'stats.prev': 'Previous year',
      'stats.next': 'Next year',
      'storage.merged': 'Merged changes from another window or the assistant',
    }

    /* ── icons ─────────────────────────────────────────────────────────── */

    function glyph(children, size, extra) {
      return h(
        'svg',
        {
          viewBox: '0 0 16 16',
          width: size || 16,
          height: size || 16,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          ...(extra || {}),
        },
        children,
      )
    }

    function SearchIcon({ size }) {
      return glyph(
        [
          h('circle', { key: 'c', cx: 7, cy: 7, r: 4.2 }),
          h('path', { key: 'p', d: 'M10.1 10.1 13.4 13.4' }),
        ],
        size,
      )
    }

    function PlusIcon({ size }) {
      return glyph(
        [
          h('path', { key: 'a', d: 'M8 3.2v9.6' }),
          h('path', { key: 'b', d: 'M3.2 8h9.6' }),
        ],
        size,
      )
    }

    function CloseIcon({ size }) {
      return glyph(
        [
          h('path', { key: 'a', d: 'M4 4l8 8' }),
          h('path', { key: 'b', d: 'M12 4l-8 8' }),
        ],
        size,
      )
    }

    function PencilIcon({ size }) {
      return glyph(
        [
          h('path', { key: 'a', d: 'M10.8 2.9a1.4 1.4 0 0 1 2 2L5.3 12.4l-2.7.7.7-2.7z' }),
          h('path', { key: 'b', d: 'M9.6 4.1l2 2' }),
        ],
        size,
      )
    }

    function ShelfMark({ size }) {
      return glyph(
        [
          h('path', { key: 's', d: 'M2.2 13.1h11.6' }),
          h('path', { key: 'a', d: 'M3.4 3.1h2.2v8.8H3.4z' }),
          h('path', { key: 'b', d: 'M6.9 2.2h2.2v9.7H6.9z' }),
          h('path', { key: 'c', d: 'M10.4 3.1l2.2.5-.6 8.6-2.2-.5z' }),
        ],
        size,
      )
    }

    function WantIcon({ size }) {
      return glyph([h('path', { key: 'p', d: 'M4.2 2.5h7.6v11l-3.8-2.7-3.8 2.7z' })], size)
    }

    function ReadingIcon({ size }) {
      return glyph(
        [
          h('path', { key: 'a', d: 'M8 3.2C6.6 2.1 4.6 2 3 2v10.3c1.6 0 3.6.1 5 1.2 1.4-1.1 3.4-1.2 5-1.2V2c-1.6 0-3.6.1-5 1.2z' }),
          h('path', { key: 'b', d: 'M8 3.2v10.3' }),
        ],
        size,
      )
    }

    function ReadIcon({ size }) {
      return glyph(
        [
          h('circle', { key: 'c', cx: 8, cy: 8, r: 5.8 }),
          h('path', { key: 'p', d: 'M5.2 8.2l1.9 1.9 3.8-4' }),
        ],
        size,
      )
    }

    function ImportIcon({ size }) {
      return glyph(
        [
          h('path', { key: 'a', d: 'M8 2.6v7.2' }),
          h('path', { key: 'b', d: 'M5.2 7.2 8 10l2.8-2.8' }),
          h('path', { key: 'c', d: 'M2.8 10.4v1.4c0 .8.6 1.4 1.4 1.4h7.6c.8 0 1.4-.6 1.4-1.4v-1.4' }),
        ],
        size,
      )
    }

    function SparkIcon({ size }) {
      return glyph(
        [
          h('path', { key: 'a', d: 'M6.4 2.4 7.5 5.6l3.2 1.1-3.2 1.1-1.1 3.2-1.1-3.2-3.2-1.1 3.2-1.1z' }),
          h('path', { key: 'b', d: 'M11.9 9.4l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z' }),
        ],
        size,
      )
    }

    function ExportIcon({ size }) {
      return glyph(
        [
          h('path', { key: 'a', d: 'M8 10V2.8' }),
          h('path', { key: 'b', d: 'M5.2 5.6 8 2.8l2.8 2.8' }),
          h('path', { key: 'c', d: 'M2.8 10.4v1.4c0 .8.6 1.4 1.4 1.4h7.6c.8 0 1.4-.6 1.4-1.4v-1.4' }),
        ],
        size,
      )
    }

    function TrashIcon({ size }) {
      return glyph(
        [
          h('path', { key: 'a', d: 'M3 4.4h10' }),
          h('path', { key: 'b', d: 'M6.2 4.4V3h3.6v1.4' }),
          h('path', { key: 'c', d: 'M4.4 4.4l.6 8.4h6l.6-8.4' }),
        ],
        size,
      )
    }

    function ChevronIcon({ size, flip }) {
      return glyph([h('path', { key: 'p', d: flip ? 'M6 3.5 10.5 8 6 12.5' : 'M10 3.5 5.5 8 10 12.5' })], size)
    }

    function SpinnerIcon({ size }) {
      return glyph(
        [
          h('circle', { key: 'a', cx: 8, cy: 8, r: 5.6, opacity: 0.25 }),
          h('path', { key: 'b', d: 'M13.6 8A5.6 5.6 0 0 0 8 2.4' }),
        ],
        size,
        { className: 'bs-spin' },
      )
    }

    function StatusIcon({ status, size }) {
      if (status === 'want') return h(WantIcon, { size })
      if (status === 'reading') return h(ReadingIcon, { size })
      return h(ReadIcon, { size })
    }

    /** The sidebar row glyph; the shell owns the button, label, and rail geometry. */
    function BookshelfPanelIcon({ size }) {
      return h(
        'svg',
        {
          viewBox: '0 0 16 16',
          width: size,
          height: size,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.3,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'data-dsh-panel-entry': PANEL_ID,
          'aria-hidden': true,
        },
        [
          h('path', { key: 'shelf', d: 'M2.2 13h11.6' }),
          h('path', { key: 'a', d: 'M3.2 3.4h2.3v8.4H3.2z' }),
          h('path', { key: 'b', d: 'M6.8 2.2h2.3v9.6H6.8z' }),
          h('path', { key: 'c', d: 'M10.5 3.2l2.2.5-.7 8.1-2.2-.5z' }),
        ],
      )
    }

    /* ── local data ────────────────────────────────────────────────────── */

    function clampNumber(value, min, max, fallback) {
      const number = Number(value)
      if (!Number.isFinite(number)) return fallback
      return Math.min(max, Math.max(min, Math.round(number)))
    }

    function isStatus(value) {
      return STATUSES.includes(value)
    }

    function newBookId() {
      try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
          return `book-${crypto.randomUUID()}`
        }
      } catch {}
      return `book-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
    }

    function timestamp(value) {
      const number = Number(value)
      return Number.isFinite(number) && number > 0 ? Math.round(number) : 0
    }

    function normalizeTags(value) {
      const list = typeof value === 'string' ? value.split(/[,，、;；\s]+/) : Array.isArray(value) ? value : []
      const seen = new Set()
      const tags = []
      for (const entry of list) {
        if (typeof entry !== 'string') continue
        const tag = entry.trim().replace(/^#+/, '').replace(/\s+/g, ' ').slice(0, 24)
        const key = tag.toLocaleLowerCase()
        if (tag === '' || seen.has(key)) continue
        seen.add(key)
        tags.push(tag)
        if (tags.length >= MAX_TAGS) break
      }
      return tags
    }

    function newExcerptId() {
      return newBookId().replace(/^book-/, 'ex-')
    }

    function normalizeExcerpts(value) {
      if (!Array.isArray(value)) return []
      const excerpts = []
      for (const raw of value) {
        if (raw === null || typeof raw !== 'object') continue
        const text = typeof raw.text === 'string' ? raw.text.trim().slice(0, 2000) : ''
        if (text === '') continue
        excerpts.push({
          id: typeof raw.id === 'string' && raw.id !== '' ? raw.id.slice(0, 80) : newExcerptId(),
          text,
          page: clampNumber(raw.page, 0, 20000, 0),
          note: typeof raw.note === 'string' ? raw.note.trim().slice(0, 600) : '',
          createdAt: timestamp(raw.createdAt) || Date.now(),
        })
        if (excerpts.length >= MAX_EXCERPTS) break
      }
      return excerpts
    }

    /** Page position wins over a stored percentage whenever both page counts are known. */
    function deriveProgress(status, progress, currentPage, pages) {
      if (status === 'read') return 100
      if (pages > 0 && currentPage > 0) return Math.min(100, Math.round((currentPage / pages) * 100))
      return progress
    }

    /** Mirrors the Host: starting stamps `startedAt`, finishing stamps `finishedAt`, want clears both. */
    function applyStatus(book, status, now) {
      if (!isStatus(status) || status === book.status) return book
      const next = { ...book, status }
      if (status === 'reading') {
        if (!next.startedAt) next.startedAt = now
        next.finishedAt = 0
        if (next.progress >= 100) {
          next.progress = 0
          next.currentPage = 0
        }
      } else if (status === 'read') {
        if (!next.finishedAt) next.finishedAt = now
        next.progress = 100
      } else {
        next.startedAt = 0
        next.finishedAt = 0
        if (next.progress >= 100) {
          next.progress = 0
          next.currentPage = 0
        }
      }
      return next
    }

    function normalizeBook(raw) {
      if (raw === null || typeof raw !== 'object') return undefined
      const title = typeof raw.title === 'string' ? raw.title.trim() : ''
      if (title === '') return undefined
      const status = isStatus(raw.status) ? raw.status : 'want'
      const resolvedAddedAt = timestamp(raw.addedAt) || Date.now()
      const pages = clampNumber(raw.pages, 0, 20000, 0)
      const currentPage = clampNumber(raw.currentPage, 0, 20000, 0)
      return {
        id: typeof raw.id === 'string' && raw.id !== '' ? raw.id : newBookId(),
        title: title.slice(0, 240),
        author: typeof raw.author === 'string' ? raw.author.trim().slice(0, 160) : '',
        status,
        progress: deriveProgress(status, clampNumber(raw.progress, 0, 100, 0), currentPage, pages),
        currentPage,
        rating: clampNumber(raw.rating, 0, 5, 0),
        note: typeof raw.note === 'string' ? raw.note.trim().slice(0, 4000) : '',
        tags: normalizeTags(raw.tags),
        excerpts: normalizeExcerpts(raw.excerpts),
        addedAt: resolvedAddedAt,
        updatedAt: timestamp(raw.updatedAt) || resolvedAddedAt,
        startedAt: timestamp(raw.startedAt),
        finishedAt: status === 'read' ? timestamp(raw.finishedAt) : 0,
        cover: safeImageUrl(raw.cover),
        description: cleanText(raw.description, 2000),
        publisher: cleanText(raw.publisher, 160),
        published: cleanText(raw.published, 16),
        pages: clampNumber(raw.pages, 0, 20000, 0),
        isbn: cleanText(raw.isbn, 20),
        metaStatus: raw.metaStatus === 'ok' || raw.metaStatus === 'miss' ? raw.metaStatus : '',
      }
    }

    function cleanText(value, max) {
      if (typeof value !== 'string' && typeof value !== 'number') return ''
      return String(value)
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s*\n+/g, '\n')
        .trim()
        .slice(0, max)
    }

    function safeImageUrl(value) {
      if (typeof value !== 'string') return ''
      const url = value.trim().replace(/^http:\/\//i, 'https://')
      return /^https:\/\/[^\s"'<>]+$/i.test(url) ? url.slice(0, 600) : ''
    }

    /** Books never looked up that still miss a catalog field; looked-up books only refresh on a full pass. */
    function needsMetadata(book) {
      return book.metaStatus === '' && (book.cover === '' || book.description === '' || book.author === '')
    }

    function loadLocalBooks() {
      const seeds = SEED_BOOKS.map(normalizeBook)
      try {
        if (typeof localStorage === 'undefined') return seeds
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw === null) return seeds
        const parsed = JSON.parse(raw)
        if (parsed === null || typeof parsed !== 'object' || parsed.version !== STORAGE_VERSION) {
          return seeds
        }
        if (!Array.isArray(parsed.books)) return seeds
        return parsed.books.map(normalizeBook).filter(Boolean)
      } catch {
        return seeds
      }
    }

    function persistLocalCache(books) {
      try {
        if (typeof localStorage === 'undefined') return false
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, books }))
        return true
      } catch {
        return false
      }
    }

    /** Remember unsaved edits so a failed/offline Host write can be retried later. */
    function markPendingShelf(books) {
      try {
        if (typeof localStorage === 'undefined') return
        localStorage.setItem(PENDING_KEY, JSON.stringify({
          version: STORAGE_VERSION,
          savedAt: Date.now(),
          books,
        }))
      } catch {}
    }

    function readPendingShelf() {
      try {
        if (typeof localStorage === 'undefined') return null
        const raw = localStorage.getItem(PENDING_KEY)
        if (raw === null) return null
        const parsed = JSON.parse(raw)
        if (parsed === null || typeof parsed !== 'object' || parsed.version !== STORAGE_VERSION) return null
        if (!Array.isArray(parsed.books)) return null
        const books = parsed.books.map(normalizeBook).filter(Boolean)
        const savedAt = Number(parsed.savedAt)
        return { books, savedAt: Number.isFinite(savedAt) ? savedAt : 0 }
      } catch {
        return null
      }
    }

    function clearPendingShelf() {
      try {
        if (typeof localStorage === 'undefined') return
        localStorage.removeItem(PENDING_KEY)
      } catch {}
    }

    function persistBase(revision, books) {
      try {
        if (typeof localStorage === 'undefined') return
        localStorage.setItem(BASE_KEY, JSON.stringify({ version: STORAGE_VERSION, revision, books }))
      } catch {}
    }

    function readBase() {
      try {
        if (typeof localStorage === 'undefined') return null
        const raw = localStorage.getItem(BASE_KEY)
        if (raw === null) return null
        const parsed = JSON.parse(raw)
        if (parsed === null || typeof parsed !== 'object' || parsed.version !== STORAGE_VERSION) return null
        if (!Array.isArray(parsed.books) || !Number.isSafeInteger(parsed.revision)) return null
        return { revision: parsed.revision, books: parsed.books.map(normalizeBook).filter(Boolean) }
      } catch {
        return null
      }
    }

    /**
     * Three-way merge of one shelf: `base` is the last copy both sides agreed on,
     * `local` carries this window's edits, `remote` carries everyone else's (other
     * windows, agent tools). A book changed on one side only takes that side; a
     * book changed on both takes the later edit; a delete loses to a concurrent
     * edit so nothing written elsewhere silently disappears.
     */
    function mergeShelves(base, local, remote) {
      const key = book => JSON.stringify(book)
      const baseById = new Map(base.map(book => [book.id, key(book)]))
      const localById = new Map(local.map(book => [book.id, book]))
      const remoteById = new Map(remote.map(book => [book.id, book]))
      const merged = []
      for (const book of local) {
        if (remoteById.has(book.id)) continue
        const before = baseById.get(book.id)
        // New in this window, or deleted remotely without a local edit since.
        if (before === undefined || before !== key(book)) merged.push(book)
      }
      for (const theirs of remote) {
        const ours = localById.get(theirs.id)
        const before = baseById.get(theirs.id)
        if (ours === undefined) {
          // Deleted here: honor it unless the other side edited it meanwhile.
          if (before === undefined || before !== key(theirs)) merged.push(theirs)
          continue
        }
        const oursChanged = before === undefined || before !== key(ours)
        const theirsChanged = before === undefined || before !== key(theirs)
        if (oursChanged && !theirsChanged) merged.push(ours)
        else if (!oursChanged) merged.push(theirs)
        else merged.push(ours.updatedAt > theirs.updatedAt ? ours : theirs)
      }
      return merged
    }

    function initialBooks() {
      const pending = readPendingShelf()
      return pending === null ? loadLocalBooks() : pending.books
    }

    /**
     * One request to the Host-owned shelf document. The route is same-origin and
     * loopback-only; `credentials: same-origin` carries the GUI's own session.
     */
    async function hostRequest(method, payload, signal, route) {
      const controller = new AbortController()
      const abort = () => controller.abort()
      if (signal) {
        if (signal.aborted) controller.abort()
        else signal.addEventListener('abort', abort, { once: true })
      }
      const timer = setTimeout(abort, HOST_TIMEOUT_MS)
      try {
        const response = await fetch(route || HOST_STATE_ROUTE, {
          method,
          credentials: 'same-origin',
          cache: 'no-store',
          referrerPolicy: 'no-referrer',
          headers: payload === undefined ? undefined : { 'content-type': 'application/json' },
          body: payload === undefined ? undefined : JSON.stringify(payload),
          signal: controller.signal,
        })
        let body
        try {
          body = await response.json()
        } catch {
          body = undefined
        }
        if (!response.ok) {
          const error = new Error(
            body && typeof body.error === 'string' ? body.error : `Host storage HTTP ${response.status}`,
          )
          error.status = response.status
          error.body = body
          throw error
        }
        return body
      } finally {
        clearTimeout(timer)
        if (signal) signal.removeEventListener('abort', abort)
      }
    }

    /** `null` books means the Host has never written this shelf yet. */
    async function readHostShelf(signal) {
      const body = await hostRequest('GET', undefined, signal)
      if (body === null || typeof body !== 'object' || body.ok !== true) {
        throw new Error('Host storage returned an invalid response')
      }
      if (body.books === null) {
        return { books: null, revision: 0, updatedAt: 0 }
      }
      if (!Array.isArray(body.books)) {
        throw new Error('Host storage returned an invalid book list')
      }
      const books = body.books.map(normalizeBook).filter(Boolean)
      return {
        books,
        revision: Number.isSafeInteger(body.revision) ? body.revision : 0,
        updatedAt: Number.isFinite(body.updatedAt) ? body.updatedAt : 0,
      }
    }

    function shelfFromBody(body) {
      return {
        books: Array.isArray(body.books) ? body.books.map(normalizeBook).filter(Boolean) : null,
        revision: Number.isSafeInteger(body.revision) ? body.revision : 0,
        updatedAt: Number.isFinite(body.updatedAt) ? body.updatedAt : 0,
      }
    }

    /**
     * Write the whole shelf on top of `baseRevision`. A stale base throws an
     * error with `status === 409` and `current`, the shelf now on the Host.
     */
    async function writeHostShelf(books, baseRevision) {
      let body
      try {
        body = await hostRequest('PUT', { version: HOST_STORE_VERSION, baseRevision, books })
      } catch (error) {
        if (error && error.status === 409 && error.body && typeof error.body === 'object') {
          const current = shelfFromBody(error.body)
          error.current = { ...current, books: current.books || [] }
        }
        throw error
      }
      if (body === null || typeof body !== 'object' || body.ok !== true || !Array.isArray(body.books)) {
        throw new Error('Host storage rejected the saved shelf')
      }
      return shelfFromBody(body)
    }

    async function readHostRevision(signal) {
      const body = await hostRequest('GET', undefined, signal, HOST_REVISION_ROUTE)
      if (body === null || typeof body !== 'object' || !Number.isSafeInteger(body.revision)) {
        throw new Error('Host storage returned an invalid revision')
      }
      return body.revision
    }

    /* ── metadata lookup ───────────────────────────────────────────────── */

    /**
     * Book metadata comes from three public, CORS-enabled catalogs queried in
     * parallel. None is complete on its own: Apple Books (US store) carries the
     * most Chinese titles but returns noisy fuzzy matches, Google Books has good
     * descriptions but rate-limits keyless clients, and Open Library has stable
     * covers but thin Chinese coverage. Candidates are kept only when their
     * title matches closely, then merged field by field from the best match down.
     */
    const LOOKUP_TIMEOUT = 9000
    const LOOKUP_WORKERS = 3
    const MATCH_THRESHOLD = 0.8

    async function fetchJson(url, signal) {
      const controller = new AbortController()
      const abort = () => controller.abort()
      const timer = setTimeout(abort, LOOKUP_TIMEOUT)
      if (signal) {
        if (signal.aborted) abort()
        else signal.addEventListener('abort', abort, { once: true })
      }
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return await response.json()
      } finally {
        clearTimeout(timer)
        if (signal) signal.removeEventListener('abort', abort)
      }
    }

    function queryString(params) {
      return Object.entries(params)
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join('&')
    }

    async function searchApple(title, signal) {
      const data = await fetchJson(
        `https://itunes.apple.com/search?${queryString({ term: title, media: 'ebook', country: 'us', limit: 10 })}`,
        signal,
      )
      return (data.results || []).map(item => ({
        source: 'Apple Books',
        title: item.trackName || '',
        authors: item.artistName ? [item.artistName] : [],
        cover: item.artworkUrl100 ? item.artworkUrl100.replace(/\/\d+x\d+bb\./, '/600x600bb.') : '',
        description: item.description || '',
        published: (item.releaseDate || '').slice(0, 4),
      }))
    }

    async function searchGoogle(title, signal) {
      const data = await fetchJson(
        `https://www.googleapis.com/books/v1/volumes?${queryString({ q: `intitle:${title}`, maxResults: 10, printType: 'books' })}`,
        signal,
      )
      return (data.items || []).map(item => {
        const info = item.volumeInfo || {}
        const links = info.imageLinks || {}
        const isbn = (info.industryIdentifiers || []).find(id => id.type === 'ISBN_13')
          || (info.industryIdentifiers || []).find(id => id.type === 'ISBN_10')
        return {
          source: 'Google Books',
          title: info.title || '',
          authors: info.authors || [],
          cover: (links.thumbnail || links.smallThumbnail || '').replace(/&edge=curl/, ''),
          description: info.description || '',
          publisher: info.publisher || '',
          published: (info.publishedDate || '').slice(0, 4),
          pages: info.pageCount || 0,
          isbn: isbn ? isbn.identifier : '',
        }
      })
    }

    async function searchOpenLibrary(title, signal) {
      const data = await fetchJson(
        `https://openlibrary.org/search.json?${queryString({
          title,
          limit: 8,
          fields: 'key,title,author_name,cover_i,first_publish_year,publisher,number_of_pages_median,isbn',
        })}`,
        signal,
      )
      return (data.docs || []).map(doc => ({
        source: 'Open Library',
        title: doc.title || '',
        authors: doc.author_name || [],
        cover: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : '',
        description: '',
        publisher: (doc.publisher || [])[0] || '',
        published: doc.first_publish_year ? String(doc.first_publish_year) : '',
        pages: doc.number_of_pages_median || 0,
        isbn: (doc.isbn || [])[0] || '',
        workKey: doc.key || '',
      }))
    }

    const BOOKISH = /小说|小說|著作|作品|书籍|書籍|图书|圖書|诗集|詩集|散文|随笔|隨筆|回忆录|回憶錄|传记|傳記|戏剧|戲劇|剧本|劇本|童话|童話|寓言|非虚构|非虛構|novel|book|memoir|poem/i

    function wikiApi(host, params) {
      return `https://${host}/w/api.php?${queryString({ format: 'json', formatversion: 2, origin: '*', ...params })}`
    }

    async function wikidataAuthors(entityId, signal) {
      if (!/^Q\d+$/.test(entityId)) return []
      const entity = await fetchJson(
        wikiApi('www.wikidata.org', { action: 'wbgetentities', ids: entityId, props: 'claims' }),
        signal,
      )
      const claims = ((entity.entities || {})[entityId] || {}).claims || {}
      const ids = (claims.P50 || [])
        .map(claim => claim.mainsnak && claim.mainsnak.datavalue && claim.mainsnak.datavalue.value.id)
        .filter(id => typeof id === 'string')
        .slice(0, 3)
      if (ids.length === 0) return []
      const people = await fetchJson(
        wikiApi('www.wikidata.org', {
          action: 'wbgetentities',
          ids: ids.join('|'),
          props: 'labels',
          languages: 'zh-cn|zh-hans|zh|en',
          languagefallback: 1,
        }),
        signal,
      )
      return ids
        .map(id => {
          const labels = ((people.entities || {})[id] || {}).labels || {}
          const label = labels['zh-cn'] || labels['zh-hans'] || labels.zh || labels.en
          return label ? label.value : ''
        })
        .filter(Boolean)
    }

    /**
     * Chinese Wikipedia covers the classics the store catalogs miss. Titles come
     * back in Simplified Chinese via `variant`; only pages whose short
     * description reads like a book survive, and the infobox image is a weak
     * cover (often a first-edition title page), used only when no store has one.
     */
    async function searchWikipedia(title, signal) {
      const data = await fetchJson(
        wikiApi('zh.wikipedia.org', {
          action: 'query',
          variant: 'zh-cn',
          redirects: 1,
          generator: 'search',
          gsrsearch: title,
          gsrlimit: 4,
          gsrnamespace: 0,
          prop: 'extracts|pageimages|pageprops|description|info',
          inprop: 'varianttitles',
          exintro: 1,
          explaintext: 1,
          exsentences: 5,
          piprop: 'thumbnail',
          pithumbsize: 600,
          ppprop: 'wikibase_item',
        }),
        signal,
      )
      const pages = ((data.query || {}).pages || [])
        .slice()
        .sort((left, right) => (left.index || 0) - (right.index || 0))
        .map(page => ({
          title: (page.varianttitles && page.varianttitles['zh-cn']) || page.title || '',
          about: page.description || '',
          extract: page.extract || '',
          image: (page.thumbnail && page.thumbnail.source) || '',
          entity: (page.pageprops && page.pageprops.wikibase_item) || '',
        }))
        .filter(page => BOOKISH.test(page.about) && titleScore(title, page.title) >= MATCH_THRESHOLD)
      if (pages.length === 0) return []
      const page = pages[0]
      let authors = []
      try {
        authors = await wikidataAuthors(page.entity, signal)
      } catch {}
      return [{
        source: 'Wikipedia',
        title: page.title,
        authors,
        cover: page.image,
        weakCover: true,
        description: page.extract,
      }]
    }

    const SOURCES = [searchApple, searchGoogle, searchOpenLibrary, searchWikipedia]

    function titleKey(value) {
      return String(value || '')
        .normalize('NFKC')
        .toLowerCase()
        .replace(/[（(〔[【][^）)〕\]】]*[）)〕\]】]/g, '')
        .split(/[:：]/)[0]
        .replace(/[^\p{L}\p{N}]/gu, '')
    }

    function authorKey(value) {
      return String(value || '')
        .normalize('NFKC')
        .toLowerCase()
        .replace(/[（(〔[【][^）)〕\]】]*[）)〕\]】]/g, '')
        .replace(/[著译编]$/u, '')
        .replace(/[^\p{L}\p{N}]/gu, '')
    }

    function editDistance(left, right) {
      const a = Array.from(left)
      const b = Array.from(right)
      let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
      for (let i = 1; i <= a.length; i += 1) {
        const current = [i]
        for (let j = 1; j <= b.length; j += 1) {
          current[j] = Math.min(
            previous[j] + 1,
            current[j - 1] + 1,
            previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
          )
        }
        previous = current
      }
      return previous[b.length]
    }

    /**
     * 1 for the same main title, 0.85 when one extends the other (a volume or
     * edition suffix), 0.82 for a one- or two-character difference such as a
     * transliteration variant (卡拉玛佐夫 / 卡拉马佐夫), else 0.
     */
    function titleScore(wanted, found) {
      const left = titleKey(wanted)
      const right = titleKey(found)
      if (left === '' || right === '') return 0
      if (left === right) return 1
      const [short, long] = left.length <= right.length ? [left, right] : [right, left]
      if (short.length >= 2 && long.startsWith(short) && short.length / long.length >= 0.5) return 0.85
      const shortLength = Array.from(short).length
      const longLength = Array.from(long).length
      if (shortLength >= 4 && editDistance(short, long) <= (longLength <= 8 ? 1 : 2)) return 0.82
      return 0
    }

    function authorMatches(wanted, authors) {
      const key = authorKey(wanted)
      if (key.length < 2) return false
      return authors.some(author => {
        const other = authorKey(author)
        return other.length >= 2 && (other.includes(key) || key.includes(other))
      })
    }

    function rankCandidate(book, candidate) {
      const score = titleScore(book.title, candidate.title)
      if (score < MATCH_THRESHOLD) return 0
      let rank = score
      if (book.author !== '' && candidate.authors.length > 0) {
        rank += authorMatches(book.author, candidate.authors) ? 0.3 : -0.15
      }
      if (candidate.cover !== '' && !candidate.weakCover) rank += 0.08
      if (candidate.description.length > 20) rank += 0.08
      return rank
    }

    async function openLibraryDescription(workKey, signal) {
      if (!/^\/works\/OL\d+W$/.test(workKey)) return ''
      const work = await fetchJson(`https://openlibrary.org${workKey}.json`, signal)
      const value = typeof work.description === 'string'
        ? work.description
        : work.description && work.description.value
      return typeof value === 'string' ? value : ''
    }

    /** Resolves to merged metadata, `null` when no catalog matched, or throws when every catalog failed. */
    async function lookupBook(book, signal) {
      const settled = await Promise.allSettled(SOURCES.map(search => search(book.title, signal)))
      if (signal && signal.aborted) throw new Error('aborted')
      const candidates = []
      for (const result of settled) {
        if (result.status === 'fulfilled') candidates.push(...result.value)
      }
      if (settled.every(result => result.status === 'rejected')) throw new Error('offline')

      const ranked = candidates
        .map(candidate => ({ candidate, rank: rankCandidate(book, candidate) }))
        .filter(entry => entry.rank > 0)
        .sort((left, right) => right.rank - left.rank)
        .map(entry => entry.candidate)
      if (ranked.length === 0) return null

      const pick = key => {
        for (const candidate of ranked) if (candidate[key]) return candidate[key]
        return ''
      }
      const strongCover = ranked.find(candidate => candidate.cover && !candidate.weakCover)
      const best = ranked[0]
      const cjk = /[\u3400-\u9fff]/
      let publisher = pick('publisher')
      if (cjk.test(book.title) && !cjk.test(publisher)) publisher = ''
      let description = pick('description')
      if (description === '') {
        const work = ranked.find(candidate => candidate.workKey)
        if (work) {
          try {
            description = await openLibraryDescription(work.workKey, signal)
          } catch {}
        }
      }
      return {
        source: best.source,
        author: cleanText((ranked.find(candidate => candidate.authors.length > 0) || best).authors.slice(0, 3).join(' / '), 160),
        cover: safeImageUrl(strongCover ? strongCover.cover : pick('cover')),
        description: cleanText(description, 2000),
        publisher: cleanText(publisher, 160),
        published: cleanText(pick('published'), 16),
        pages: clampNumber(pick('pages'), 0, 20000, 0),
        isbn: cleanText(pick('isbn'), 20),
      }
    }

    const META_FIELDS = ['cover', 'description', 'publisher', 'published', 'pages', 'isbn']

    /** Fills gaps from `meta`; `overwrite` also replaces catalog fields. Title and note are never touched. */
    function applyMetadata(book, meta, overwrite) {
      if (meta === null) return { ...book, metaStatus: book.metaStatus === 'ok' ? 'ok' : 'miss' }
      const next = { ...book, metaStatus: 'ok', updatedAt: Date.now() }
      if (book.author === '' && meta.author !== '') next.author = meta.author
      for (const key of META_FIELDS) {
        if (meta[key] && (overwrite || !book[key])) next[key] = meta[key]
      }
      return next
    }

    /* ── import parsing ────────────────────────────────────────────────── */

    function parseImportLine(line, csv) {
      const text = line
        .trim()
        .replace(/^(?:[-*•·+]|\d+[.)、]|\[[ xX]\])\s*/, '')
        .trim()
      if (text === '' || text.startsWith('#')) return null
      let title = text
      let author = ''
      const quoted = text.match(/^《([^》]+)》\s*(.*)$/)
      if (quoted) {
        title = quoted[1]
        author = quoted[2]
      } else {
        const separator = csv ? /\t|,|，/ : /\t|\s+[-—–|/／]\s+|——|\s+by\s+|\s*[|／]\s*/i
        const parts = text.split(separator)
        if (parts.length > 1) {
          title = parts[0]
          author = parts[1]
        }
      }
      title = title.replace(/^["'“《「『]+|["'”》」』]+$/g, '').trim()
      author = author
        .replace(/^(?:作者|author)\s*[:：]\s*/i, '')
        .replace(/^[-—–(（\s]+|[)）\s]+$/g, '')
        .replace(/\s*[著]$/, '')
        .trim()
      if (title === '' || /^(?:title|书名|書名)$/i.test(title)) return null
      return { title, author }
    }

    /** RFC 4180 rows: quoted fields may hold the delimiter, quotes (doubled), and newlines. */
    function parseCsv(text, delimiter) {
      const rows = []
      let row = []
      let field = ''
      let quoted = false
      for (let index = 0; index < text.length; index += 1) {
        const character = text[index]
        if (quoted) {
          if (character === '"') {
            if (text[index + 1] === '"') {
              field += '"'
              index += 1
            } else {
              quoted = false
            }
          } else {
            field += character
          }
        } else if (character === '"' && field === '') {
          quoted = true
        } else if (character === delimiter) {
          row.push(field)
          field = ''
        } else if (character === '\n' || character === '\r') {
          if (character === '\r' && text[index + 1] === '\n') index += 1
          row.push(field)
          rows.push(row)
          row = []
          field = ''
        } else {
          field += character
        }
      }
      if (field !== '' || row.length > 0) {
        row.push(field)
        rows.push(row)
      }
      return rows.filter(cells => cells.some(cell => cell.trim() !== ''))
    }

    /**
     * Column names from this panel's own CSV, Goodreads' export, and Douban
     * exports (豆伴 / doulist tools), lower-cased.
     */
    const CSV_COLUMNS = {
      title: ['title', '书名', '書名', '标题', '標題', '名称', 'book title', 'name'],
      author: ['author', 'authors', '作者', '著者'],
      status: ['status', 'exclusive shelf', 'my status', 'shelf', '状态', '狀態', '阅读状态'],
      rating: ['rating', 'my rating', '我的评分', '评分', '評分', '星级'],
      tags: ['tags', 'bookshelves', '标签', '我的标签', '標籤'],
      note: ['note', 'notes', 'my review', 'review', 'private notes', '笔记', '读书笔记', '短评', '我的短评', '评论', '評論'],
      started: ['started', 'date started', '开始日期', '开始阅读'],
      finished: ['finished', 'date read', '读完日期', '完成日期', '读过日期'],
      added: ['added', 'date added', '标记时间', '標記時間', '标记日期', '加入日期', '添加日期'],
      pages: ['pages', 'number of pages', '页数', '頁數'],
      currentPage: ['current page', '当前页'],
      progress: ['progress', '进度'],
      isbn: ['isbn13', 'isbn', 'isbn-13'],
      publisher: ['publisher', '出版社'],
      published: ['published', 'year published', 'original publication year', '出版年', '出版日期'],
      excerpts: ['excerpts', '摘录'],
    }

    function csvColumns(header) {
      const names = header.map(cell => cell.replace(/^﻿/, '').trim().toLowerCase())
      const columns = {}
      for (const [field, aliases] of Object.entries(CSV_COLUMNS)) {
        for (const alias of aliases) {
          const index = names.indexOf(alias)
          if (index !== -1) {
            columns[field] = index
            break
          }
        }
      }
      return columns
    }

    const STATUS_WORDS = {
      want: ['want', 'to-read', 'to read', 'wish', '想读', '想讀', '想看'],
      reading: ['reading', 'currently-reading', 'currently reading', 'do', '在读', '在讀', '正在读'],
      read: ['read', 'finished', 'collect', 'done', '读过', '讀過', '已读', '已讀', '看过'],
    }

    function csvStatus(value) {
      const key = String(value || '').trim().toLowerCase()
      for (const [status, words] of Object.entries(STATUS_WORDS)) {
        if (words.includes(key)) return status
      }
      return ''
    }

    const RATING_WORDS = { 力荐: 5, 推荐: 4, 还行: 3, 較差: 2, 较差: 2, 很差: 1 }

    function csvRating(value) {
      const text = String(value || '').trim()
      if (text === '') return 0
      if (Object.hasOwn(RATING_WORDS, text)) return RATING_WORDS[text]
      const stars = (text.match(/★/g) || []).length
      if (stars > 0) return Math.min(5, stars)
      const number = Number.parseFloat(text)
      if (!Number.isFinite(number)) return 0
      // Douban's numeric scale is out of 10 in some exports.
      return clampNumber(number > 5 ? number / 2 : number, 0, 5, 0)
    }

    /** `2024-03-02`, `2024/3/2 10:11`, `2024年3月2日`, `2024-03`, or a bare year, to local noon. */
    function csvDate(value) {
      const text = String(value || '').trim()
      const match = /^(\d{4})(?:[-/.年](\d{1,2}))?(?:[-/.月](\d{1,2}))?/.exec(text)
      if (!match) return 0
      const year = Number(match[1])
      if (year < 1900 || year > 9999) return 0
      const ms = new Date(year, Number(match[2] || 1) - 1, Number(match[3] || 1), 12).getTime()
      return Number.isFinite(ms) ? ms : 0
    }

    /** Structured rows when the first row is a header naming a title column, else `null`. */
    function parseCsvImport(text) {
      const firstLine = text.split(/\r?\n/, 1)[0]
      const delimiter = firstLine.includes('\t') ? '\t' : firstLine.includes(',') ? ',' : ''
      if (delimiter === '') return null
      const rows = parseCsv(text, delimiter)
      if (rows.length < 2) return null
      const columns = csvColumns(rows[0])
      if (columns.title === undefined) return null
      const cell = (row, field) => (columns[field] === undefined ? '' : String(row[columns[field]] || '').trim())
      const items = []
      for (const row of rows.slice(1)) {
        const title = cell(row, 'title')
        if (title === '') continue
        const status = csvStatus(cell(row, 'status'))
        const added = csvDate(cell(row, 'added'))
        let finished = csvDate(cell(row, 'finished'))
        // Douban only records when a book was marked; for 读过 that is the finish day.
        if (status === 'read' && finished === 0 && columns.finished === undefined) finished = added
        let started = csvDate(cell(row, 'started'))
        if (status === 'reading' && started === 0 && columns.started === undefined) started = added
        const shelfWords = new Set(Object.values(STATUS_WORDS).flat())
        const tags = cell(row, 'tags')
          .split(/[,，、;；\s]+/)
          .filter(tag => tag !== '' && !shelfWords.has(tag.toLowerCase()))
        let excerpts = []
        const rawExcerpts = cell(row, 'excerpts')
        if (rawExcerpts !== '') {
          try {
            const parsed = JSON.parse(rawExcerpts)
            if (Array.isArray(parsed)) excerpts = parsed
          } catch {
            excerpts = rawExcerpts.split(/\n{2,}/).map(text => ({ text }))
          }
        }
        items.push({
          title,
          author: cell(row, 'author'),
          ...(status !== '' ? { status } : {}),
          rating: csvRating(cell(row, 'rating')),
          tags,
          note: cell(row, 'note').replace(/<br\s*\/?>/gi, '\n'),
          startedAt: started,
          finishedAt: finished,
          ...(added > 0 ? { addedAt: added } : {}),
          pages: clampNumber(cell(row, 'pages'), 0, 20000, 0),
          currentPage: clampNumber(cell(row, 'currentPage'), 0, 20000, 0),
          progress: clampNumber(cell(row, 'progress').replace('%', ''), 0, 100, 0),
          isbn: cell(row, 'isbn').replace(/[^0-9Xx]/g, ''),
          publisher: cell(row, 'publisher'),
          published: cell(row, 'published'),
          excerpts,
        })
      }
      return items
    }

    /* ── export ────────────────────────────────────────────────────────── */

    const CSV_EXPORT_FIELDS = [
      ['Title', book => book.title],
      ['Author', book => book.author],
      ['Status', book => book.status],
      ['Rating', book => (book.rating > 0 ? book.rating : '')],
      ['Progress', book => book.progress],
      ['Current Page', book => book.currentPage || ''],
      ['Pages', book => book.pages || ''],
      ['Tags', book => book.tags.join(', ')],
      ['Started', book => toDateInput(book.startedAt)],
      ['Finished', book => toDateInput(book.finishedAt)],
      ['Added', book => toDateInput(book.addedAt)],
      ['Note', book => book.note],
      ['Excerpts', book => (book.excerpts.length > 0 ? JSON.stringify(book.excerpts.map(({ text, page, note }) => ({ text, page, note }))) : '')],
      ['Publisher', book => book.publisher],
      ['Published', book => book.published],
      ['ISBN', book => book.isbn],
    ]

    function csvCell(value) {
      const text = String(value === undefined || value === null ? '' : value)
      return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
    }

    function exportCsv(books) {
      const lines = [CSV_EXPORT_FIELDS.map(([name]) => name).join(',')]
      for (const book of books) lines.push(CSV_EXPORT_FIELDS.map(([, read]) => csvCell(read(book))).join(','))
      // The BOM makes Excel read the file as UTF-8 so Chinese titles survive.
      return `﻿${lines.join('\r\n')}\r\n`
    }

    function exportJson(books) {
      return `${JSON.stringify({ app: 'dsh-bookshelf', version: HOST_STORE_VERSION, exportedAt: new Date().toISOString(), books }, null, 2)}\n`
    }

    function exportMarkdown(books, tt) {
      const out = [`# ${tt('panel.title')}`, '']
      for (const status of STATUSES) {
        const shelf = sortColumn(books.filter(book => book.status === status), status === 'read' ? 'finished' : 'added')
        if (shelf.length === 0) continue
        out.push(`## ${tt(STATUS_META[status].label)} (${shelf.length})`, '')
        for (const book of shelf) {
          const bits = [`**${book.title}**`]
          if (book.author) bits.push(book.author)
          if (book.rating > 0) bits.push('★'.repeat(book.rating))
          if (status === 'reading') bits.push(`${book.progress}%`)
          if (book.finishedAt) bits.push(toDateInput(book.finishedAt))
          if (book.tags.length > 0) bits.push(book.tags.map(tag => `#${tag}`).join(' '))
          out.push(`- ${bits.join(' · ')}`)
          if (book.note) out.push(`  - ${book.note.replace(/\n+/g, ' ')}`)
          for (const excerpt of book.excerpts) {
            out.push(`  > ${excerpt.text.replace(/\n+/g, ' ')}${excerpt.page > 0 ? ` (p.${excerpt.page})` : ''}`)
          }
        }
        out.push('')
      }
      return `${out.join('\n').trim()}\n`
    }

    function downloadText(fileName, mime, content) {
      const blob = new Blob([content], { type: mime })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      link.rel = 'noopener'
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }

    function parseImport(text, fileName) {
      const trimmed = text.replace(/^﻿/, '').trim()
      if (trimmed === '') return []
      if (/^[[{]/.test(trimmed)) {
        try {
          const data = JSON.parse(trimmed)
          const list = Array.isArray(data) ? data : Array.isArray(data.books) ? data.books : []
          return list
            .map(item => (typeof item === 'string' ? { title: item } : item))
            .filter(item => item !== null && typeof item === 'object' && typeof item.title === 'string')
            .map(item => ({ ...item, title: item.title.trim(), author: typeof item.author === 'string' ? item.author : '' }))
            .filter(item => item.title !== '')
        } catch {}
      }
      const structured = parseCsvImport(trimmed)
      if (structured !== null) return structured
      const csv = /\.csv$/i.test(fileName || '')
      return trimmed.split(/\r?\n/).map(line => parseImportLine(line, csv)).filter(Boolean)
    }

    /* ── display helpers ───────────────────────────────────────────────── */

    function coverStyle(title) {
      let hash = 7
      for (const character of title) {
        hash = (hash * 31 + (character.codePointAt(0) || 0)) >>> 0
      }
      const [background, ink] = COVER_PALETTE[hash % COVER_PALETTE.length]
      return { '--bs-cover-bg': background, '--bs-cover-ink': ink }
    }

    function coverLetter(title) {
      const cleaned = title.replace(/^[《「『"]+|[》」』"]+$/g, '').trim()
      const first = Array.from(cleaned)[0]
      return first === undefined ? '·' : first.toUpperCase()
    }

    function formatDay(ms, activeLocale) {
      const date = new Date(ms)
      const options = date.getFullYear() === new Date().getFullYear()
        ? { month: 'short', day: 'numeric' }
        : { year: 'numeric', month: 'short', day: 'numeric' }
      try {
        return new Intl.DateTimeFormat(activeLocale || undefined, options).format(date)
      } catch {
        return date.toLocaleDateString()
      }
    }

    /** The most telling date for a card: finished, then started, then added. */
    function formatAdded(book, activeLocale, tt) {
      if (book.status === 'read' && book.finishedAt) return tt('book.finished', { date: formatDay(book.finishedAt, activeLocale) })
      if (book.status === 'reading' && book.startedAt) return tt('book.started', { date: formatDay(book.startedAt, activeLocale) })
      return tt('book.added', { date: formatDay(book.addedAt, activeLocale) })
    }

    /** `<input type=date>` value (local calendar day) to and from a timestamp at local noon. */
    function toDateInput(ms) {
      if (!ms) return ''
      const date = new Date(ms)
      const pad = value => String(value).padStart(2, '0')
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    }

    function fromDateInput(value) {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '')
      if (!match) return 0
      const ms = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12).getTime()
      return Number.isFinite(ms) ? ms : 0
    }

    function sortColumn(books, sortBy, activeLocale) {
      const copy = books.slice()
      if (sortBy === 'title') {
        copy.sort((left, right) => left.title.localeCompare(right.title, activeLocale))
      } else if (sortBy === 'author') {
        copy.sort((left, right) => {
          const byAuthor = (left.author || '').localeCompare(right.author || '', activeLocale)
          return byAuthor !== 0 ? byAuthor : left.title.localeCompare(right.title, activeLocale)
        })
      } else if (sortBy === 'finished') {
        // Dated books first, newest first; undated ones keep the added order below them.
        const day = book => book.finishedAt || book.startedAt
        copy.sort((left, right) => day(right) - day(left) || right.addedAt - left.addedAt)
      } else if (sortBy === 'rating') {
        copy.sort((left, right) => right.rating - left.rating || right.addedAt - left.addedAt)
      } else {
        copy.sort((left, right) => right.addedAt - left.addedAt)
      }
      return copy
    }

    /* ── controls ──────────────────────────────────────────────────────── */

    /** Catalog cover when one loads; the generated letter cover underneath doubles as its fallback. */
    function BookCover({ title, cover, className }) {
      const [failed, setFailed] = React.useState(false)
      React.useEffect(() => setFailed(false), [cover])
      const showImage = cover !== '' && !failed
      return h(
        'div',
        {
          className: `bs-cover${className ? ` ${className}` : ''}${showImage ? ' has-image' : ''}`,
          style: coverStyle(title || '·'),
          'aria-hidden': true,
        },
        h('span', { className: 'bs-cover-letter' }, coverLetter(title || '·')),
        showImage &&
          h('img', {
            className: 'bs-cover-img',
            src: cover,
            alt: '',
            loading: 'lazy',
            decoding: 'async',
            draggable: false,
            referrerPolicy: 'no-referrer',
            onError: () => setFailed(true),
          }),
      )
    }

    function metaLine(book, tt) {
      const parts = []
      if (book.published !== '') parts.push(book.published)
      if (book.publisher !== '') parts.push(book.publisher)
      if (book.pages > 0) parts.push(tt('book.pages', { count: book.pages }))
      return parts.join(' · ')
    }

    function BookCard({ book, tt, activeLocale, onEdit, onStatus, onTag, syncing }) {
      const progress = clampNumber(book.progress, 0, 100, 0)
      const statusLabel = tt(STATUS_META[book.status].label)
      const details = metaLine(book, tt)
      return h(
        'article',
        {
          className: syncing ? 'bs-card is-syncing' : 'bs-card',
          'data-status': book.status,
        },
        h(
          'div',
          { className: 'bs-card-top' },
          h(
            'button',
            {
              type: 'button',
              className: 'bs-cover-button',
              onClick: () => onEdit(book),
              tabIndex: -1,
              'aria-hidden': true,
            },
            h(BookCover, { title: book.title, cover: book.cover }),
            syncing && h('span', { className: 'bs-cover-busy' }, h(SpinnerIcon, { size: 16 })),
          ),
          h(
            'div',
            { className: 'bs-book-info' },
            h('h3', { className: 'bs-book-title', title: book.title }, book.title),
            h('p', { className: 'bs-book-author', title: book.author || undefined },
              book.author || tt('book.unknownAuthor')),
            details !== '' && h('p', { className: 'bs-book-meta', title: details }, details),
            details === '' && book.metaStatus === 'miss' &&
              h('p', { className: 'bs-book-meta is-missing' }, tt('book.noInfo')),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'bs-edit',
              onClick: () => onEdit(book),
              'aria-label': tt('book.edit', { title: book.title }),
              title: tt('book.edit', { title: book.title }),
            },
            h(PencilIcon, { size: 14 }),
          ),
        ),
        book.status === 'reading' &&
          h(
            'div',
            { className: 'bs-progress' },
            h(
              'div',
              { className: 'bs-progress-meta' },
              h('span', null, book.pages > 0 && book.currentPage > 0
                ? tt('book.pageOf', { page: book.currentPage, pages: book.pages })
                : tt('book.progress')),
              h('span', null, `${progress}%`),
            ),
            h(
              'div',
              {
                className: 'bs-track',
                role: 'progressbar',
                'aria-label': tt('book.progress'),
                'aria-valuemin': 0,
                'aria-valuemax': 100,
                'aria-valuenow': progress,
              },
              h('span', { className: 'bs-fill', style: { width: `${progress}%` } }),
            ),
          ),
        book.status === 'read' &&
          book.rating > 0 &&
          h(
            'div',
            {
              className: 'bs-rating',
              role: 'img',
              'aria-label': tt('book.ratingValue', { value: book.rating }),
            },
            [1, 2, 3, 4, 5].map(star =>
              h(
                'span',
                {
                  key: star,
                  className: star <= book.rating ? 'bs-star is-on' : 'bs-star is-off',
                  'aria-hidden': true,
                },
                star <= book.rating ? '★' : '☆',
              ),
            ),
          ),
        book.note !== ''
          ? h('p', { className: 'bs-note', title: book.note }, `“${book.note}”`)
          : book.description !== '' &&
            h('p', { className: 'bs-desc', title: book.description }, book.description),
        (book.tags.length > 0 || book.excerpts.length > 0) &&
          h(
            'div',
            { className: 'bs-tags' },
            book.tags.map(tag =>
              h(
                'button',
                {
                  key: tag,
                  type: 'button',
                  className: 'bs-tag',
                  onClick: () => onTag(tag),
                  title: tt('book.filterTag', { tag }),
                },
                `#${tag}`,
              ),
            ),
            book.excerpts.length > 0 &&
              h(
                'button',
                { type: 'button', className: 'bs-tag is-excerpts', onClick: () => onEdit(book) },
                tt('book.excerpts', { count: book.excerpts.length }),
              ),
          ),
        h(
          'div',
          { className: 'bs-card-foot' },
          h(
            'span',
            { className: 'bs-select-wrap' },
            h(
              'select',
              {
                className: 'bs-status-select',
                value: book.status,
                onChange: event => onStatus(book.id, event.target.value),
                'aria-label': tt('book.statusFor', { title: book.title }),
                title: statusLabel,
              },
              STATUSES.map(status =>
                h('option', { key: status, value: status }, tt(STATUS_META[status].label)),
              ),
            ),
          ),
          h('span', { className: 'bs-date' }, formatAdded(book, activeLocale, tt)),
        ),
      )
    }

    function EmptyShelf({ tt, onAdd }) {
      return h(
        'div',
        { className: 'bs-empty' },
        h('span', { className: 'bs-empty-icon', 'aria-hidden': true }, h(ShelfMark, { size: 28 })),
        h('p', { className: 'bs-empty-title' }, tt('book.empty')),
        h('p', { className: 'bs-empty-hint' }, tt('book.emptyHint')),
        h(
          'button',
          { type: 'button', className: 'bs-empty-action', onClick: onAdd },
          tt('book.addFirst'),
        ),
      )
    }

    function ShelfColumn({ status, books, tt, activeLocale, onAdd, onEdit, onStatus, onTag, syncingIds }) {
      const meta = STATUS_META[status]
      const label = tt(meta.label)
      return h(
        'section',
        {
          className: 'bs-column',
          'data-status': status,
          'aria-labelledby': `bs-column-${status}`,
        },
        h(
          'div',
          { className: 'bs-col-head' },
          h(
            'div',
            { className: 'bs-col-title-row' },
            h('span', { className: 'bs-col-icon', 'aria-hidden': true },
              h(StatusIcon, { status, size: 14 })),
            h('h2', { className: 'bs-col-title', id: `bs-column-${status}` }, label),
            h('span', { className: 'bs-col-count' }, String(books.length)),
            h(
              'button',
              {
                type: 'button',
                className: 'bs-col-add',
                onClick: () => onAdd(status),
                'aria-label': tt('action.addTo', { status: label }),
                title: tt('action.addTo', { status: label }),
              },
              h(PlusIcon, { size: 13 }),
            ),
          ),
          h('p', { className: 'bs-col-hint' }, tt(meta.hint)),
        ),
        h(
          'div',
          { className: 'bs-col-body' },
          books.length === 0
            ? h(EmptyShelf, { tt, onAdd: () => onAdd(status) })
            : books.map(book =>
                h(BookCard, {
                  key: book.id,
                  book,
                  tt,
                  activeLocale,
                  onEdit,
                  onStatus,
                  onTag,
                  syncing: syncingIds.has(book.id),
                }),
              ),
        ),
      )
    }

    function StarPicker({ rating, tt, onChange }) {
      return h(
        'div',
        { className: 'bs-rating-picker' },
        h(
          'div',
          { className: 'bs-stars', role: 'radiogroup', 'aria-label': tt('field.rating') },
          [1, 2, 3, 4, 5].map(star =>
            h(
              'button',
              {
                key: star,
                type: 'button',
                role: 'radio',
                'aria-checked': rating === star,
                'aria-label': tt('book.ratingValue', { value: star }),
                className: star <= rating ? 'bs-star-button is-on' : 'bs-star-button',
                onClick: () => onChange(rating === star ? 0 : star),
              },
              rating >= star ? '★' : '☆',
            ),
          ),
        ),
        rating > 0 &&
          h(
            'button',
            { type: 'button', className: 'bs-clear-rating', onClick: () => onChange(0) },
            tt('action.clearRating'),
          ),
      )
    }

    /** Focus trap + Escape for a modal layer; restores focus to the opener on close. */
    function useModal(layerRef, initialFocusRef, onClose) {
      React.useEffect(() => {
        const layer = layerRef.current
        const previous = typeof document !== 'undefined' ? document.activeElement : null
        if (initialFocusRef.current !== null) initialFocusRef.current.focus()

        function focusables() {
          if (layer === null) return []
          return Array.from(
            layer.querySelectorAll(
              'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
            ),
          ).filter(element => element.offsetParent !== null)
        }

        function onKeyDown(event) {
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            onClose()
            return
          }
          if (event.key !== 'Tab') return
          const items = focusables()
          if (items.length === 0) return
          const first = items[0]
          const last = items[items.length - 1]
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault()
            last.focus()
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first.focus()
          }
        }

        document.addEventListener('keydown', onKeyDown, true)
        return () => {
          document.removeEventListener('keydown', onKeyDown, true)
          if (previous !== null && typeof previous.focus === 'function') previous.focus()
        }
      }, [onClose])
    }

    function DialogShell({ layerRef, eyebrow, title, tt, onClose, wide, children }) {
      return h(
        'div',
        {
          className: 'bs-scrim',
          onMouseDown: event => {
            if (event.target === event.currentTarget) onClose()
          },
        },
        h(
          'div',
          {
            className: wide ? 'bs-dialog is-wide' : 'bs-dialog',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-labelledby': 'bs-dialog-title',
            ref: layerRef,
          },
          h(
            'div',
            { className: 'bs-dialog-head' },
            h(
              'div',
              { className: 'bs-dialog-heading' },
              h('p', { className: 'bs-dialog-eyebrow' }, eyebrow),
              h('h2', { className: 'bs-dialog-title', id: 'bs-dialog-title' }, title),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'bs-icon-button',
                onClick: onClose,
                'aria-label': tt('action.close'),
                title: tt('action.close'),
              },
              h(CloseIcon, { size: 16 }),
            ),
          ),
          children,
        ),
      )
    }

    function BookDialog({ mode, initialStatus, book, tt, onClose, onSubmit, onDelete }) {
      const editing = mode === 'edit'
      const [title, setTitle] = React.useState(editing ? book.title : '')
      const [author, setAuthor] = React.useState(editing ? book.author : '')
      const [status, setStatus] = React.useState(editing ? book.status : initialStatus)
      const [progress, setProgress] = React.useState(editing ? book.progress : 0)
      const [rating, setRating] = React.useState(editing ? book.rating : 0)
      const [note, setNote] = React.useState(editing ? book.note : '')
      const [cover, setCover] = React.useState(editing ? book.cover : '')
      const [description, setDescription] = React.useState(editing ? book.description : '')
      const [pages, setPages] = React.useState(editing && book.pages > 0 ? String(book.pages) : '')
      const [currentPage, setCurrentPage] = React.useState(editing && book.currentPage > 0 ? String(book.currentPage) : '')
      const [started, setStarted] = React.useState(() => toDateInput(editing ? book.startedAt
        : initialStatus === 'reading' ? Date.now() : 0))
      const [finished, setFinished] = React.useState(() => toDateInput(editing ? book.finishedAt
        : initialStatus === 'read' ? Date.now() : 0))
      const [tagsText, setTagsText] = React.useState(editing ? book.tags.join(', ') : '')
      const [excerpts, setExcerpts] = React.useState(editing ? book.excerpts : [])
      const [draft, setDraft] = React.useState({ text: '', page: '', note: '' })
      const [catalog, setCatalog] = React.useState(() => ({
        publisher: editing ? book.publisher : '',
        published: editing ? book.published : '',
        isbn: editing ? book.isbn : '',
        metaStatus: editing ? book.metaStatus : '',
      }))
      const pageCount = clampNumber(pages, 0, 20000, 0)
      const pageNow = clampNumber(currentPage, 0, 20000, 0)
      const pagedProgress = pageCount > 0 && pageNow > 0

      /** Picking a status fills the date a reader would expect, and clears dates that no longer apply. */
      function selectStatus(value) {
        setStatus(value)
        const today = toDateInput(Date.now())
        if (value === 'reading') {
          if (started === '') setStarted(today)
          setFinished('')
        } else if (value === 'read') {
          if (finished === '') setFinished(today)
        } else {
          setStarted('')
          setFinished('')
        }
      }

      function draftExcerpt() {
        const text = draft.text.trim()
        if (text === '') return null
        return {
          id: newExcerptId(),
          text: text.slice(0, 2000),
          page: clampNumber(draft.page, 0, 20000, 0),
          note: draft.note.trim().slice(0, 600),
          createdAt: Date.now(),
        }
      }

      function addExcerpt() {
        const excerpt = draftExcerpt()
        if (excerpt === null || excerpts.length >= MAX_EXCERPTS) return
        setExcerpts(current => [...current, excerpt])
        setDraft({ text: '', page: '', note: '' })
      }
      const [lookup, setLookup] = React.useState({ state: 'idle', message: '' })
      const [error, setError] = React.useState('')
      const [confirmDelete, setConfirmDelete] = React.useState(false)
      const layerRef = React.useRef(null)
      const titleRef = React.useRef(null)
      const lookupAbort = React.useRef(null)

      useModal(layerRef, titleRef, onClose)
      React.useEffect(() => () => {
        if (lookupAbort.current !== null) lookupAbort.current.abort()
      }, [])

      async function fetchInfo() {
        const cleanTitle = title.trim()
        if (cleanTitle === '') {
          setLookup({ state: 'error', message: tt('lookup.needTitle') })
          if (titleRef.current !== null) titleRef.current.focus()
          return
        }
        if (lookupAbort.current !== null) lookupAbort.current.abort()
        const controller = new AbortController()
        lookupAbort.current = controller
        setLookup({ state: 'busy', message: '' })
        try {
          const meta = await lookupBook({ title: cleanTitle, author: author.trim() }, controller.signal)
          if (controller.signal.aborted) return
          if (meta === null) {
            setCatalog(current => ({ ...current, metaStatus: current.metaStatus || 'miss' }))
            setLookup({ state: 'miss', message: tt('lookup.missed') })
            return
          }
          if (author.trim() === '' && meta.author !== '') setAuthor(meta.author)
          if (meta.cover !== '') setCover(meta.cover)
          if (meta.description !== '') setDescription(meta.description)
          setCatalog(current => ({
            publisher: meta.publisher || current.publisher,
            published: meta.published || current.published,
            isbn: meta.isbn || current.isbn,
            metaStatus: 'ok',
          }))
          if (meta.pages > 0 && pages.trim() === '') setPages(String(meta.pages))
          setLookup({ state: 'ok', message: tt('lookup.found', { source: meta.source }) })
        } catch {
          if (!controller.signal.aborted) setLookup({ state: 'error', message: tt('lookup.failed') })
        } finally {
          if (lookupAbort.current === controller) lookupAbort.current = null
        }
      }

      function submit(event) {
        event.preventDefault()
        const cleanTitle = title.trim()
        if (cleanTitle === '') {
          setError(tt('field.required'))
          if (titleRef.current !== null) titleRef.current.focus()
          return
        }
        // An excerpt typed but not yet added is still the user's intent.
        const pendingExcerpt = draftExcerpt()
        onSubmit({
          ...catalog,
          title: cleanTitle,
          author: author.trim(),
          status,
          pages: pageCount,
          currentPage: status === 'reading' ? Math.min(pageNow, pageCount || pageNow) : status === 'read' ? pageCount : 0,
          progress: status === 'read' ? 100 : status === 'reading' ? deriveProgress(status, progress, pageNow, pageCount) : 0,
          rating: status === 'read' ? rating : 0,
          startedAt: status === 'want' ? 0 : fromDateInput(started),
          finishedAt: status === 'read' ? fromDateInput(finished) || Date.now() : 0,
          note: note.trim(),
          tags: normalizeTags(tagsText),
          excerpts: pendingExcerpt !== null ? [...excerpts, pendingExcerpt] : excerpts,
          cover: safeImageUrl(cover),
          description: description.trim(),
        })
      }

      const busy = lookup.state === 'busy'
      return h(
        DialogShell,
        {
          layerRef,
          tt,
          onClose,
          eyebrow: tt(editing ? 'dialog.editEyebrow' : 'dialog.addEyebrow'),
          title: tt(editing ? 'dialog.editTitle' : 'dialog.addTitle'),
        },
        h(
          'form',
          { className: 'bs-form', onSubmit: submit, noValidate: true },
          h(
            'div',
            { className: 'bs-dialog-body' },
            h(
              'div',
              { className: 'bs-hero' },
              h(BookCover, { title: title.trim(), cover: safeImageUrl(cover), className: 'bs-cover-lg' }),
              h(
                'div',
                { className: 'bs-hero-fields' },
                h(
                  'div',
                  { className: 'bs-field' },
                  h('label', { className: 'bs-field-label', htmlFor: 'bs-field-title' },
                    tt('field.title')),
                  h('input', {
                    id: 'bs-field-title',
                    ref: titleRef,
                    className: 'bs-input',
                    value: title,
                    onChange: event => {
                      setTitle(event.target.value)
                      if (error !== '') setError('')
                    },
                    placeholder: tt('field.titlePlaceholder'),
                    'aria-invalid': error === '' ? undefined : true,
                    maxLength: 240,
                    autoComplete: 'off',
                  }),
                  error !== '' && h('p', { className: 'bs-form-error', role: 'alert' }, error),
                ),
                h(
                  'div',
                  { className: 'bs-field' },
                  h('label', { className: 'bs-field-label', htmlFor: 'bs-field-author' },
                    tt('field.author')),
                  h('input', {
                    id: 'bs-field-author',
                    className: 'bs-input',
                    value: author,
                    onChange: event => setAuthor(event.target.value),
                    placeholder: tt('field.authorPlaceholder'),
                    maxLength: 160,
                    autoComplete: 'off',
                  }),
                ),
                h(
                  'div',
                  { className: 'bs-lookup' },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'bs-btn bs-btn-soft',
                      onClick: fetchInfo,
                      disabled: busy,
                    },
                    busy ? h(SpinnerIcon, { size: 14 }) : h(SparkIcon, { size: 14 }),
                    h('span', null, tt(busy ? 'action.lookupBusy' : 'action.lookup')),
                  ),
                  lookup.message !== '' &&
                    h('p', { className: `bs-lookup-msg is-${lookup.state}`, role: 'status' }, lookup.message),
                ),
              ),
            ),
            h(
              'div',
              { className: 'bs-field' },
              h('span', { className: 'bs-field-label' }, tt('field.status')),
              h(
                'div',
                { className: 'bs-seg', role: 'group', 'aria-label': tt('field.status') },
                STATUSES.map(value =>
                  h(
                    'button',
                    {
                      key: value,
                      type: 'button',
                      className: 'bs-seg-button',
                      'aria-pressed': status === value,
                      onClick: () => selectStatus(value),
                    },
                    h(StatusIcon, { status: value, size: 13 }),
                    h('span', null, tt(STATUS_META[value].label)),
                  ),
                ),
              ),
            ),
            status === 'reading' &&
              h(
                'div',
                { className: 'bs-row' },
                h(
                  'div',
                  { className: 'bs-field' },
                  h('label', { className: 'bs-field-label', htmlFor: 'bs-field-page' }, tt('field.currentPage')),
                  h('input', {
                    id: 'bs-field-page',
                    className: 'bs-input',
                    type: 'number',
                    inputMode: 'numeric',
                    min: 0,
                    max: 20000,
                    value: currentPage,
                    onChange: event => setCurrentPage(event.target.value),
                  }),
                ),
                h(
                  'div',
                  { className: 'bs-field' },
                  h('label', { className: 'bs-field-label', htmlFor: 'bs-field-pages' }, tt('field.pages')),
                  h('input', {
                    id: 'bs-field-pages',
                    className: 'bs-input',
                    type: 'number',
                    inputMode: 'numeric',
                    min: 0,
                    max: 20000,
                    value: pages,
                    onChange: event => setPages(event.target.value),
                  }),
                ),
              ),
            status === 'reading' &&
              h(
                'div',
                { className: 'bs-field' },
                h(
                  'label',
                  { className: 'bs-field-label', htmlFor: 'bs-field-progress' },
                  tt('field.progress'),
                  h('span', { className: 'bs-field-value' },
                    `${pagedProgress ? deriveProgress('reading', progress, pageNow, pageCount) : progress}%`),
                ),
                h('input', {
                  id: 'bs-field-progress',
                  type: 'range',
                  className: 'bs-range',
                  min: 0,
                  max: 100,
                  step: 1,
                  value: pagedProgress ? deriveProgress('reading', progress, pageNow, pageCount) : progress,
                  disabled: pagedProgress,
                  onChange: event => setProgress(Number(event.target.value)),
                }),
                h('p', { className: 'bs-field-hint' }, tt('field.pagesHint')),
              ),
            status !== 'want' &&
              h(
                'div',
                { className: 'bs-row' },
                h(
                  'div',
                  { className: 'bs-field' },
                  h('label', { className: 'bs-field-label', htmlFor: 'bs-field-started' }, tt('field.started')),
                  h('input', {
                    id: 'bs-field-started',
                    className: 'bs-input',
                    type: 'date',
                    value: started,
                    max: status === 'read' && finished !== '' ? finished : undefined,
                    onChange: event => setStarted(event.target.value),
                  }),
                ),
                status === 'read' &&
                  h(
                    'div',
                    { className: 'bs-field' },
                    h('label', { className: 'bs-field-label', htmlFor: 'bs-field-finished' }, tt('field.finished')),
                    h('input', {
                      id: 'bs-field-finished',
                      className: 'bs-input',
                      type: 'date',
                      value: finished,
                      min: started !== '' ? started : undefined,
                      onChange: event => setFinished(event.target.value),
                    }),
                  ),
              ),
            status === 'read' &&
              h(
                'div',
                { className: 'bs-field' },
                h('span', { className: 'bs-field-label' }, tt('field.rating')),
                h(StarPicker, { rating, tt, onChange: setRating }),
              ),
            h(
              'div',
              { className: 'bs-field' },
              h('label', { className: 'bs-field-label', htmlFor: 'bs-field-description' },
                tt('field.description')),
              h('textarea', {
                id: 'bs-field-description',
                className: 'bs-textarea',
                value: description,
                onChange: event => setDescription(event.target.value),
                placeholder: tt('field.descriptionPlaceholder'),
                rows: 4,
                maxLength: 2000,
              }),
            ),
            h(
              'div',
              { className: 'bs-field' },
              h('label', { className: 'bs-field-label', htmlFor: 'bs-field-note' },
                tt('field.note')),
              h('textarea', {
                id: 'bs-field-note',
                className: 'bs-textarea',
                value: note,
                onChange: event => setNote(event.target.value),
                placeholder: tt('field.notePlaceholder'),
                rows: 3,
                maxLength: 4000,
              }),
            ),
            h(
              'div',
              { className: 'bs-field' },
              h('label', { className: 'bs-field-label', htmlFor: 'bs-field-tags' }, tt('field.tags')),
              h('input', {
                id: 'bs-field-tags',
                className: 'bs-input',
                value: tagsText,
                onChange: event => setTagsText(event.target.value),
                placeholder: tt('field.tagsPlaceholder'),
                maxLength: 400,
                autoComplete: 'off',
              }),
            ),
            h(
              'div',
              { className: 'bs-field' },
              h(
                'span',
                { className: 'bs-field-label' },
                tt('field.excerpts'),
                excerpts.length > 0 && h('span', { className: 'bs-field-value' }, String(excerpts.length)),
              ),
              excerpts.length > 0 &&
                h(
                  'ul',
                  { className: 'bs-excerpts' },
                  excerpts.map(excerpt =>
                    h(
                      'li',
                      { key: excerpt.id, className: 'bs-excerpt' },
                      h(
                        'div',
                        { className: 'bs-excerpt-body' },
                        h('p', { className: 'bs-excerpt-text' }, excerpt.text),
                        (excerpt.page > 0 || excerpt.note !== '') &&
                          h(
                            'p',
                            { className: 'bs-excerpt-meta' },
                            [excerpt.page > 0 ? `p.${excerpt.page}` : '', excerpt.note].filter(Boolean).join(' · '),
                          ),
                      ),
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'bs-icon-button bs-excerpt-remove',
                          onClick: () => setExcerpts(current => current.filter(item => item.id !== excerpt.id)),
                          'aria-label': tt('action.removeExcerpt'),
                          title: tt('action.removeExcerpt'),
                        },
                        h(TrashIcon, { size: 14 }),
                      ),
                    ),
                  ),
                ),
              h('textarea', {
                className: 'bs-textarea bs-excerpt-input',
                value: draft.text,
                onChange: event => setDraft(current => ({ ...current, text: event.target.value })),
                placeholder: tt('field.excerptPlaceholder'),
                'aria-label': tt('field.excerpts'),
                rows: 2,
                maxLength: 2000,
              }),
              h(
                'div',
                { className: 'bs-excerpt-add' },
                h('input', {
                  className: 'bs-input bs-excerpt-page',
                  type: 'number',
                  inputMode: 'numeric',
                  min: 0,
                  value: draft.page,
                  onChange: event => setDraft(current => ({ ...current, page: event.target.value })),
                  placeholder: tt('field.excerptPage'),
                  'aria-label': tt('field.excerptPage'),
                }),
                h('input', {
                  className: 'bs-input',
                  value: draft.note,
                  onChange: event => setDraft(current => ({ ...current, note: event.target.value })),
                  placeholder: tt('field.excerptNote'),
                  'aria-label': tt('field.excerptNote'),
                  maxLength: 600,
                }),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'bs-btn bs-btn-soft',
                    onClick: addExcerpt,
                    disabled: draft.text.trim() === '' || excerpts.length >= MAX_EXCERPTS,
                  },
                  h(PlusIcon, { size: 13 }),
                  h('span', null, tt('action.addExcerpt')),
                ),
              ),
            ),
            h(
              'div',
              { className: 'bs-field' },
              h('label', { className: 'bs-field-label', htmlFor: 'bs-field-cover' },
                tt('field.cover')),
              h('input', {
                id: 'bs-field-cover',
                className: 'bs-input',
                value: cover,
                onChange: event => setCover(event.target.value),
                placeholder: tt('field.coverPlaceholder'),
                maxLength: 600,
                autoComplete: 'off',
                spellCheck: false,
              }),
            ),
          ),
          h(
            'div',
            { className: 'bs-dialog-foot' },
            editing &&
              h(
                'button',
                {
                  type: 'button',
                  className: confirmDelete ? 'bs-btn bs-btn-danger-confirm' : 'bs-btn bs-btn-danger',
                  onClick: () => {
                    if (confirmDelete) {
                      onDelete()
                    } else {
                      setConfirmDelete(true)
                    }
                  },
                  title: confirmDelete ? tt('action.deleteHint') : undefined,
                },
                confirmDelete ? tt('action.deleteConfirm') : tt('action.delete'),
              ),
            h('span', { className: 'bs-foot-spacer' }),
            h(
              'button',
              { type: 'button', className: 'bs-btn bs-btn-secondary', onClick: onClose },
              tt('action.cancel'),
            ),
            h(
              'button',
              { type: 'submit', className: 'bs-btn bs-btn-primary' },
              tt(editing ? 'action.save' : 'action.create'),
            ),
          ),
        ),
      )
    }

    function ImportDialog({ books, tt, onClose, onImport }) {
      const [text, setText] = React.useState('')
      const [fileName, setFileName] = React.useState('')
      const [fileError, setFileError] = React.useState('')
      const [status, setStatus] = React.useState('want')
      const [autoFill, setAutoFill] = React.useState(true)
      const [dragging, setDragging] = React.useState(false)
      const layerRef = React.useRef(null)
      const textRef = React.useRef(null)
      const fileRef = React.useRef(null)

      useModal(layerRef, textRef, onClose)

      const parsed = React.useMemo(() => {
        const known = new Set(books.map(book => titleKey(book.title)))
        const fresh = []
        let duplicates = 0
        for (const item of parseImport(text, fileName)) {
          const key = titleKey(item.title)
          if (key === '' || known.has(key)) {
            duplicates += 1
            continue
          }
          known.add(key)
          fresh.push(item)
        }
        return { fresh, duplicates }
      }, [books, text, fileName])

      async function readFile(file) {
        if (!file) return
        try {
          const content = await file.text()
          setText(current => (current.trim() === '' ? content : `${current.replace(/\s+$/, '')}\n${content}`))
          setFileName(file.name)
          setFileError('')
        } catch {
          setFileError(tt('import.fileFailed'))
        }
      }

      function submit(event) {
        event.preventDefault()
        if (parsed.fresh.length === 0) return
        onImport(parsed.fresh, status, autoFill)
      }

      const preview = parsed.fresh.slice(0, 8)
      return h(
        DialogShell,
        {
          layerRef,
          tt,
          onClose,
          wide: true,
          eyebrow: tt('import.eyebrow'),
          title: tt('action.importTitle'),
        },
        h(
          'form',
          { className: 'bs-form', onSubmit: submit, noValidate: true },
          h(
            'div',
            { className: 'bs-dialog-body' },
            h('p', { className: 'bs-import-hint' }, tt('import.hint')),
            h(
              'div',
              {
                className: dragging ? 'bs-drop is-dragging' : 'bs-drop',
                onDragOver: event => {
                  event.preventDefault()
                  setDragging(true)
                },
                onDragLeave: () => setDragging(false),
                onDrop: event => {
                  event.preventDefault()
                  setDragging(false)
                  readFile(event.dataTransfer.files && event.dataTransfer.files[0])
                },
              },
              h('textarea', {
                ref: textRef,
                className: 'bs-textarea bs-import-text',
                value: text,
                onChange: event => setText(event.target.value),
                placeholder: tt('import.placeholder'),
                rows: 9,
                spellCheck: false,
                'aria-label': tt('action.importTitle'),
              }),
            ),
            h(
              'div',
              { className: 'bs-import-row' },
              h('input', {
                ref: fileRef,
                type: 'file',
                accept: '.txt,.csv,.tsv,.json,.md,text/plain,text/csv,text/tab-separated-values,application/json',
                hidden: true,
                onChange: event => {
                  readFile(event.target.files && event.target.files[0])
                  event.target.value = ''
                },
              }),
              h(
                'button',
                {
                  type: 'button',
                  className: 'bs-btn bs-btn-secondary',
                  onClick: () => fileRef.current !== null && fileRef.current.click(),
                },
                h(ImportIcon, { size: 14 }),
                h('span', null, tt('import.file')),
              ),
              fileName !== '' && h('span', { className: 'bs-import-file' }, fileName),
              fileError !== '' && h('span', { className: 'bs-form-error' }, fileError),
            ),
            h(
              'div',
              { className: 'bs-field' },
              h('span', { className: 'bs-field-label' }, tt('import.status')),
              h(
                'div',
                { className: 'bs-seg', role: 'group', 'aria-label': tt('import.status') },
                STATUSES.map(value =>
                  h(
                    'button',
                    {
                      key: value,
                      type: 'button',
                      className: 'bs-seg-button',
                      'aria-pressed': status === value,
                      onClick: () => setStatus(value),
                    },
                    h(StatusIcon, { status: value, size: 13 }),
                    h('span', null, tt(STATUS_META[value].label)),
                  ),
                ),
              ),
            ),
            h(
              'label',
              { className: 'bs-check' },
              h('input', {
                type: 'checkbox',
                checked: autoFill,
                onChange: event => setAutoFill(event.target.checked),
              }),
              h(SparkIcon, { size: 14 }),
              h('span', null, tt('import.autoFill')),
            ),
            h(
              'div',
              { className: 'bs-import-preview', 'aria-live': 'polite' },
              h(
                'p',
                { className: 'bs-import-count' },
                parsed.fresh.length > 0
                  ? tt('import.found', { count: parsed.fresh.length })
                  : tt('import.none'),
                parsed.duplicates > 0 &&
                  h('span', { className: 'bs-import-dup' },
                    tt('import.duplicates', { count: parsed.duplicates })),
              ),
              preview.length > 0 &&
                h(
                  'ul',
                  { className: 'bs-chips' },
                  preview.map((item, index) =>
                    h(
                      'li',
                      { key: `${index}-${item.title}`, className: 'bs-chip' },
                      h('strong', null, item.title),
                      item.author && h('span', null, item.author),
                    ),
                  ),
                  parsed.fresh.length > preview.length &&
                    h('li', { className: 'bs-chip is-more' }, `+${parsed.fresh.length - preview.length}`),
                ),
            ),
          ),
          h(
            'div',
            { className: 'bs-dialog-foot' },
            h('span', { className: 'bs-foot-spacer' }),
            h(
              'button',
              { type: 'button', className: 'bs-btn bs-btn-secondary', onClick: onClose },
              tt('action.cancel'),
            ),
            h(
              'button',
              {
                type: 'submit',
                className: 'bs-btn bs-btn-primary',
                disabled: parsed.fresh.length === 0,
              },
              tt('import.submit', { count: parsed.fresh.length }),
            ),
          ),
        ),
      )
    }

    function ExportDialog({ books, tt, onClose }) {
      const layerRef = React.useRef(null)
      const firstRef = React.useRef(null)
      useModal(layerRef, firstRef, onClose)
      const day = toDateInput(Date.now())
      const excerptCount = books.reduce((sum, book) => sum + book.excerpts.length, 0)
      const formats = [
        { id: 'json', label: 'export.json', run: () => downloadText(`bookshelf-${day}.json`, 'application/json', exportJson(books)) },
        { id: 'csv', label: 'export.csv', run: () => downloadText(`bookshelf-${day}.csv`, 'text/csv;charset=utf-8', exportCsv(books)) },
        { id: 'md', label: 'export.markdown', run: () => downloadText(`bookshelf-${day}.md`, 'text/markdown;charset=utf-8', exportMarkdown(books, tt)) },
      ]
      return h(
        DialogShell,
        { layerRef, tt, onClose, eyebrow: tt('export.eyebrow'), title: tt('action.exportTitle') },
        h(
          'div',
          { className: 'bs-dialog-body' },
          h('p', { className: 'bs-import-hint' }, tt('export.hint')),
          h('p', { className: 'bs-import-count' }, tt('export.count', { count: books.length, excerpts: excerptCount })),
          h(
            'div',
            { className: 'bs-export-grid' },
            formats.map((format, index) =>
              h(
                'button',
                {
                  key: format.id,
                  ref: index === 0 ? firstRef : undefined,
                  type: 'button',
                  className: 'bs-btn bs-btn-secondary bs-export-button',
                  onClick: format.run,
                  disabled: books.length === 0,
                },
                h(ExportIcon, { size: 14 }),
                h('span', null, tt(format.label)),
              ),
            ),
          ),
        ),
        h(
          'div',
          { className: 'bs-dialog-foot' },
          h('span', { className: 'bs-foot-spacer' }),
          h('button', { type: 'button', className: 'bs-btn bs-btn-secondary', onClick: onClose }, tt('action.close')),
        ),
      )
    }

    /** Reading statistics for one calendar year (local time); mirrors the Host's `bookshelf_stats`. */
    function yearStats(books, year) {
      const inYear = ms => ms > 0 && new Date(ms).getFullYear() === year
      const finished = books
        .filter(book => book.status === 'read' && inYear(book.finishedAt))
        .sort((left, right) => right.finishedAt - left.finishedAt)
      const rated = finished.filter(book => book.rating > 0)
      const byMonth = Array.from({ length: 12 }, () => 0)
      for (const book of finished) byMonth[new Date(book.finishedAt).getMonth()] += 1
      const tagCounts = new Map()
      for (const book of finished) for (const tag of book.tags) tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)
      const durations = finished
        .filter(book => book.startedAt > 0 && book.finishedAt >= book.startedAt)
        .map(book => Math.max(1, Math.round((book.finishedAt - book.startedAt) / DAY_MS)))
      return {
        finished,
        pages: finished.reduce((sum, book) => sum + book.pages, 0),
        averageRating: rated.length === 0 ? 0 : Math.round((rated.reduce((sum, book) => sum + book.rating, 0) / rated.length) * 10) / 10,
        averageDays: durations.length === 0 ? 0 : Math.round(durations.reduce((sum, days) => sum + days, 0) / durations.length),
        byMonth,
        topTags: [...tagCounts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 8),
      }
    }

    function StatsDialog({ books, tt, activeLocale, onClose, onOpenBook, onTag }) {
      const layerRef = React.useRef(null)
      const closeRef = React.useRef(null)
      const thisYear = new Date().getFullYear()
      const [year, setYear] = React.useState(thisYear)
      useModal(layerRef, closeRef, onClose)
      const stats = React.useMemo(() => yearStats(books, year), [books, year])
      const peak = Math.max(1, ...stats.byMonth)
      const tiles = [
        { value: stats.finished.length, label: tt('stats.finished') },
        { value: stats.pages, label: tt('stats.pages') },
        { value: stats.averageRating || '–', label: tt('stats.avgRating') },
        { value: stats.averageDays || '–', label: tt('stats.avgDays') },
      ]
      return h(
        DialogShell,
        { layerRef, tt, onClose, wide: true, eyebrow: tt('stats.eyebrow'), title: tt('stats.title') },
        h(
          'div',
          { className: 'bs-dialog-body' },
          h(
            'div',
            { className: 'bs-year' },
            h('button', {
              ref: closeRef,
              type: 'button',
              className: 'bs-icon-button',
              onClick: () => setYear(value => value - 1),
              'aria-label': tt('stats.prev'),
              title: tt('stats.prev'),
            }, h(ChevronIcon, { size: 15 })),
            h('strong', { className: 'bs-year-label', 'aria-live': 'polite' }, String(year)),
            h('button', {
              type: 'button',
              className: 'bs-icon-button',
              onClick: () => setYear(value => value + 1),
              disabled: year >= thisYear,
              'aria-label': tt('stats.next'),
              title: tt('stats.next'),
            }, h(ChevronIcon, { size: 15, flip: true })),
          ),
          h(
            'div',
            { className: 'bs-stat-tiles' },
            tiles.map(tile => h('div', { key: tile.label, className: 'bs-stat-tile' },
              h('strong', null, String(tile.value)), h('span', null, tile.label))),
          ),
          stats.finished.length === 0
            ? h('p', { className: 'bs-import-hint' }, tt('stats.empty'))
            : [
                h('div', { key: 'months', className: 'bs-field' },
                  h('span', { className: 'bs-field-label' }, tt('stats.byMonth')),
                  h(
                    'div',
                    { className: 'bs-months', role: 'list' },
                    stats.byMonth.map((count, index) =>
                      h(
                        'div',
                        {
                          key: index,
                          className: 'bs-month',
                          role: 'listitem',
                          title: `${tt('stats.month', { month: index + 1 })}: ${count}`,
                          'aria-label': `${tt('stats.month', { month: index + 1 })}: ${count}`,
                        },
                        h('span', { className: 'bs-month-count' }, count > 0 ? String(count) : ''),
                        h('span', { className: 'bs-month-bar', style: { height: `${Math.round((count / peak) * 100)}%` } }),
                        h('span', { className: 'bs-month-label' }, String(index + 1)),
                      ),
                    ),
                  )),
                stats.topTags.length > 0 &&
                  h('div', { key: 'tags', className: 'bs-field' },
                    h('span', { className: 'bs-field-label' }, tt('stats.tags')),
                    h('div', { className: 'bs-tags' },
                      stats.topTags.map(([tag, count]) => h('button', {
                        key: tag,
                        type: 'button',
                        className: 'bs-tag',
                        onClick: () => onTag(tag),
                      }, `#${tag} · ${count}`)))),
                h('div', { key: 'list', className: 'bs-field' },
                  h('span', { className: 'bs-field-label' }, tt('stats.list')),
                  h(
                    'ul',
                    { className: 'bs-finished-list' },
                    stats.finished.map(book =>
                      h(
                        'li',
                        { key: book.id },
                        h(
                          'button',
                          { type: 'button', className: 'bs-finished-item', onClick: () => onOpenBook(book) },
                          h(BookCover, { title: book.title, cover: book.cover, className: 'bs-cover-sm' }),
                          h('span', { className: 'bs-finished-title' }, book.title,
                            book.author && h('small', null, book.author)),
                          book.rating > 0 && h('span', { className: 'bs-finished-rating' }, '★'.repeat(book.rating)),
                          h('span', { className: 'bs-date' }, formatDay(book.finishedAt, activeLocale)),
                        ),
                      ),
                    ),
                  )),
              ],
        ),
      )
    }

    /* ── list and cover-wall views ─────────────────────────────────────── */

    const VIEW_KEY = 'dsh-bookshelf:view'
    const VIEWS = ['board', 'list', 'grid']
    /** Rows rendered per step; more mount as the sentinel scrolls into view. */
    const RENDER_STEP = 120

    function loadView() {
      try {
        const value = typeof localStorage === 'undefined' ? null : localStorage.getItem(VIEW_KEY)
        return VIEWS.includes(value) ? value : 'board'
      } catch {
        return 'board'
      }
    }

    function BoardIcon({ size }) {
      return glyph(
        [
          h('rect', { key: 'a', x: 2.4, y: 2.8, width: 3.2, height: 10.4, rx: 1 }),
          h('rect', { key: 'b', x: 6.4, y: 2.8, width: 3.2, height: 7.2, rx: 1 }),
          h('rect', { key: 'c', x: 10.4, y: 2.8, width: 3.2, height: 8.8, rx: 1 }),
        ],
        size,
      )
    }

    function ListIcon({ size }) {
      return glyph(
        [
          h('path', { key: 'a', d: 'M5.6 4h8' }),
          h('path', { key: 'b', d: 'M5.6 8h8' }),
          h('path', { key: 'c', d: 'M5.6 12h8' }),
          h('circle', { key: 'd', cx: 2.8, cy: 4, r: 0.6 }),
          h('circle', { key: 'e', cx: 2.8, cy: 8, r: 0.6 }),
          h('circle', { key: 'f', cx: 2.8, cy: 12, r: 0.6 }),
        ],
        size,
      )
    }

    function GridIcon({ size }) {
      return glyph(
        [
          h('rect', { key: 'a', x: 2.4, y: 2.4, width: 4.6, height: 4.6, rx: 1 }),
          h('rect', { key: 'b', x: 9, y: 2.4, width: 4.6, height: 4.6, rx: 1 }),
          h('rect', { key: 'c', x: 2.4, y: 9, width: 4.6, height: 4.6, rx: 1 }),
          h('rect', { key: 'd', x: 9, y: 9, width: 4.6, height: 4.6, rx: 1 }),
        ],
        size,
      )
    }

    const VIEW_META = {
      board: { label: 'view.board', icon: BoardIcon },
      list: { label: 'view.list', icon: ListIcon },
      grid: { label: 'view.grid', icon: GridIcon },
    }

    function ViewSwitch({ view, tt, onChange }) {
      return h(
        'div',
        { className: 'bs-view-switch', role: 'group', 'aria-label': tt('view.label') },
        VIEWS.map(id =>
          h(
            'button',
            {
              key: id,
              type: 'button',
              className: 'bs-view-button',
              'aria-pressed': view === id,
              onClick: () => onChange(id),
              title: tt(VIEW_META[id].label),
            },
            h(VIEW_META[id].icon, { size: 14 }),
            h('span', null, tt(VIEW_META[id].label)),
          ),
        ),
      )
    }

    /** Status tabs for the flat views; the trailing + adds into the selected status. */
    function StatusTabs({ filter, counts, tt, onChange, onAdd }) {
      const tabs = ['all', ...STATUSES]
      return h(
        'div',
        { className: 'bs-tabs', role: 'tablist', 'aria-label': tt('status.label') },
        tabs.map(id =>
          h(
            'button',
            {
              key: id,
              type: 'button',
              role: 'tab',
              className: 'bs-tab',
              'data-status': id,
              'aria-selected': filter === id,
              onClick: () => onChange(id),
            },
            id !== 'all' && h(StatusIcon, { status: id, size: 13 }),
            h('span', null, id === 'all' ? tt('view.all') : tt(STATUS_META[id].label)),
            h('span', { className: 'bs-col-count' }, String(counts[id])),
          ),
        ),
        h('span', { className: 'bs-tabs-spacer' }),
        h(
          'button',
          {
            type: 'button',
            className: 'bs-col-add',
            onClick: () => onAdd(filter === 'all' ? 'want' : filter),
            'aria-label': tt('action.addTo', { status: tt(STATUS_META[filter === 'all' ? 'want' : filter].label) }),
            title: tt('action.addTo', { status: tt(STATUS_META[filter === 'all' ? 'want' : filter].label) }),
          },
          h(PlusIcon, { size: 13 }),
        ),
      )
    }

    /** Mounts `items` in steps of RENDER_STEP as a sentinel at the end scrolls into view. */
    function useIncremental(items, resetKey) {
      const [limit, setLimit] = React.useState(RENDER_STEP)
      const sentinelRef = React.useRef(null)
      React.useEffect(() => setLimit(RENDER_STEP), [resetKey])
      React.useEffect(() => {
        const node = sentinelRef.current
        if (node === null || limit >= items.length || typeof IntersectionObserver === 'undefined') return undefined
        const observer = new IntersectionObserver(entries => {
          if (entries.some(entry => entry.isIntersecting)) setLimit(current => current + RENDER_STEP)
        }, { rootMargin: '400px' })
        observer.observe(node)
        return () => observer.disconnect()
      }, [limit, items.length])
      const more = items.length - limit
      return {
        shown: more > 0 ? items.slice(0, limit) : items,
        sentinel: more > 0 && h(
          'div',
          { ref: sentinelRef, className: 'bs-more' },
          h('button', { type: 'button', className: 'bs-empty-action', onClick: () => setLimit(current => current + RENDER_STEP) },
            `+${more}`),
        ),
      }
    }

    function RatingStars({ rating, tt }) {
      if (rating <= 0) return null
      return h(
        'span',
        { className: 'bs-mini-stars', role: 'img', 'aria-label': tt('book.ratingValue', { value: rating }) },
        '★'.repeat(rating),
        h('span', { className: 'is-off', 'aria-hidden': true }, '★'.repeat(5 - rating)),
      )
    }

    function ProgressCell({ book, tt }) {
      if (book.status !== 'reading') return null
      return h(
        'div',
        { className: 'bs-row-progress', title: tt('book.progress') },
        h('div', { className: 'bs-track' }, h('span', { className: 'bs-fill', style: { width: `${book.progress}%` } })),
        h('span', null, book.pages > 0 && book.currentPage > 0 ? `${book.currentPage}/${book.pages}` : `${book.progress}%`),
      )
    }

    function ListView({ books, tt, activeLocale, resetKey, onEdit, onStatus, onTag, syncingIds }) {
      const { shown, sentinel } = useIncremental(books, resetKey)
      return h(
        'div',
        { className: 'bs-list', role: 'list' },
        shown.map(book =>
          h(
            'div',
            {
              key: book.id,
              role: 'listitem',
              className: syncingIds.has(book.id) ? 'bs-list-row is-syncing' : 'bs-list-row',
              'data-status': book.status,
            },
            h(
              'button',
              { type: 'button', className: 'bs-cover-button', onClick: () => onEdit(book), tabIndex: -1, 'aria-hidden': true },
              h(BookCover, { title: book.title, cover: book.cover, className: 'bs-cover-sm' }),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'bs-list-main',
                onClick: () => onEdit(book),
                title: tt('book.edit', { title: book.title }),
              },
              h('span', { className: 'bs-list-title' }, book.title),
              h('span', { className: 'bs-list-author' }, book.author || tt('book.unknownAuthor')),
            ),
            h(
              'div',
              { className: 'bs-list-tags' },
              book.tags.slice(0, 3).map(tag =>
                h('button', { key: tag, type: 'button', className: 'bs-tag', onClick: () => onTag(tag), title: tt('book.filterTag', { tag }) }, `#${tag}`),
              ),
              book.excerpts.length > 0 &&
                h('span', { className: 'bs-tag is-excerpts', title: tt('book.excerpts', { count: book.excerpts.length }) },
                  `❝ ${book.excerpts.length}`),
            ),
            h('div', { className: 'bs-list-state' },
              h(ProgressCell, { book, tt }),
              book.status === 'read' && h(RatingStars, { rating: book.rating, tt })),
            h(
              'span',
              { className: 'bs-select-wrap' },
              h(
                'select',
                {
                  className: 'bs-status-select',
                  value: book.status,
                  onChange: event => onStatus(book.id, event.target.value),
                  'aria-label': tt('book.statusFor', { title: book.title }),
                },
                STATUSES.map(status => h('option', { key: status, value: status }, tt(STATUS_META[status].label))),
              ),
            ),
            h('span', { className: 'bs-date bs-list-date' }, formatAdded(book, activeLocale, tt)),
          ),
        ),
        sentinel,
      )
    }

    function GridView({ books, tt, resetKey, onEdit, syncingIds }) {
      const { shown, sentinel } = useIncremental(books, resetKey)
      return h(
        'div',
        { className: 'bs-grid', role: 'list' },
        shown.map(book =>
          h(
            'button',
            {
              key: book.id,
              type: 'button',
              role: 'listitem',
              className: syncingIds.has(book.id) ? 'bs-tile is-syncing' : 'bs-tile',
              'data-status': book.status,
              onClick: () => onEdit(book),
              title: book.author ? `${book.title} · ${book.author}` : book.title,
              'aria-label': tt('book.edit', { title: book.title }),
            },
            h(
              'span',
              { className: 'bs-tile-cover' },
              h(BookCover, { title: book.title, cover: book.cover, className: 'bs-cover-tile' }),
              h('span', { className: 'bs-tile-badge' }, h(StatusIcon, { status: book.status, size: 11 })),
              book.status === 'reading' &&
                h('span', { className: 'bs-tile-progress' }, h('span', { style: { width: `${book.progress}%` } })),
            ),
            h('span', { className: 'bs-tile-title' }, book.title),
            h('span', { className: 'bs-tile-sub' },
              book.status === 'read' && book.rating > 0 ? '★'.repeat(book.rating) : book.author || tt('book.unknownAuthor')),
          ),
        ),
        sentinel,
      )
    }

    /* ── page ──────────────────────────────────────────────────────────── */

    const CSS = `
.bs-page,.bs-page *{box-sizing:border-box}
.bs-page{--bs-gutter:clamp(18px,2.6vw,32px);position:relative;display:flex;flex-direction:column;width:100%;height:100%;min-height:0;overflow:hidden;padding-left:var(--dsh-frame-leading-clearance,0px);background:radial-gradient(120% 70% at 0% 0%,color-mix(in srgb,var(--dsw-alias-brand-primary) 8%,transparent),transparent 62%),var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:inherit}
.bs-head{display:flex;align-items:flex-start;gap:24px;flex:none;padding:26px var(--bs-gutter) 0}
.bs-heading{min-width:0;flex:1}
.bs-kicker{display:inline-flex;align-items:center;gap:7px;margin:0;color:var(--dsw-alias-label-secondary);font-size:10px;font-weight:650;letter-spacing:.16em;line-height:1.2;text-transform:uppercase;user-select:none}
.bs-kicker-mark{display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-brand-primary)}
.bs-title{margin:9px 0 5px;font-size:clamp(25px,2.9vw,33px);font-weight:750;letter-spacing:-.025em;line-height:1.12}
.bs-subtitle{max-width:52ch;margin:0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1.55}
.bs-stats{display:flex;align-items:stretch;flex:none;margin-top:6px;overflow:hidden;border:1px solid var(--dsw-alias-border-l1);border-radius:14px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 82%,transparent)}
.bs-stat{display:flex;flex-direction:column;justify-content:center;gap:3px;min-width:76px;padding:10px 16px;color:var(--dsw-alias-label-secondary);font-size:10.5px;white-space:nowrap}
.bs-stat+.bs-stat{border-left:1px solid var(--dsw-alias-border-l1)}
.bs-stat strong{color:var(--dsw-alias-label-primary);font-size:20px;font-variant-numeric:tabular-nums;font-weight:720;letter-spacing:-.02em;line-height:1}
.bs-stat[data-status="reading"] strong{color:var(--dsw-alias-brand-primary)}
.bs-stat[data-status="read"] strong{color:var(--dsw-alias-state-success-primary)}
.bs-tool:focus-visible,.bs-cover-button:focus-visible,.bs-check input:focus-visible,.bs-icon-button:focus-visible,.bs-col-add:focus-visible,.bs-edit:focus-visible,.bs-empty-action:focus-visible,.bs-btn:focus-visible,.bs-seg-button:focus-visible,.bs-star-button:focus-visible,.bs-clear-rating:focus-visible,.bs-search-clear:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.bs-toolbar{display:flex;align-items:center;gap:12px;flex:none;flex-wrap:wrap;padding:18px var(--bs-gutter) 0}
.bs-search{position:relative;display:flex;align-items:center;flex:1 1 280px;max-width:430px;min-width:200px}
.bs-search-icon{position:absolute;left:12px;display:inline-flex;color:var(--dsw-alias-label-secondary);pointer-events:none}
.bs-search-input{width:100%;height:38px;padding:0 38px 0 36px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;outline:none;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;transition:border-color .15s ease,box-shadow .15s ease}
.bs-search-input::placeholder{color:var(--dsw-alias-label-secondary);opacity:.7}
.bs-search-input:focus{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-brand-primary) 16%,transparent)}
.bs-search-input::-webkit-search-cancel-button{-webkit-appearance:none;appearance:none}
.bs-search-clear{position:absolute;right:5px;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:none;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.bs-search-clear:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.bs-sort{display:inline-flex;align-items:center;gap:8px;color:var(--dsw-alias-label-secondary);font-size:11.5px;white-space:nowrap}
.bs-sort-wrap{position:relative;display:inline-flex;align-items:center}
.bs-sort-wrap::after{content:"";position:absolute;right:10px;width:5px;height:5px;border-right:1.5px solid var(--dsw-alias-label-secondary);border-bottom:1.5px solid var(--dsw-alias-label-secondary);transform:rotate(45deg) translateY(-2px);pointer-events:none}
.bs-sort-select{height:34px;padding:0 28px 0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;outline:none;appearance:none;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer}
.bs-sort-select:focus-visible{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-brand-primary) 16%,transparent)}
.bs-toolbar-spacer{flex:1}
.bs-toolbar-meta{color:var(--dsw-alias-label-secondary);font-size:11.5px;font-variant-numeric:tabular-nums;white-space:nowrap}
.bs-storage{display:inline-flex;align-items:center;gap:6px;padding:5px 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:10.5px;white-space:nowrap}
.bs-storage-dot{flex:none;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-success-primary)}
.bs-storage.is-loading .bs-storage-dot,.bs-storage.is-saving .bs-storage-dot{background:var(--dsw-alias-brand-primary);animation:bs-pulse 1.2s ease-in-out infinite}
.bs-storage.is-offline{border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 48%,var(--dsw-alias-border-l1));color:var(--dsw-alias-state-warn-primary)}
.bs-storage.is-offline .bs-storage-dot{background:var(--dsw-alias-state-warn-primary)}
.bs-actions{display:flex;align-items:center;gap:8px;flex:none}
.bs-tool{position:relative;display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;font-weight:600;white-space:nowrap;cursor:pointer;transition:background .15s ease,border-color .15s ease}
.bs-tool:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}
.bs-tool:disabled{opacity:.6;cursor:default}
.bs-tool svg{color:var(--dsw-alias-brand-primary)}
.bs-badge{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base);font-size:10.5px;font-variant-numeric:tabular-nums;font-weight:700}
.bs-sync{display:flex;align-items:center;gap:12px;flex:none;margin:14px var(--bs-gutter) 0;padding:10px 12px 10px 14px;border:1px solid color-mix(in srgb,var(--dsw-alias-brand-primary) 35%,var(--dsw-alias-border-l1));border-radius:12px;background:color-mix(in srgb,var(--dsw-alias-brand-primary) 7%,var(--dsw-alias-bg-layer-1));animation:bs-in .2s ease}
.bs-sync.is-done{border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 40%,var(--dsw-alias-border-l1));background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 7%,var(--dsw-alias-bg-layer-1))}
.bs-sync.is-error{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 45%,var(--dsw-alias-border-l1));background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 6%,var(--dsw-alias-bg-layer-1))}
.bs-sync-icon{display:inline-flex;flex:none;color:var(--dsw-alias-brand-primary)}
.bs-sync.is-done .bs-sync-icon{color:var(--dsw-alias-state-success-primary)}
.bs-sync.is-error .bs-sync-icon{color:var(--dsw-alias-state-error-primary)}
.bs-sync-body{display:flex;flex-direction:column;gap:7px;flex:1;min-width:0}
.bs-sync-text{display:flex;align-items:baseline;gap:8px;flex:1;min-width:0;margin:0;font-size:12px;line-height:1.45}
.bs-sync-text strong{font-weight:650;font-variant-numeric:tabular-nums;white-space:nowrap}
.bs-sync-current{overflow:hidden;color:var(--dsw-alias-label-secondary);text-overflow:ellipsis;white-space:nowrap}
.bs-spin{animation:bs-spin .8s linear infinite}
@keyframes bs-spin{to{transform:rotate(360deg)}}
@keyframes bs-in{from{opacity:0;transform:translateY(-4px)}}
@keyframes bs-pulse{50%{opacity:.55}}
.bs-save-error{margin:10px var(--bs-gutter) 0;padding:8px 11px;border:1px solid color-mix(in srgb,var(--dsw-alias-state-warn-primary) 55%,transparent);border-radius:9px;color:var(--dsw-alias-state-warn-primary);font-size:11.5px;line-height:1.5}
.bs-view-switch{display:inline-flex;align-items:center;gap:2px;padding:2px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-1)}
.bs-view-button{display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 9px;border:none;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;white-space:nowrap;cursor:pointer}
.bs-view-button:hover{color:var(--dsw-alias-label-primary)}
.bs-view-button[aria-pressed="true"]{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-weight:650;box-shadow:0 1px 3px color-mix(in srgb,var(--dsw-alias-label-primary) 10%,transparent)}
.bs-view-button:focus-visible,.bs-tab:focus-visible,.bs-tile:focus-visible,.bs-list-main:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.bs-flat{display:flex;flex-direction:column;flex:1;min-height:0;margin:16px var(--bs-gutter) 22px;overflow:hidden;border:1px solid var(--dsw-alias-border-l1);border-radius:16px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 78%,transparent)}
.bs-tabs{display:flex;align-items:center;gap:4px;flex:none;padding:10px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);overflow-x:auto}
.bs-tabs-spacer{flex:1}
.bs-tab{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 10px;border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;white-space:nowrap;cursor:pointer}
.bs-tab:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.bs-tab[aria-selected="true"]{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-weight:650;box-shadow:0 1px 3px color-mix(in srgb,var(--dsw-alias-label-primary) 10%,transparent)}
.bs-tab[data-status="want"] svg{color:var(--dsw-alias-state-idle-primary)}
.bs-tab[data-status="reading"] svg{color:var(--dsw-alias-brand-primary)}
.bs-tab[data-status="read"] svg{color:var(--dsw-alias-state-success-primary)}
.bs-tabs .bs-col-add{margin-left:0}
.bs-flat-body{flex:1;min-height:0;overflow-y:auto;padding:8px 12px 14px;scrollbar-width:thin;scrollbar-color:var(--dsw-alias-border-l2) transparent}
.bs-flat-body .bs-empty{margin-top:8px}
.bs-list{display:flex;flex-direction:column}
.bs-list-row{--bs-accent:var(--dsw-alias-state-idle-primary);display:grid;grid-template-columns:28px minmax(160px,2fr) minmax(0,1.4fr) 132px auto 104px;align-items:center;gap:12px;padding:7px 6px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.bs-list-row[data-status="reading"]{--bs-accent:var(--dsw-alias-brand-primary)}
.bs-list-row[data-status="read"]{--bs-accent:var(--dsw-alias-state-success-primary)}
.bs-list-row:hover{background:var(--dsw-alias-bg-layer-2);border-radius:8px}
.bs-list-row.is-syncing .bs-list-main{animation:bs-pulse 1.2s ease-in-out infinite}
.bs-list-main{display:flex;flex-direction:column;gap:2px;min-width:0;padding:0;border:none;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.bs-list-title{overflow:hidden;font-size:13px;font-weight:620;text-overflow:ellipsis;white-space:nowrap}
.bs-list-author{overflow:hidden;color:var(--dsw-alias-label-secondary);font-size:11px;text-overflow:ellipsis;white-space:nowrap}
.bs-list-tags{display:flex;gap:4px;min-width:0;overflow:hidden}
.bs-list-tags .bs-tag{flex:none;margin:0}
.bs-list-state{display:flex;align-items:center;min-width:0}
.bs-row-progress{display:flex;align-items:center;gap:7px;width:100%;color:var(--dsw-alias-label-secondary);font-size:10.5px;font-variant-numeric:tabular-nums;white-space:nowrap}
.bs-row-progress .bs-track{flex:1}
.bs-mini-stars{color:var(--dsw-alias-state-warn-primary);font-size:11px;letter-spacing:.04em;white-space:nowrap}
.bs-mini-stars .is-off{color:var(--dsw-alias-border-l2)}
.bs-list-date{text-align:right}
.bs-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:18px 14px;padding-top:6px}
.bs-tile{display:flex;flex-direction:column;gap:5px;min-width:0;padding:0;border:none;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.bs-tile-cover{position:relative;display:block;transition:transform .15s ease}
.bs-tile:hover .bs-tile-cover{transform:translateY(-2px)}
.bs-tile.is-syncing .bs-tile-cover{animation:bs-pulse 1.2s ease-in-out infinite}
.bs-cover.bs-cover-tile{width:100%;height:auto;aspect-ratio:2/3;border-radius:4px 9px 9px 4px;box-shadow:inset 3px 0 0 rgba(0,0,0,.18),0 4px 12px rgba(0,0,0,.16)}
.bs-cover.bs-cover-tile .bs-cover-letter{font-size:34px}
.bs-cover.bs-cover-tile::after{left:58%}
.bs-tile-badge{position:absolute;top:6px;left:6px;z-index:3;display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:rgba(0,0,0,.5);color:#fff}
.bs-tile[data-status="reading"] .bs-tile-badge{background:var(--dsw-alias-brand-primary)}
.bs-tile[data-status="read"] .bs-tile-badge{background:var(--dsw-alias-state-success-primary)}
.bs-tile-progress{position:absolute;right:6px;bottom:6px;left:6px;z-index:3;height:4px;overflow:hidden;border-radius:999px;background:rgba(255,255,255,.55)}
.bs-tile-progress span{display:block;height:100%;border-radius:inherit;background:var(--dsw-alias-brand-primary)}
.bs-tile-title{display:-webkit-box;overflow:hidden;font-size:12px;font-weight:620;line-height:1.35;-webkit-box-orient:vertical;-webkit-line-clamp:2}
.bs-tile-sub{overflow:hidden;color:var(--dsw-alias-label-secondary);font-size:10.5px;text-overflow:ellipsis;white-space:nowrap}
.bs-tile[data-status="read"] .bs-tile-sub{color:var(--dsw-alias-state-warn-primary)}
.bs-more{display:flex;justify-content:center;padding:14px 0 4px;grid-column:1/-1}
.bs-board{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;flex:1;min-height:0;padding:16px var(--bs-gutter) 22px;overflow:hidden}
.bs-board-empty{display:flex;align-items:center;justify-content:center}
.bs-column{display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden;border:1px solid var(--dsw-alias-border-l1);border-top:3px solid color-mix(in srgb,var(--bs-accent) 70%,transparent);border-radius:16px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 78%,transparent)}
.bs-column[data-status="want"]{--bs-accent:var(--dsw-alias-state-idle-primary)}
.bs-column[data-status="reading"]{--bs-accent:var(--dsw-alias-brand-primary)}
.bs-column[data-status="read"]{--bs-accent:var(--dsw-alias-state-success-primary)}
.bs-col-head{flex:none;padding:14px 14px 0}
.bs-col-title-row{display:flex;align-items:center;gap:8px;min-width:0}
.bs-col-icon{display:inline-flex;color:var(--bs-accent)}
.bs-col-title{margin:0;font-size:13px;font-weight:700;letter-spacing:-.01em;white-space:nowrap}
.bs-col-count{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:18px;padding:0 6px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:10.5px;font-variant-numeric:tabular-nums}
.bs-col-add{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;margin-left:auto;padding:0;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;transition:background .15s ease,color .15s ease,border-color .15s ease}
.bs-col-add:hover{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}
.bs-col-hint{margin:6px 0 0;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:1.45}
.bs-col-body{display:flex;flex-direction:column;gap:10px;flex:1;min-height:0;overflow-y:auto;padding:12px;scrollbar-width:thin;scrollbar-color:var(--dsw-alias-border-l2) transparent}
.bs-col-body::-webkit-scrollbar{width:8px}
.bs-col-body::-webkit-scrollbar-thumb{border:2px solid transparent;border-radius:99px;background:var(--dsw-alias-border-l2);background-clip:padding-box}
.bs-card{position:relative;flex:none;padding:12px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-base);transition:border-color .15s ease,box-shadow .15s ease}
.bs-card:hover{border-color:var(--dsw-alias-border-l2);box-shadow:0 6px 18px color-mix(in srgb,var(--dsw-alias-label-primary) 8%,transparent);transform:translateY(-1px)}
.bs-card{transition:border-color .15s ease,box-shadow .15s ease,transform .15s ease}
.bs-card.is-syncing .bs-book-info{animation:bs-pulse 1.2s ease-in-out infinite}
.bs-card-top{display:flex;align-items:flex-start;gap:12px;min-width:0}
.bs-cover-button{position:relative;flex:none;padding:0;border:none;border-radius:4px 7px 7px 4px;background:transparent;cursor:pointer}
.bs-cover-busy{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;border-radius:inherit;background:rgba(0,0,0,.38);color:#fff}
.bs-cover{position:relative;display:flex;align-items:center;justify-content:center;flex:none;width:48px;height:68px;overflow:hidden;border-radius:3px 6px 6px 3px;background:linear-gradient(155deg,color-mix(in srgb,var(--bs-cover-bg) 82%,#fff) 0%,var(--bs-cover-bg) 58%,color-mix(in srgb,var(--bs-cover-bg) 84%,#000) 100%);color:var(--bs-cover-ink);box-shadow:inset 3px 0 0 rgba(0,0,0,.18),0 2px 5px rgba(0,0,0,.16)}
.bs-cover::before{content:"";position:absolute;top:4px;right:4px;width:4px;height:4px;border-radius:50%;background:currentColor;opacity:.55}
.bs-cover::after{content:"";position:absolute;left:26px;top:0;bottom:0;width:1px;background:currentColor;opacity:.16}
.bs-cover-img{position:absolute;inset:0;z-index:2;width:100%;height:100%;object-fit:cover;background:var(--dsw-alias-bg-layer-2)}
.bs-cover.has-image::before,.bs-cover.has-image::after{display:none}
.bs-cover.has-image{box-shadow:0 2px 6px rgba(0,0,0,.2)}
.bs-cover-lg{width:96px;height:136px;border-radius:4px 9px 9px 4px}
.bs-cover-lg::after{left:66px}
.bs-cover-lg .bs-cover-letter{font-size:34px}
.bs-cover-letter{position:relative;z-index:1;font-size:19px;font-weight:750;line-height:1;text-shadow:0 1px 1px rgba(0,0,0,.18)}
.bs-book-info{min-width:0;flex:1}
.bs-book-title{display:-webkit-box;overflow:hidden;margin:1px 0 0;font-size:13.5px;font-weight:650;letter-spacing:-.012em;line-height:1.35;-webkit-box-orient:vertical;-webkit-line-clamp:2}
.bs-book-author{overflow:hidden;margin:4px 0 0;color:var(--dsw-alias-label-secondary);font-size:11.5px;line-height:1.35;text-overflow:ellipsis;white-space:nowrap}
.bs-book-meta{overflow:hidden;margin:5px 0 0;color:var(--dsw-alias-label-secondary);font-size:10.5px;line-height:1.35;text-overflow:ellipsis;white-space:nowrap;opacity:.85}
.bs-book-meta.is-missing{color:var(--dsw-alias-state-warn-primary);opacity:1}
.bs-desc{display:-webkit-box;overflow:hidden;margin:10px 0 0;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:1.6;-webkit-box-orient:vertical;-webkit-line-clamp:3}
.bs-edit{display:inline-flex;align-items:center;justify-content:center;flex:none;width:26px;height:26px;margin:-3px -4px 0 0;padding:0;border:none;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);opacity:.55;cursor:pointer;transition:opacity .15s ease,background .15s ease,color .15s ease}
.bs-card:hover .bs-edit,.bs-edit:focus-visible{opacity:1}
.bs-edit:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.bs-progress{margin-top:10px}
.bs-progress-meta{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:5px;color:var(--dsw-alias-label-secondary);font-size:10.5px;font-variant-numeric:tabular-nums}
.bs-track{height:4px;overflow:hidden;border-radius:999px;background:var(--dsw-alias-border-l1)}
.bs-fill{display:block;height:100%;border-radius:inherit;background:var(--bs-accent);transition:width .3s ease}
.bs-rating{display:flex;align-items:center;gap:1px;margin-top:9px;color:var(--bs-accent);font-size:12px;letter-spacing:.08em;line-height:1}
.bs-star.is-off{color:var(--dsw-alias-border-l2)}
.bs-note{display:-webkit-box;overflow:hidden;margin:10px 0 0;padding:7px 9px;border-left:2px solid color-mix(in srgb,var(--bs-accent) 55%,transparent);border-radius:0 7px 7px 0;background:color-mix(in srgb,var(--bs-accent) 7%,transparent);color:var(--dsw-alias-label-secondary);font-size:11px;line-height:1.55;-webkit-box-orient:vertical;-webkit-line-clamp:3}
.bs-tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:9px}
.bs-tag{max-width:100%;overflow:hidden;padding:2px 7px;border:none;border-radius:999px;background:color-mix(in srgb,var(--bs-accent) 10%,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-label-secondary);font:inherit;font-size:10.5px;line-height:1.5;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}
.bs-tag:hover{color:var(--dsw-alias-label-primary)}
.bs-tag.is-excerpts{background:var(--dsw-alias-bg-layer-2)}
.bs-tag:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.bs-card-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px;padding-top:9px;border-top:1px solid var(--dsw-alias-border-l1)}
.bs-select-wrap{position:relative;display:inline-flex;align-items:center;min-width:0}
.bs-select-wrap::after{content:"";position:absolute;right:9px;width:5px;height:5px;border-right:1.5px solid var(--dsw-alias-label-secondary);border-bottom:1.5px solid var(--dsw-alias-label-secondary);transform:rotate(45deg) translateY(-2px);pointer-events:none}
.bs-status-select{height:25px;max-width:126px;padding:0 23px 0 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;outline:none;appearance:none;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font:inherit;font-size:10.5px;cursor:pointer}
.bs-status-select:hover{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}
.bs-status-select:focus-visible{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-brand-primary) 14%,transparent)}
.bs-date{color:var(--dsw-alias-label-secondary);font-size:10px;white-space:nowrap;opacity:.8}
.bs-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;flex:1;min-height:148px;padding:18px 12px;border:1px dashed var(--dsw-alias-border-l2);border-radius:10px;text-align:center}
.bs-empty-icon{display:inline-flex;margin-bottom:2px;color:var(--dsw-alias-border-l2)}
.bs-empty-title{margin:0;color:var(--dsw-alias-label-primary);font-size:12.5px;font-weight:650}
.bs-empty-hint{max-width:24ch;margin:0;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:1.5}
.bs-empty-action{margin-top:3px;padding:5px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:11px;cursor:pointer}
.bs-empty-action:hover{background:var(--dsw-alias-bg-layer-2)}
.bs-no-results{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;max-width:400px;padding:24px;text-align:center}
.bs-no-results-icon{display:inline-flex;margin-bottom:2px;color:var(--dsw-alias-label-secondary);opacity:.6}
.bs-no-results-title{margin:0;font-size:14px;font-weight:650}
.bs-no-results-hint{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.55}
.bs-no-results-action{margin-top:4px;padding:6px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:11.5px;cursor:pointer}
.bs-no-results-action:hover{background:var(--dsw-alias-bg-layer-2)}
.bs-scrim{position:fixed;inset:0;z-index:90;display:flex;align-items:center;justify-content:center;padding:24px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 34%,transparent);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)}
.bs-dialog{display:flex;flex-direction:column;width:min(560px,100%);animation:bs-in .18s ease;max-height:min(760px,calc(100vh - 48px));overflow:hidden;border:1px solid var(--dsw-alias-border-l2);border-radius:16px;background:var(--dsw-alias-bg-overlay);box-shadow:0 24px 80px color-mix(in srgb,var(--dsw-alias-label-primary) 24%,transparent)}
.bs-dialog.is-wide{width:min(640px,100%)}
.bs-dialog-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex:none;padding:20px 22px 0}
.bs-dialog-heading{min-width:0}
.bs-dialog-eyebrow{margin:0;color:var(--dsw-alias-label-secondary);font-size:9.5px;font-weight:650;letter-spacing:.16em;line-height:1.2;text-transform:uppercase}
.bs-dialog-title{margin:6px 0 0;font-size:20px;font-weight:720;letter-spacing:-.02em;line-height:1.2}
.bs-icon-button{display:inline-flex;align-items:center;justify-content:center;flex:none;width:30px;height:30px;padding:0;border:1px solid transparent;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.bs-icon-button:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.bs-form{display:flex;flex-direction:column;min-height:0;overflow:hidden}
.bs-dialog-body{display:flex;flex-direction:column;gap:15px;min-height:0;overflow-y:auto;padding:18px 22px 10px}
.bs-field{display:flex;flex-direction:column;gap:6px}
.bs-field-label{display:flex;align-items:baseline;justify-content:space-between;gap:8px;color:var(--dsw-alias-label-secondary);font-size:11.5px;font-weight:600}
.bs-field-value{color:var(--dsw-alias-label-secondary);font-size:11px;font-variant-numeric:tabular-nums;font-weight:500}
.bs-input,.bs-textarea{width:100%;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;outline:none;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;transition:border-color .15s ease,box-shadow .15s ease}
.bs-input{height:38px;padding:0 11px}
.bs-textarea{min-height:78px;padding:9px 11px;line-height:1.55;resize:vertical}
.bs-input::placeholder,.bs-textarea::placeholder{color:var(--dsw-alias-label-secondary);opacity:.7}
.bs-input:focus,.bs-textarea:focus{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-brand-primary) 15%,transparent)}
.bs-input[aria-invalid="true"]{border-color:var(--dsw-alias-state-error-primary)}
.bs-form-error{margin:0;color:var(--dsw-alias-state-error-primary);font-size:11px;line-height:1.4}
.bs-seg{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;padding:3px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1)}
.bs-seg-button{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;padding:0 8px;border:none;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;white-space:nowrap;cursor:pointer;transition:background .15s ease,color .15s ease,box-shadow .15s ease}
.bs-seg-button:hover{color:var(--dsw-alias-label-primary)}
.bs-seg-button[aria-pressed="true"]{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-weight:650;box-shadow:0 1px 3px color-mix(in srgb,var(--dsw-alias-label-primary) 10%,transparent)}
.bs-range{width:100%;height:24px;margin:2px 0 0;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}
.bs-rating-picker{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.bs-stars{display:flex;align-items:center;gap:2px}
.bs-star-button{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;padding:0;border:none;border-radius:7px;background:transparent;color:var(--dsw-alias-border-l2);font-size:19px;line-height:1;cursor:pointer;transition:color .12s ease,transform .12s ease}
.bs-star-button.is-on{color:var(--dsw-alias-state-warn-primary)}
.bs-star-button:hover{transform:translateY(-1px)}
.bs-clear-rating{padding:0;border:none;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;text-decoration:underline;text-underline-offset:2px;cursor:pointer}
.bs-clear-rating:hover{color:var(--dsw-alias-label-primary)}
.bs-dialog-foot{display:flex;align-items:center;gap:8px;flex:none;padding:14px 22px 19px;border-top:1px solid var(--dsw-alias-border-l1);margin-top:6px}
.bs-foot-spacer{flex:1}
.bs-btn{display:inline-flex;align-items:center;justify-content:center;height:34px;padding:0 13px;border:1px solid transparent;border-radius:9px;font:inherit;font-size:12px;font-weight:600;white-space:nowrap;cursor:pointer;transition:background .15s ease,border-color .15s ease,color .15s ease}
.bs-btn-secondary{border-color:var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary)}
.bs-btn-secondary:hover{background:var(--dsw-alias-bg-layer-2)}
.bs-btn-primary{background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base)}
.bs-btn-primary:hover{filter:brightness(1.06)}
.bs-btn{gap:6px}
.bs-btn:disabled{opacity:.5;cursor:default;filter:none}
.bs-btn-sm{height:28px;padding:0 10px;font-size:11.5px;flex:none}
.bs-btn-soft{border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 35%,transparent);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 9%,transparent);color:var(--dsw-alias-brand-primary)}
.bs-btn-soft:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-brand-primary) 15%,transparent)}
.bs-hero{display:flex;align-items:flex-start;gap:18px}
.bs-hero-fields{display:flex;flex-direction:column;gap:12px;flex:1;min-width:0}
.bs-lookup{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.bs-lookup-msg{margin:0;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:1.4}
.bs-lookup-msg.is-ok{color:var(--dsw-alias-state-success-primary)}
.bs-lookup-msg.is-error{color:var(--dsw-alias-state-error-primary)}
.bs-lookup-msg.is-miss{color:var(--dsw-alias-state-warn-primary)}
.bs-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.bs-field-hint{margin:0;color:var(--dsw-alias-label-secondary);font-size:10.5px;line-height:1.45;opacity:.85}
.bs-range:disabled{opacity:.55;cursor:default}
.bs-excerpts{display:flex;flex-direction:column;gap:6px;max-height:220px;margin:0;padding:0;overflow-y:auto;list-style:none}
.bs-excerpt{display:flex;align-items:flex-start;gap:8px;padding:8px 6px 8px 10px;border-left:2px solid var(--dsw-alias-brand-primary);border-radius:0 8px 8px 0;background:var(--dsw-alias-bg-layer-1)}
.bs-excerpt-body{flex:1;min-width:0}
.bs-excerpt-text{margin:0;font-size:12px;line-height:1.6;white-space:pre-wrap}
.bs-excerpt-meta{margin:4px 0 0;color:var(--dsw-alias-label-secondary);font-size:10.5px}
.bs-excerpt-remove{width:26px;height:26px}
.bs-excerpt-input{min-height:56px}
.bs-excerpt-add{display:grid;grid-template-columns:76px minmax(0,1fr) auto;gap:8px;align-items:center}
.bs-export-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.bs-export-button{height:44px}
.bs-export-button svg{color:var(--dsw-alias-brand-primary)}
.bs-year{display:flex;align-items:center;justify-content:center;gap:14px}
.bs-year-label{min-width:64px;font-size:22px;font-variant-numeric:tabular-nums;font-weight:740;text-align:center}
.bs-icon-button:disabled{opacity:.35;cursor:default}
.bs-stat-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.bs-stat-tile{display:flex;flex-direction:column;gap:4px;padding:12px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:10.5px}
.bs-stat-tile strong{color:var(--dsw-alias-label-primary);font-size:22px;font-variant-numeric:tabular-nums;font-weight:720;line-height:1}
.bs-months{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));align-items:end;gap:5px;height:120px;padding:6px 0 0}
.bs-month{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:4px;height:100%;min-width:0}
.bs-month-bar{width:100%;min-height:2px;border-radius:5px 5px 2px 2px;background:var(--dsw-alias-state-success-primary);opacity:.85}
.bs-month-count{color:var(--dsw-alias-label-secondary);font-size:10px;font-variant-numeric:tabular-nums}
.bs-month-label{color:var(--dsw-alias-label-secondary);font-size:10px}
.bs-finished-list{display:flex;flex-direction:column;gap:4px;margin:0;padding:0;list-style:none}
.bs-finished-item{display:flex;align-items:center;gap:10px;width:100%;padding:6px 8px;border:none;border-radius:9px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.bs-finished-item:hover{background:var(--dsw-alias-bg-layer-2)}
.bs-finished-title{display:flex;flex-direction:column;flex:1;min-width:0;overflow:hidden;font-size:12.5px;font-weight:600;text-overflow:ellipsis;white-space:nowrap}
.bs-finished-title small{overflow:hidden;color:var(--dsw-alias-label-secondary);font-size:10.5px;font-weight:400;text-overflow:ellipsis}
.bs-finished-rating{color:var(--dsw-alias-state-warn-primary);font-size:11px;letter-spacing:.06em}
.bs-cover-sm{width:28px;height:40px}
.bs-cover-sm .bs-cover-letter{font-size:12px}
.bs-cover-sm::after{left:15px}
.bs-stat-button{border:none;background:transparent;font-family:inherit;text-align:left;cursor:pointer}
.bs-stat-button:hover{background:var(--dsw-alias-bg-layer-2)}
.bs-stat-button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.bs-storage.is-merged .bs-storage-dot{background:var(--dsw-alias-brand-primary)}
.bs-import-hint{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.6}
.bs-drop{border-radius:10px;transition:box-shadow .15s ease}
.bs-drop.is-dragging{box-shadow:0 0 0 2px var(--dsw-alias-brand-primary)}
.bs-import-text{min-height:170px;font-size:12.5px;line-height:1.7}
.bs-import-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.bs-import-file{overflow:hidden;max-width:260px;color:var(--dsw-alias-label-secondary);font-size:11.5px;text-overflow:ellipsis;white-space:nowrap}
.bs-check{display:flex;align-items:center;gap:8px;color:var(--dsw-alias-label-primary);font-size:12px;cursor:pointer;user-select:none}
.bs-check input{width:15px;height:15px;margin:0;accent-color:var(--dsw-alias-brand-primary)}
.bs-check svg{color:var(--dsw-alias-brand-primary)}
.bs-import-preview{display:flex;flex-direction:column;gap:8px;padding:11px 12px;border:1px dashed var(--dsw-alias-border-l2);border-radius:10px}
.bs-import-count{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin:0;font-size:12px;font-weight:650}
.bs-import-dup{color:var(--dsw-alias-label-secondary);font-size:11px;font-weight:500}
.bs-chips{display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0;list-style:none}
.bs-chip{display:inline-flex;align-items:baseline;gap:6px;max-width:100%;padding:4px 9px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);font-size:11px}
.bs-chip strong{overflow:hidden;font-weight:600;text-overflow:ellipsis;white-space:nowrap}
.bs-chip span{color:var(--dsw-alias-label-secondary);white-space:nowrap}
.bs-chip.is-more{color:var(--dsw-alias-label-secondary)}
.bs-btn-danger{padding:0 8px;background:transparent;color:var(--dsw-alias-state-error-primary);font-weight:500}
.bs-btn-danger:hover{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 8%,transparent)}
.bs-btn-danger-confirm{padding:0 9px;border-color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-bg-base);font-weight:600}
@media (max-width:980px){
  .bs-list-row{grid-template-columns:28px minmax(0,1fr) 120px auto}
  .bs-list-tags,.bs-list-date{display:none}
  .bs-board{grid-template-columns:minmax(0,1fr);overflow-y:auto}
  .bs-column{min-height:210px;overflow:visible}
  .bs-col-body{overflow:visible;flex:none}
}
@media (max-width:640px){
  .bs-head{flex-wrap:wrap;gap:12px}
  .bs-stats{width:100%}
  .bs-stat{flex:1}
  .bs-actions{width:100%}
  .bs-actions>*{flex:1;justify-content:center}
  .bs-hero{flex-direction:column;align-items:center}
  .bs-hero-fields{width:100%}
  .bs-toolbar-spacer{display:none}
  .bs-toolbar-meta{width:100%}
  .bs-seg{grid-template-columns:minmax(0,1fr)}
  .bs-row{grid-template-columns:minmax(0,1fr)}
  .bs-stat-tiles,.bs-export-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .bs-excerpt-add{grid-template-columns:76px minmax(0,1fr)}
}
@media (prefers-reduced-motion:reduce){
  .bs-page *{transition:none!important;animation:none!important}
}
`

    function SyncBanner({ sync, tt, onStop, onDismiss }) {
      const percent = sync.total === 0 ? 100 : Math.round((sync.done / sync.total) * 100)
      if (sync.running) {
        return h(
          'div',
          { className: 'bs-sync', role: 'status' },
          h('span', { className: 'bs-sync-icon' }, h(SpinnerIcon, { size: 15 })),
          h(
            'div',
            { className: 'bs-sync-body' },
            h(
              'p',
              { className: 'bs-sync-text' },
              h('strong', null, tt('sync.running', { done: sync.done, total: sync.total })),
              sync.current !== '' &&
                h('span', { className: 'bs-sync-current' }, tt('sync.current', { title: sync.current })),
            ),
            h('div', { className: 'bs-track' }, h('span', { className: 'bs-fill', style: { width: `${percent}%` } })),
          ),
          h('button', { type: 'button', className: 'bs-btn bs-btn-secondary bs-btn-sm', onClick: onStop },
            tt('action.stop')),
        )
      }
      const offline = sync.failed > 0 && sync.updated === 0 && sync.missed === 0
      const parts = []
      if (offline) {
        parts.push(tt('sync.offline'))
      } else {
        parts.push(tt(sync.cancelled ? 'sync.cancelled' : 'sync.done', { updated: sync.updated }))
        if (sync.missed > 0) parts.push(tt('sync.missed', { count: sync.missed }))
        if (sync.failed > 0) parts.push(tt('sync.failed', { count: sync.failed }))
      }
      return h(
        'div',
        { className: offline ? 'bs-sync is-error' : 'bs-sync is-done', role: 'status' },
        h('span', { className: 'bs-sync-icon' }, offline ? h(CloseIcon, { size: 14 }) : h(ReadIcon, { size: 15 })),
        h('p', { className: 'bs-sync-text' }, parts.join('，')),
        h('button', { type: 'button', className: 'bs-btn bs-btn-secondary bs-btn-sm', onClick: onDismiss },
          tt('action.dismiss')),
      )
    }

    function BookshelfPage({ locale, tt }) {
      const subscribeLocale = React.useCallback(
        listener => locale.subscribe(listener),
        [locale],
      )
      const getLocaleSnapshot = React.useCallback(
        () => locale.getSnapshot(),
        [locale],
      )
      const localeSnapshot = React.useSyncExternalStore(
        subscribeLocale,
        getLocaleSnapshot,
        getLocaleSnapshot,
      )
      const activeLocale = localeSnapshot.active

      const [books, setBooks] = React.useState(initialBooks)
      const [query, setQuery] = React.useState('')
      const [sortBy, setSortBy] = React.useState('added')
      const [view, setView] = React.useState(loadView)
      const [statusFilter, setStatusFilter] = React.useState('all')
      const [dialog, setDialog] = React.useState(null)
      const [saveFailed, setSaveFailed] = React.useState(false)
      const [storagePhase, setStoragePhase] = React.useState('loading')
      const [storageReady, setStorageReady] = React.useState(false)
      const [mergedNotice, setMergedNotice] = React.useState(0)
      const [sync, setSync] = React.useState(null)
      const [syncingIds, setSyncingIds] = React.useState(() => new Set())
      const syncAbort = React.useRef(null)
      const booksRef = React.useRef(books)
      const initialSnapshotRef = React.useRef(JSON.stringify(books))
      /** The Host revision this window last agreed with, and that shelf (JSON + parsed). */
      const revisionRef = React.useRef(0)
      const lastSavedRef = React.useRef('')
      const baseBooksRef = React.useRef([])
      const pendingSaveRef = React.useRef(false)
      const saveTimerRef = React.useRef(null)
      const saveQueueRef = React.useRef(Promise.resolve())
      const savesInFlightRef = React.useRef(0)
      const onlineRef = React.useRef(false)
      const mountedRef = React.useRef(true)

      /** Record a shelf the Host holds at `revision` as the common ancestor for later rebases. */
      const acceptHost = React.useCallback((revision, hostBooks) => {
        revisionRef.current = revision
        lastSavedRef.current = JSON.stringify(hostBooks)
        baseBooksRef.current = hostBooks
        persistBase(revision, hostBooks)
      }, [])

      /** Show `next` and make it what the next save sends, before React re-renders. */
      const replaceBooks = React.useCallback(next => {
        booksRef.current = next
        setBooks(next)
      }, [])

      const noteMerged = React.useCallback(() => {
        if (mountedRef.current) setMergedNotice(Date.now())
      }, [])

      /**
       * Write the newest browser copy on top of the agreed revision. When another
       * writer got there first (409), rebase this window's edits onto their shelf
       * and try again, so neither side's changes are lost.
       */
      const performSave = React.useCallback(() => {
        const run = saveQueueRef.current.then(async () => {
          savesInFlightRef.current += 1
          try {
            for (let attempt = 0; attempt < 4; attempt += 1) {
              const snapshot = booksRef.current
              const snapshotKey = JSON.stringify(snapshot)
              if (snapshotKey === lastSavedRef.current) {
                clearPendingShelf()
                if (mountedRef.current && !pendingSaveRef.current) {
                  setStoragePhase('saved')
                  setSaveFailed(false)
                }
                return
              }
              try {
                const saved = await writeHostShelf(snapshot, revisionRef.current)
                acceptHost(saved.revision, saved.books)
                if (JSON.stringify(booksRef.current) === snapshotKey) {
                  // Adopt the Host's normalized copy so later diffs start clean.
                  if (JSON.stringify(saved.books) !== snapshotKey && mountedRef.current) replaceBooks(saved.books)
                  persistLocalCache(saved.books)
                  clearPendingShelf()
                  if (mountedRef.current && !pendingSaveRef.current) {
                    setStoragePhase('saved')
                    setSaveFailed(false)
                  }
                }
                return
              } catch (error) {
                if (error && error.status === 409 && error.current) {
                  const merged = mergeShelves(baseBooksRef.current, booksRef.current, error.current.books)
                  acceptHost(error.current.revision, error.current.books)
                  persistLocalCache(merged)
                  if (mountedRef.current) replaceBooks(merged)
                  else booksRef.current = merged
                  noteMerged()
                  continue
                }
                throw error
              }
            }
          } catch {
            persistLocalCache(booksRef.current)
            markPendingShelf(booksRef.current)
            if (!mountedRef.current) return
            setStoragePhase('offline')
            setSaveFailed(true)
          } finally {
            savesInFlightRef.current -= 1
          }
        })
        saveQueueRef.current = run.then(() => undefined, () => undefined)
        return run
      }, [acceptHost, replaceBooks, noteMerged])

      const scheduleSave = React.useCallback(() => {
        if (!onlineRef.current) {
          setStoragePhase('offline')
          setSaveFailed(true)
          return
        }
        pendingSaveRef.current = true
        setStoragePhase('saving')
        setSaveFailed(false)
        if (saveTimerRef.current !== null) clearTimeout(saveTimerRef.current)
        saveTimerRef.current = setTimeout(() => {
          saveTimerRef.current = null
          if (!pendingSaveRef.current) return
          pendingSaveRef.current = false
          void performSave()
        }, HOST_SAVE_DEBOUNCE_MS)
      }, [performSave])

      /**
       * Bring a Host shelf into this window. With nothing unsaved it is adopted
       * as-is; otherwise this window's edits are rebased onto it and the save
       * effect writes the merge back.
       */
      const adoptRemote = React.useCallback((remote, base) => {
        const local = booksRef.current
        const dirty = JSON.stringify(local) !== lastSavedRef.current
        const next = dirty ? mergeShelves(base, local, remote.books) : remote.books
        acceptHost(remote.revision, remote.books)
        persistLocalCache(next)
        replaceBooks(next)
      }, [acceptHost, replaceBooks])

      React.useEffect(() => {
        let cancelled = false
        const controller = new AbortController()
        ;(async () => {
          try {
            const remote = await readHostShelf(controller.signal)
            if (cancelled) return
            // Re-read after the round trip: the user may have edited while the
            // Host request was in flight, which marks a newer pending copy.
            const pending = readPendingShelf()
            onlineRef.current = true
            if (remote.books === null) {
              // First Host use: the browser copy (or seeds) becomes revision 1.
              acceptHost(0, [])
              replaceBooks(pending !== null ? pending.books : booksRef.current)
            } else if (pending === null) {
              acceptHost(remote.revision, remote.books)
              persistLocalCache(remote.books)
              replaceBooks(remote.books)
            } else {
              // Edits that never reached the Host: rebase them onto whatever
              // the Host has now. Without a recorded base (an older version
              // queued them) every book falls back to its newest edit.
              const stored = readBase()
              const merged = mergeShelves(stored !== null ? stored.books : [], pending.books, remote.books)
              acceptHost(remote.revision, remote.books)
              replaceBooks(merged)
            }
            setStoragePhase('saved')
            setSaveFailed(false)
            setStorageReady(true)
          } catch (error) {
            if (cancelled || (error && error.name === 'AbortError')) return
            // Keep the browser copy usable, but never overwrite a Host document
            // that might exist and merely be temporarily unreachable.
            lastSavedRef.current = JSON.stringify(booksRef.current)
            onlineRef.current = false
            setStoragePhase('offline')
            setSaveFailed(true)
            setStorageReady(true)
          }
        })()
        return () => {
          cancelled = true
          controller.abort()
        }
      }, [acceptHost, replaceBooks])

      React.useEffect(() => {
        booksRef.current = books
        if (!storageReady) {
          if (JSON.stringify(books) !== initialSnapshotRef.current) {
            persistLocalCache(books)
            markPendingShelf(books)
          }
          return
        }
        persistLocalCache(books)
        if (JSON.stringify(books) === lastSavedRef.current) {
          if (onlineRef.current) {
            clearPendingShelf()
            if (!pendingSaveRef.current && savesInFlightRef.current === 0) {
              setStoragePhase('saved')
              setSaveFailed(false)
            }
          }
          return
        }
        markPendingShelf(books)
        scheduleSave()
      }, [books, storageReady, scheduleSave])

      /**
       * Agent tools and other windows write the same file. Probe the revision
       * while the panel is visible (and on focus) and pull in what changed; an
       * offline window uses the same probe to come back and flush its queue.
       */
      React.useEffect(() => {
        if (!storageReady) return undefined
        let stopped = false
        let busy = false
        const writing = () => pendingSaveRef.current || savesInFlightRef.current > 0
        async function probe() {
          if (stopped || busy || writing()) return
          if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
          busy = true
          try {
            if (!onlineRef.current) {
              const remote = await readHostShelf()
              if (stopped) return
              onlineRef.current = true
              const stored = readBase()
              const local = booksRef.current
              if (remote.books === null) {
                acceptHost(0, [])
                replaceBooks(local.slice())
              } else {
                const merged = mergeShelves(stored !== null ? stored.books : [], local, remote.books)
                acceptHost(remote.revision, remote.books)
                replaceBooks(merged)
              }
              return
            }
            const revision = await readHostRevision()
            if (stopped || revision === revisionRef.current || writing()) return
            const remote = await readHostShelf()
            if (stopped || remote.books === null || remote.revision === revisionRef.current || writing()) return
            adoptRemote(remote, baseBooksRef.current)
            noteMerged()
          } catch {
            // A missed probe is harmless; the next one or the next save retries.
          } finally {
            busy = false
          }
        }
        const timer = setInterval(probe, HOST_POLL_MS)
        const onVisible = () => {
          if (typeof document === 'undefined' || document.visibilityState !== 'hidden') void probe()
        }
        window.addEventListener('focus', onVisible)
        document.addEventListener('visibilitychange', onVisible)
        return () => {
          stopped = true
          clearInterval(timer)
          window.removeEventListener('focus', onVisible)
          document.removeEventListener('visibilitychange', onVisible)
        }
      }, [storageReady, acceptHost, replaceBooks, adoptRemote, noteMerged])

      React.useEffect(() => {
        if (mergedNotice === 0) return undefined
        const timer = setTimeout(() => setMergedNotice(0), 4000)
        return () => clearTimeout(timer)
      }, [mergedNotice])

      React.useEffect(() => () => {
        mountedRef.current = false
        if (syncAbort.current !== null) syncAbort.current.abort()
        if (saveTimerRef.current !== null) clearTimeout(saveTimerRef.current)
        // A panel switch must not drop the last debounced edit.
        if (pendingSaveRef.current && onlineRef.current) {
          pendingSaveRef.current = false
          void performSave()
        }
      }, [performSave])

      const closeDialog = React.useCallback(() => setDialog(null), [])

      /** Looks up `targets` a few at a time, writing each result back as soon as it lands. */
      const runSync = React.useCallback(async (targets, overwrite) => {
        if (syncAbort.current !== null || targets.length === 0) return
        const controller = new AbortController()
        syncAbort.current = controller
        const queue = targets.slice()
        const stats = { total: targets.length, done: 0, updated: 0, missed: 0, failed: 0, current: '' }
        const publish = () => setSync({ ...stats, running: true })
        const mark = (id, on) => setSyncingIds(current => {
          const next = new Set(current)
          if (on) next.add(id)
          else next.delete(id)
          return next
        })
        publish()

        async function worker() {
          while (queue.length > 0 && !controller.signal.aborted) {
            const book = queue.shift()
            stats.current = book.title
            mark(book.id, true)
            publish()
            try {
              const meta = await lookupBook(book, controller.signal)
              if (controller.signal.aborted) return
              setBooks(current => current.map(item => (
                item.id === book.id ? applyMetadata(item, meta, overwrite) : item
              )))
              if (meta === null) stats.missed += 1
              else stats.updated += 1
            } catch {
              if (controller.signal.aborted) return
              stats.failed += 1
            } finally {
              mark(book.id, false)
            }
            stats.done += 1
            publish()
          }
        }

        await Promise.all(Array.from({ length: LOOKUP_WORKERS }, worker))
        syncAbort.current = null
        setSyncingIds(new Set())
        setSync({ ...stats, current: '', running: false, cancelled: controller.signal.aborted })
      }, [])

      const stopSync = React.useCallback(() => {
        if (syncAbort.current !== null) syncAbort.current.abort()
      }, [])

      const visibleBooks = React.useMemo(() => {
        let needle = query.trim().toLocaleLowerCase()
        if (needle === '') return books
        // `#tag` narrows to that tag; any remaining words search the text.
        const tagFilters = []
        needle = needle.replace(/#([^\s#]+)/g, (_, tag) => {
          tagFilters.push(tag)
          return ' '
        }).trim()
        return books.filter(book => {
          if (tagFilters.length > 0) {
            const tags = book.tags.map(tag => tag.toLocaleLowerCase())
            if (!tagFilters.every(tag => tags.includes(tag))) return false
          }
          if (needle === '') return true
          const excerpts = book.excerpts.map(excerpt => `${excerpt.text} ${excerpt.note}`).join(' ')
          return `${book.title} ${book.author} ${book.note} ${book.publisher} ${book.tags.join(' ')} ${excerpts}`
            .toLocaleLowerCase()
            .includes(needle)
        })
      }, [books, query])

      const columns = React.useMemo(() => {
        const grouped = { want: [], reading: [], read: [] }
        for (const book of visibleBooks) grouped[book.status].push(book)
        return {
          want: sortColumn(grouped.want, sortBy, activeLocale),
          reading: sortColumn(grouped.reading, sortBy, activeLocale),
          read: sortColumn(grouped.read, sortBy, activeLocale),
        }
      }, [visibleBooks, sortBy, activeLocale])

      const readingCount = React.useMemo(() => books.filter(book => book.status === 'reading').length, [books])
      const readCount = React.useMemo(() => books.filter(book => book.status === 'read').length, [books])
      const currentYear = new Date().getFullYear()
      const finishedThisYear = React.useMemo(() => books.filter(book => (
        book.status === 'read' && book.finishedAt > 0 && new Date(book.finishedAt).getFullYear() === currentYear
      )).length, [books, currentYear])
      const incomplete = React.useMemo(() => books.filter(needsMetadata), [books])

      function addBook(status) {
        setDialog({ mode: 'create', status })
      }

      function editBook(book) {
        setDialog({ mode: 'edit', book })
      }

      function submitBook(values) {
        const now = Date.now()
        if (dialog.mode === 'create') {
          const created = normalizeBook({ ...values, id: newBookId(), addedAt: now })
          setBooks(current => [{ ...created, updatedAt: now }, ...current])
          setQuery('')
        } else {
          setBooks(current => current.map(book => (
            book.id === dialog.book.id ? normalizeBook({ ...book, ...values, updatedAt: now }) : book
          )))
        }
        setDialog(null)
      }

      function deleteBook() {
        if (dialog.mode !== 'edit') return
        setBooks(current => current.filter(book => book.id !== dialog.book.id))
        setDialog(null)
      }

      function importBooks(items, status, autoFill) {
        const now = Date.now()
        const created = items
          .map((item, index) => normalizeBook({
            ...item,
            id: newBookId(),
            status: isStatus(item.status) ? item.status : status,
            addedAt: Number(item.addedAt) > 0 ? item.addedAt : now - index,
          }))
          .filter(Boolean)
        setBooks(current => [...created, ...current])
        setQuery('')
        setDialog(null)
        if (autoFill) runSync(created.filter(needsMetadata), false)
      }

      function syncAll() {
        if (incomplete.length > 0) runSync(incomplete, false)
        else runSync(books, true)
      }

      function changeStatus(id, status) {
        if (!isStatus(status)) return
        const now = Date.now()
        setBooks(current => current.map(book => (
          book.id === id && book.status !== status ? { ...applyStatus(book, status, now), updatedAt: now } : book
        )))
      }

      const searchActive = query.trim() !== ''
      const syncing = sync !== null && sync.running
      const storageLabel = mergedNotice !== 0 && storagePhase !== 'offline' ? tt('storage.merged') : tt(
        storagePhase === 'loading' ? 'storage.loading'
          : storagePhase === 'saving' ? 'storage.saving'
            : storagePhase === 'offline' ? 'storage.offline'
              : 'storage.host',
      )
      function changeView(next) {
        setView(next)
        try {
          localStorage.setItem(VIEW_KEY, next)
        } catch {}
      }

      const statusCounts = {
        all: visibleBooks.length,
        want: columns.want.length,
        reading: columns.reading.length,
        read: columns.read.length,
      }
      const flatBooks = view === 'board' ? [] : sortColumn(
        statusFilter === 'all' ? visibleBooks : columns[statusFilter],
        sortBy,
        activeLocale,
      )
      const flatReset = `${view}|${statusFilter}|${query}|${sortBy}`
      const flatProps = {
        books: flatBooks,
        tt,
        activeLocale,
        resetKey: flatReset,
        onEdit: editBook,
        onStatus: changeStatus,
        onTag: tag => setQuery(`#${tag}`),
        syncingIds,
      }
      const shelfNode = view === 'board'
        ? null
        : h(
            'div',
            { className: 'bs-flat' },
            h(StatusTabs, { filter: statusFilter, counts: statusCounts, tt, onChange: setStatusFilter, onAdd: addBook }),
            h(
              'div',
              // Keyed so switching view, tab, search, or sort starts back at the top.
              { className: 'bs-flat-body', key: flatReset },
              flatBooks.length === 0
                ? h(EmptyShelf, { tt, onAdd: () => addBook(statusFilter === 'all' ? 'want' : statusFilter) })
                : view === 'list' ? h(ListView, flatProps) : h(GridView, flatProps),
            ),
          )
      const columnNodes = STATUSES.map(status => h(ShelfColumn, {
        key: status,
        status,
        books: columns[status],
        tt,
        activeLocale,
        onAdd: addBook,
        onEdit: editBook,
        onStatus: changeStatus,
        onTag: tag => setQuery(`#${tag}`),
        syncingIds,
      }))

      return h(
        'div',
        { className: 'bs-page', 'data-dsh-plugin': 'bookshelf' },
        h('style', { 'data-dsh-bookshelf': 'styles' }, CSS),
        h(
          'header',
          { className: 'bs-head' },
          h(
            'div',
            { className: 'bs-heading' },
            h(
              'p',
              { className: 'bs-kicker' },
              h('span', { className: 'bs-kicker-mark', 'aria-hidden': true },
                h(ShelfMark, { size: 13 })),
              h('span', null, tt('panel.eyebrow')),
            ),
            h('h1', { className: 'bs-title' }, tt('panel.title')),
            h('p', { className: 'bs-subtitle' }, tt('panel.subtitle')),
          ),
          h(
            'div',
            { className: 'bs-stats', 'aria-label': tt('panel.summary', { reading: readingCount, read: readCount }) },
            h('div', { className: 'bs-stat' },
              h('strong', null, String(books.length)), h('span', null, tt('panel.shelfCount'))),
            h('div', { className: 'bs-stat', 'data-status': 'reading' },
              h('strong', null, String(readingCount)), h('span', null, tt('status.reading'))),
            h('div', { className: 'bs-stat', 'data-status': 'read' },
              h('strong', null, String(readCount)), h('span', null, tt('status.read'))),
            h(
              'button',
              {
                type: 'button',
                className: 'bs-stat bs-stat-button',
                'data-status': 'read',
                onClick: () => setDialog({ mode: 'stats' }),
                title: tt('stats.open', { year: currentYear }),
                'aria-label': tt('stats.open', { year: currentYear }),
              },
              h('strong', null, String(finishedThisYear)),
              h('span', null, `${currentYear} ${tt('stats.thisYear')}`),
            ),
          ),
        ),
        h(
          'div',
          { className: 'bs-toolbar' },
          h(
            'div',
            { className: 'bs-search', role: 'search' },
            h('span', { className: 'bs-search-icon', 'aria-hidden': true }, h(SearchIcon, { size: 15 })),
            h('input', {
              className: 'bs-search-input',
              type: 'search',
              value: query,
              onChange: event => setQuery(event.target.value),
              placeholder: tt('search.placeholder'),
              'aria-label': tt('search.label'),
              spellCheck: false,
            }),
            query !== '' &&
              h(
                'button',
                {
                  type: 'button',
                  className: 'bs-search-clear',
                  onClick: () => setQuery(''),
                  'aria-label': tt('search.clear'),
                  title: tt('search.clear'),
                },
                h(CloseIcon, { size: 14 }),
              ),
          ),
          h(
            'label',
            { className: 'bs-sort', htmlFor: 'bs-sort-select' },
            h('span', null, tt('sort.label')),
            h(
              'span',
              { className: 'bs-sort-wrap' },
              h(
                'select',
                {
                  id: 'bs-sort-select',
                  className: 'bs-sort-select',
                  value: sortBy,
                  onChange: event => setSortBy(event.target.value),
                },
                SORT_OPTIONS.map(option =>
                  h('option', { key: option.id, value: option.id }, tt(option.label)),
                ),
              ),
            ),
          ),
          h(ViewSwitch, { view, tt, onChange: changeView }),
          h(
            'span',
            {
              className: `bs-storage is-${mergedNotice !== 0 && storagePhase !== 'offline' ? 'merged' : storagePhase}`,
              title: tt('storage.hint'),
              role: 'status',
            },
            h('span', { className: 'bs-storage-dot', 'aria-hidden': true }),
            storageLabel,
          ),
          searchActive &&
            h('span', { className: 'bs-toolbar-meta' }, tt('panel.filteredCount', { count: visibleBooks.length })),
          h('span', { className: 'bs-toolbar-spacer' }),
          h(
            'div',
            { className: 'bs-actions' },
            h(
              'button',
              {
                type: 'button',
                className: 'bs-tool',
                onClick: () => setDialog({ mode: 'import' }),
                title: tt('action.importTitle'),
              },
              h(ImportIcon, { size: 15 }),
              h('span', null, tt('action.import')),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'bs-tool',
                onClick: () => setDialog({ mode: 'export' }),
                title: tt('action.exportTitle'),
              },
              h(ExportIcon, { size: 15 }),
              h('span', null, tt('action.export')),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'bs-tool',
                onClick: syncAll,
                disabled: syncing || books.length === 0,
                title: tt(incomplete.length > 0 ? 'action.syncTitle' : 'action.syncAllTitle'),
              },
              syncing ? h(SpinnerIcon, { size: 15 }) : h(SparkIcon, { size: 15 }),
              h('span', null, tt('action.sync')),
              incomplete.length > 0 && !syncing &&
                h('span', { className: 'bs-badge' }, String(incomplete.length)),
            ),
          ),
        ),
        sync !== null &&
          h(SyncBanner, { sync, tt, onStop: stopSync, onDismiss: () => setSync(null) }),
        saveFailed && h('p', { className: 'bs-save-error', role: 'status' }, tt('save.failed')),
        searchActive && visibleBooks.length === 0
          ? h(
              'div',
              { className: 'bs-board bs-board-empty' },
              h(
                'div',
                { className: 'bs-no-results' },
                h('span', { className: 'bs-no-results-icon', 'aria-hidden': true },
                  h(SearchIcon, { size: 30 })),
                h('p', { className: 'bs-no-results-title' }, tt('search.emptyTitle')),
                h('p', { className: 'bs-no-results-hint' }, tt('search.emptyHint')),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'bs-no-results-action',
                    onClick: () => setQuery(''),
                  },
                  tt('search.emptyAction'),
                ),
              ),
            )
          : view === 'board' ? h('div', { className: 'bs-board' }, columnNodes) : shelfNode,
        dialog !== null && dialog.mode === 'import' &&
          h(ImportDialog, { books, tt, onClose: closeDialog, onImport: importBooks }),
        dialog !== null && dialog.mode === 'export' &&
          h(ExportDialog, { books, tt, onClose: closeDialog }),
        dialog !== null && dialog.mode === 'stats' &&
          h(StatsDialog, {
            books,
            tt,
            activeLocale,
            onClose: closeDialog,
            onOpenBook: book => setDialog({ mode: 'edit', book }),
            onTag: tag => {
              setQuery(`#${tag}`)
              setDialog(null)
            },
          }),
        dialog !== null && (dialog.mode === 'create' || dialog.mode === 'edit') &&
          h(BookDialog, {
            key: dialog.mode === 'edit' ? dialog.book.id : 'create',
            mode: dialog.mode,
            initialStatus: dialog.mode === 'create' ? dialog.status : 'want',
            book: dialog.mode === 'edit' ? dialog.book : undefined,
            tt,
            onClose: closeDialog,
            onSubmit: submitBook,
            onDelete: deleteBook,
          }),
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => {
          try {
            return ctx.locale.register(NS, { zh, en })
          } catch {
            return () => {}
          }
        }, 'bookshelf: dictionaries')

        const tt = ctx.locale.bind(NS)
        const disposers = []

        disposers.push(ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: PANEL_ORDER,
          label: () => tt('entry.label'),
        }, BookshelfPanelIcon)))

        disposers.push(ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
          inject: () => ({ locale: ctx.locale, tt }),
        }, BookshelfPage)))

        ctx.effect(() => () => {
          for (const dispose of disposers.splice(0)) dispose()
        }, 'bookshelf: surfaces')
      },
    }
  },
})
