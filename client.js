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
      want: { label: 'status.want' },
      reading: { label: 'status.reading' },
      read: { label: 'status.read' },
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

    const zh = {
      'entry.label': '我的书架',
      'panel.title': '我的书架',
      'panel.finishedThisYear': '今年读完 {count} 本',
      'panel.finishedThisYearOne': '今年读完 {count} 本',
      'panel.filteredCount': '找到 {count} 本',
      'action.add': '添加书',
      'action.addTo': '添加到「{status}」',
      'action.close': '关闭',
      'action.cancel': '取消',
      'action.save': '保存',
      'action.create': '添加',
      'action.delete': '删除',
      'action.undo': '撤销',
      'action.clearRating': '清除评分',
      'action.import': '导入',
      'action.importTitle': '导入书单',
      'action.export': '导出',
      'action.exportTitle': '导出书架',
      'action.stats': '阅读统计',
      'action.lookup': '补全信息',
      'action.lookupHint': '从网上查找封面、作者和简介',
      'action.lookupBusy': '正在查找…',
      'action.stop': '停止',
      'action.dismiss': '知道了',
      'toast.deleted': '已删除《{title}》',
      'toast.merged': '已同步其他窗口或 AI 助手的改动',
      'status.want': '想读',
      'status.reading': '在读',
      'status.read': '已读',
      'status.label': '阅读状态',
      'search.label': '搜索书架',
      'search.placeholder': '搜索书名、作者、笔记或 #标签',
      'search.clear': '清除搜索',
      'search.emptyTitle': '没有找到相关的书',
      'sort.label': '排序',
      'sort.added': '最近添加',
      'sort.title': '按书名',
      'sort.author': '按作者',
      'sort.finished': '最近读完',
      'sort.rating': '按评分',
      'view.label': '视图',
      'view.board': '按状态',
      'view.list': '列表',
      'view.grid': '封面墙',
      'view.all': '全部',
      'shelf.emptyTitle': '书架还是空的',
      'shelf.emptyHint': '可以一本本添加，也可以导入豆瓣或 Goodreads 的书单。还可以直接告诉 AI 助手你在读什么。',
      'book.edit': '编辑《{title}》',
      'book.statusFor': '《{title}》的阅读状态',
      'book.added': '{date} 添加',
      'book.started': '{date} 开始',
      'book.finished': '{date} 读完',
      'book.progress': '阅读进度',
      'book.pageOf': '第 {page} / {pages} 页',
      'book.pages': '{count} 页',
      'book.pagesOne': '{count} 页',
      'book.excerpts': '{count} 条摘录',
      'book.excerptsOne': '{count} 条摘录',
      'book.excerptPage': '第 {page} 页',
      'book.ratingValue': '{value} 星（满分 5 星）',
      'book.noInfo': '没有查到资料',
      'book.filterTag': '只看 #{tag}',
      'dialog.addTitle': '添加一本书',
      'dialog.editTitle': '编辑书籍',
      'field.title': '书名',
      'field.titlePlaceholder': '例如：置身事内',
      'field.author': '作者',
      'field.authorPlaceholder': '例如：兰小欢',
      'field.status': '阅读状态',
      'field.currentPage': '读到第几页',
      'field.pages': '总页数',
      'field.progress': '进度',
      'field.progressByPage': '按页码计算',
      'field.started': '开始日期',
      'field.finished': '读完日期',
      'field.rating': '评分',
      'field.note': '笔记',
      'field.notePlaceholder': '一句想记住的话，或者为什么想读它',
      'field.tags': '标签',
      'field.tagsPlaceholder': '例如：历史 经济',
      'field.excerpts': '摘录',
      'field.excerptPlaceholder': '想留下来的一段原文',
      'field.excerptPage': '页码',
      'field.excerptNote': '我的想法（可选）',
      'field.description': '简介',
      'field.descriptionPlaceholder': '可以用「补全信息」自动填写',
      'field.cover': '封面图片地址',
      'field.coverPlaceholder': 'https://…',
      'field.more': '添加摘录、简介或封面',
      'field.required': '请填写书名',
      'action.addExcerpt': '添加摘录',
      'action.removeExcerpt': '删除这条摘录',
      'save.failed': '暂时连不上 DSH，改动先保存在这台电脑上，连上后会自动同步。',
      'sync.running': '正在补全信息 {done}/{total}',
      'sync.current': '《{title}》',
      'sync.done': '已补全 {count} 本。',
      'sync.doneOne': '已补全 {count} 本。',
      'sync.missed': '{count} 本没有查到。',
      'sync.failed': '{count} 本查找失败。',
      'sync.cancelled': '已停止，补全了 {count} 本。',
      'sync.offline': '连不上书目网站，请检查网络后再试。',
      'lookup.found': '已从 {source} 找到，保存后生效',
      'lookup.missed': '没有查到，可以改一下书名或作者再试',
      'lookup.failed': '查找失败，请稍后再试',
      'lookup.needTitle': '先填写书名',
      'import.hint': '每行一本，例如「置身事内 - 兰小欢」。也可以选择或拖入豆瓣（豆伴导出）、Goodreads 的 CSV 文件。',
      'import.placeholder': '置身事内 - 兰小欢\n《万历十五年》黄仁宇\n百年孤独',
      'import.file': '选择文件…',
      'import.fileFailed': '无法读取这个文件',
      'import.status': '放到',
      'import.autoFill': '自动补全封面和简介',
      'import.found': '识别到 {count} 本',
      'import.foundOne': '识别到 {count} 本',
      'import.duplicates': '{count} 本已在书架上，会跳过',
      'import.none': '还没有识别到书名',
      'import.submit': '导入 {count} 本',
      'export.json': '完整备份（JSON）',
      'export.csv': '表格（CSV）',
      'export.markdown': '书单（Markdown）',
      'export.count': '共 {count} 本书',
      'export.countOne': '共 {count} 本书',
      'stats.title': '阅读统计',
      'stats.finished': '读完',
      'stats.pages': '读完的书总页数',
      'stats.avgRating': '平均评分',
      'stats.avgDays': '平均每本用时',
      'stats.byMonth': '每月读完',
      'stats.monthCount': '{month}：{count} 本',
      'stats.list': '读完的书',
      'stats.tags': '常读的标签',
      'stats.empty': '这一年还没有读完的书。把书的状态改成「已读」，就会记下读完的日期。',
      'stats.prev': '上一年',
      'stats.next': '下一年',
    }

    const en = {
      'entry.label': 'My Bookshelf',
      'panel.title': 'My Bookshelf',
      'panel.finishedThisYear': '{count} books finished this year',
      'panel.finishedThisYearOne': '{count} book finished this year',
      'panel.filteredCount': '{count} found',
      'action.add': 'Add book',
      'action.addTo': 'Add to {status}',
      'action.close': 'Close',
      'action.cancel': 'Cancel',
      'action.save': 'Save',
      'action.create': 'Add',
      'action.delete': 'Delete',
      'action.undo': 'Undo',
      'action.clearRating': 'Clear rating',
      'action.import': 'Import',
      'action.importTitle': 'Import books',
      'action.export': 'Export',
      'action.exportTitle': 'Export shelf',
      'action.stats': 'Reading stats',
      'action.lookup': 'Look up details',
      'action.lookupHint': 'Find covers, authors, and descriptions online',
      'action.lookupBusy': 'Looking up…',
      'action.stop': 'Stop',
      'action.dismiss': 'OK',
      'toast.deleted': 'Deleted “{title}”',
      'toast.merged': 'Synced changes from another window or the assistant',
      'status.want': 'Want to read',
      'status.reading': 'Reading',
      'status.read': 'Finished',
      'status.label': 'Reading status',
      'search.label': 'Search shelf',
      'search.placeholder': 'Search titles, authors, notes, or #tags',
      'search.clear': 'Clear search',
      'search.emptyTitle': 'No books found',
      'sort.label': 'Sort',
      'sort.added': 'Recently added',
      'sort.title': 'Title',
      'sort.author': 'Author',
      'sort.finished': 'Recently finished',
      'sort.rating': 'Rating',
      'view.label': 'View',
      'view.board': 'By status',
      'view.list': 'List',
      'view.grid': 'Covers',
      'view.all': 'All',
      'shelf.emptyTitle': 'Your shelf is empty',
      'shelf.emptyHint': 'Add books one at a time, or import a list from Goodreads or Douban. You can also just tell the assistant what you’re reading.',
      'book.edit': 'Edit “{title}”',
      'book.statusFor': 'Reading status for “{title}”',
      'book.added': 'Added {date}',
      'book.started': 'Started {date}',
      'book.finished': 'Finished {date}',
      'book.progress': 'Reading progress',
      'book.pageOf': 'Page {page} of {pages}',
      'book.pages': '{count} pages',
      'book.pagesOne': '{count} page',
      'book.excerpts': '{count} quotes',
      'book.excerptsOne': '{count} quote',
      'book.excerptPage': 'p. {page}',
      'book.ratingValue': '{value} out of 5 stars',
      'book.noInfo': 'No details found',
      'book.filterTag': 'Show only #{tag}',
      'dialog.addTitle': 'Add a book',
      'dialog.editTitle': 'Edit book',
      'field.title': 'Title',
      'field.titlePlaceholder': 'e.g. The Little Prince',
      'field.author': 'Author',
      'field.authorPlaceholder': 'e.g. Antoine de Saint-Exupéry',
      'field.status': 'Reading status',
      'field.currentPage': 'Current page',
      'field.pages': 'Total pages',
      'field.progress': 'Progress',
      'field.progressByPage': 'From page numbers',
      'field.started': 'Started',
      'field.finished': 'Finished',
      'field.rating': 'Rating',
      'field.note': 'Note',
      'field.notePlaceholder': 'A line to remember, or why you want to read it',
      'field.tags': 'Tags',
      'field.tagsPlaceholder': 'e.g. history, economics',
      'field.excerpts': 'Quotes',
      'field.excerptPlaceholder': 'A passage worth keeping',
      'field.excerptPage': 'Page',
      'field.excerptNote': 'Your thought (optional)',
      'field.description': 'Description',
      'field.descriptionPlaceholder': 'Use Look up details to fill this in',
      'field.cover': 'Cover image URL',
      'field.coverPlaceholder': 'https://…',
      'field.more': 'Add quotes, description, or cover',
      'field.required': 'Enter a title',
      'action.addExcerpt': 'Add quote',
      'action.removeExcerpt': 'Delete quote',
      'save.failed': 'Can’t reach DSH right now. Your changes are kept on this computer and will sync when it’s back.',
      'sync.running': 'Looking up details {done} of {total}',
      'sync.current': '“{title}”',
      'sync.done': 'Updated {count} books.',
      'sync.doneOne': 'Updated {count} book.',
      'sync.missed': '{count} not found.',
      'sync.failed': '{count} failed.',
      'sync.cancelled': 'Stopped after {count}.',
      'sync.offline': 'Can’t reach the book catalogs. Check your connection and try again.',
      'lookup.found': 'Found on {source}. Save to keep it.',
      'lookup.missed': 'Nothing found. Try a different title or author.',
      'lookup.failed': 'Couldn’t look it up. Try again later.',
      'lookup.needTitle': 'Enter a title first',
      'import.hint': 'One book per line, like “Dune - Frank Herbert”. You can also choose or drop a CSV exported from Goodreads or Douban.',
      'import.placeholder': 'The Little Prince - Antoine de Saint-Exupéry\nSapiens - Yuval Noah Harari\nOne Hundred Years of Solitude',
      'import.file': 'Choose file…',
      'import.fileFailed': 'Couldn’t read this file',
      'import.status': 'Add to',
      'import.autoFill': 'Look up covers and descriptions',
      'import.found': '{count} books found',
      'import.foundOne': '{count} book found',
      'import.duplicates': '{count} already on your shelf will be skipped',
      'import.none': 'No titles yet',
      'import.submit': 'Import {count}',
      'export.json': 'Full backup (JSON)',
      'export.csv': 'Spreadsheet (CSV)',
      'export.markdown': 'Reading list (Markdown)',
      'export.count': '{count} books',
      'export.countOne': '{count} book',
      'stats.title': 'Reading stats',
      'stats.finished': 'Books finished',
      'stats.pages': 'Pages in finished books',
      'stats.avgRating': 'Average rating',
      'stats.avgDays': 'Average time per book',
      'stats.byMonth': 'Finished by month',
      'stats.monthCount': '{month}: {count}',
      'stats.list': 'Books you finished',
      'stats.tags': 'Top tags',
      'stats.empty': 'No finished books this year. When you mark a book as Finished, the date is recorded.',
      'stats.prev': 'Previous year',
      'stats.next': 'Next year',
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

    function ChartIcon({ size }) {
      return glyph(
        [
          h('path', { key: 'a', d: 'M2.5 13.5h11' }),
          h('path', { key: 'b', d: 'M4.5 11V7.5' }),
          h('path', { key: 'c', d: 'M8 11V4' }),
          h('path', { key: 'd', d: 'M11.5 11V6' }),
        ],
        size,
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

    /** A first-time user starts with an empty shelf, never sample books they would have to delete. */
    function loadLocalBooks() {
      try {
        if (typeof localStorage === 'undefined') return []
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw === null) return []
        const parsed = JSON.parse(raw)
        if (parsed === null || typeof parsed !== 'object' || parsed.version !== STORAGE_VERSION) return []
        if (!Array.isArray(parsed.books)) return []
        return parsed.books.map(normalizeBook).filter(Boolean)
      } catch {
        return []
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
            out.push(`  > ${excerpt.text.replace(/\n+/g, ' ')}${excerpt.page > 0 ? ` (${tt('book.excerptPage', { page: excerpt.page })})` : ''}`)
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
      return first === undefined ? '' : first.toUpperCase()
    }

    /** Grouped digits in the reader's locale: 1,443 not 1443. */
    function formatNumber(value, activeLocale, options) {
      try {
        return new Intl.NumberFormat(activeLocale || undefined, options).format(value)
      } catch {
        return String(value)
      }
    }

    /** English needs "1 quote" / "2 quotes"; each `one` key exists in both dictionaries. */
    function plural(tt, count, many, one, activeLocale) {
      const rule = (() => {
        try {
          return new Intl.PluralRules(activeLocale || undefined).select(count)
        } catch {
          return count === 1 ? 'one' : 'other'
        }
      })()
      return tt(rule === 'one' ? one : many, { count: formatNumber(count, activeLocale) })
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
          style: coverStyle(title || ' '),
          'aria-hidden': true,
        },
        h('span', { className: 'bs-cover-letter' }, coverLetter(title || '')),
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

    /** Year, publisher, page count: separated by space, not by "·". */
    function metaParts(book, tt, activeLocale) {
      const parts = []
      if (book.published !== '') parts.push(book.published)
      if (book.publisher !== '') parts.push(book.publisher)
      if (book.pages > 0) parts.push(plural(tt, book.pages, 'book.pages', 'book.pagesOne', activeLocale))
      return parts
    }

    function BookCard({ book, tt, activeLocale, onEdit, onStatus, onTag, syncing }) {
      const progress = clampNumber(book.progress, 0, 100, 0)
      const details = metaParts(book, tt, activeLocale)
      return h(
        'article',
        {
          className: syncing ? 'bs-card is-syncing' : 'bs-card',
          'data-status': book.status,
        },
        // The whole top of the card opens the book; no separate pencil to hunt for.
        h(
          'button',
          {
            type: 'button',
            className: 'bs-card-open',
            onClick: () => onEdit(book),
          },
          h(
            'span',
            { className: 'bs-cover-wrap' },
            h(BookCover, { title: book.title, cover: book.cover }),
            syncing && h('span', { className: 'bs-cover-busy' }, h(SpinnerIcon, { size: 16 })),
          ),
          h(
            'span',
            { className: 'bs-book-info' },
            h('span', { className: 'bs-book-title', title: book.title }, book.title),
            book.author !== '' && h('span', { className: 'bs-book-author', title: book.author }, book.author),
            details.length > 0 &&
              h('span', { className: 'bs-book-meta' },
                details.map((part, index) => h('span', { key: index, className: 'bs-meta-part' }, part))),
            details.length === 0 && book.metaStatus === 'miss' &&
              h('span', { className: 'bs-book-meta' }, tt('book.noInfo')),
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
                ? tt('book.pageOf', { page: formatNumber(book.currentPage, activeLocale), pages: formatNumber(book.pages, activeLocale) })
                : tt('book.progress')),
              h('span', null, formatNumber(progress / 100, activeLocale, { style: 'percent' })),
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
        book.status === 'read' && book.rating > 0 && h(RatingStars, { rating: book.rating, tt }),
        book.note !== ''
          ? h('p', { className: 'bs-note', title: book.note }, book.note)
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
                plural(tt, book.excerpts.length, 'book.excerpts', 'book.excerptsOne', activeLocale),
              ),
          ),
        h(
          'div',
          { className: 'bs-card-foot' },
          h(StatusSelect, { book, tt, onStatus }),
          h('span', { className: 'bs-date' }, formatAdded(book, activeLocale, tt)),
        ),
      )
    }

    function StatusSelect({ book, tt, onStatus }) {
      return h(
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
      )
    }

    /** An empty column is just the way to fill it. */
    function EmptyColumn({ status, tt, onAdd }) {
      return h(
        'button',
        { type: 'button', className: 'bs-empty-add', onClick: onAdd },
        h(PlusIcon, { size: 14 }),
        h('span', null, tt('action.addTo', { status: tt(STATUS_META[status].label) })),
      )
    }

    /** First run, or after the last book is deleted: the two ways in, plus the assistant. */
    function EmptyShelf({ tt, onAdd, onImport }) {
      return h(
        'div',
        { className: 'bs-welcome' },
        h('span', { className: 'bs-welcome-icon', 'aria-hidden': true }, h(ShelfMark, { size: 32 })),
        h('h2', { className: 'bs-welcome-title' }, tt('shelf.emptyTitle')),
        h('p', { className: 'bs-welcome-hint' }, tt('shelf.emptyHint')),
        h(
          'div',
          { className: 'bs-welcome-actions' },
          h('button', { type: 'button', className: 'bs-btn bs-btn-primary', onClick: onAdd },
            h(PlusIcon, { size: 14 }), h('span', null, tt('action.add'))),
          h('button', { type: 'button', className: 'bs-btn bs-btn-secondary', onClick: onImport },
            h(ImportIcon, { size: 14 }), h('span', null, tt('action.importTitle'))),
        ),
      )
    }

    function ShelfColumn({ status, books, tt, activeLocale, onAdd, onEdit, onStatus, onTag, syncingIds }) {
      const label = tt(STATUS_META[status].label)
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
          h('span', { className: 'bs-col-icon', 'aria-hidden': true }, h(StatusIcon, { status, size: 14 })),
          h('h2', { className: 'bs-col-title', id: `bs-column-${status}` }, label),
          h('span', { className: 'bs-col-count' }, formatNumber(books.length, activeLocale)),
          books.length > 0 &&
            h(
              'button',
              {
                type: 'button',
                className: 'bs-col-add',
                onClick: () => onAdd(status),
                'aria-label': tt('action.addTo', { status: label }),
                title: tt('action.addTo', { status: label }),
              },
              h(PlusIcon, { size: 14 }),
            ),
        ),
        h(
          'div',
          { className: 'bs-col-body' },
          books.length === 0
            ? h(EmptyColumn, { status, tt, onAdd: () => onAdd(status) })
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

    /**
     * `keepOnScrim`: forms the user is typing into do not close on a stray
     * click outside; Escape, Cancel, and the close button still do.
     */
    function DialogShell({ layerRef, title, tt, onClose, wide, keepOnScrim, children }) {
      return h(
        'div',
        {
          className: 'bs-scrim',
          onMouseDown: event => {
            if (!keepOnScrim && event.target === event.currentTarget) onClose()
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
            h('h2', { className: 'bs-dialog-title', id: 'bs-dialog-title' }, title),
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

    function BookDialog({ mode, initialStatus, book, tt, activeLocale, onClose, onSubmit, onDelete }) {
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
      // A new book's start day is unknown (it may have begun weeks ago), so it is left blank
      // rather than guessed; the finish day defaults to today because stats need one.
      const [started, setStarted] = React.useState(() => toDateInput(editing ? book.startedAt : 0))
      const [showMore, setShowMore] = React.useState(editing)
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
          if (started === '' && editing) setStarted(today)
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
          keepOnScrim: true,
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
                      className: 'bs-btn bs-btn-secondary',
                      onClick: fetchInfo,
                      disabled: busy,
                      title: tt('action.lookupHint'),
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
            status === 'reading' && pagedProgress &&
              h(
                'p',
                { className: 'bs-field-label' },
                tt('field.progress'),
                h('span', { className: 'bs-field-value' },
                  `${tt('field.progressByPage')} ${formatNumber(deriveProgress('reading', progress, pageNow, pageCount) / 100, activeLocale, { style: 'percent' })}`),
              ),
            status === 'reading' && !pagedProgress &&
              h(
                'div',
                { className: 'bs-field' },
                h(
                  'label',
                  { className: 'bs-field-label', htmlFor: 'bs-field-progress' },
                  tt('field.progress'),
                  h('span', { className: 'bs-field-value' }, formatNumber(progress / 100, activeLocale, { style: 'percent' })),
                ),
                h('input', {
                  id: 'bs-field-progress',
                  type: 'range',
                  className: 'bs-range',
                  min: 0,
                  max: 100,
                  step: 1,
                  value: progress,
                  onChange: event => setProgress(Number(event.target.value)),
                }),
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
            // Adding a book stays short; quotes, description, and cover wait behind one click.
            showMore ? h(
              React.Fragment,
              null,
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
                            excerpt.page > 0 && h('span', { className: 'bs-meta-part' }, tt('book.excerptPage', { page: excerpt.page })),
                            excerpt.note !== '' && h('span', { className: 'bs-meta-part' }, excerpt.note),
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
                    className: 'bs-btn bs-btn-secondary',
                    onClick: addExcerpt,
                    disabled: draft.text.trim() === '' || excerpts.length >= MAX_EXCERPTS,
                  },
                  h(PlusIcon, { size: 14 }),
                  h('span', null, tt('action.addExcerpt')),
                ),
              ),
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
            ) : h(
              'button',
              { type: 'button', className: 'bs-btn bs-btn-quiet bs-more-fields', onClick: () => setShowMore(true) },
              h(PlusIcon, { size: 14 }),
              h('span', null, tt('field.more')),
            ),
          ),
          h(
            'div',
            { className: 'bs-dialog-foot' },
            // Deleting is immediate; the page offers Undo, so there is no "are you sure".
            editing &&
              h('button', { type: 'button', className: 'bs-btn bs-btn-secondary', onClick: onDelete },
                h(TrashIcon, { size: 14 }), h('span', null, tt('action.delete'))),
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

    function ImportDialog({ books, tt, activeLocale, onClose, onImport }) {
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
          keepOnScrim: true,
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
              h('span', null, tt('import.autoFill')),
            ),
            h(
              'div',
              { className: 'bs-import-preview', 'aria-live': 'polite' },
              h(
                'p',
                { className: 'bs-import-count' },
                parsed.fresh.length > 0
                  ? plural(tt, parsed.fresh.length, 'import.found', 'import.foundOne', activeLocale)
                  : tt('import.none'),
                parsed.duplicates > 0 &&
                  h('span', { className: 'bs-import-dup' },
                    tt('import.duplicates', { count: formatNumber(parsed.duplicates, activeLocale) })),
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
                    h('li', { className: 'bs-chip is-more' }, `+${formatNumber(parsed.fresh.length - preview.length, activeLocale)}`),
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
              tt('import.submit', { count: formatNumber(parsed.fresh.length, activeLocale) }),
            ),
          ),
        ),
      )
    }

    function ExportDialog({ books, tt, activeLocale, onClose }) {
      const layerRef = React.useRef(null)
      const firstRef = React.useRef(null)
      useModal(layerRef, firstRef, onClose)
      const day = toDateInput(Date.now())
      const formats = [
        { id: 'json', label: 'export.json', run: () => downloadText(`bookshelf-${day}.json`, 'application/json', exportJson(books)) },
        { id: 'csv', label: 'export.csv', run: () => downloadText(`bookshelf-${day}.csv`, 'text/csv;charset=utf-8', exportCsv(books)) },
        { id: 'md', label: 'export.markdown', run: () => downloadText(`bookshelf-${day}.md`, 'text/markdown;charset=utf-8', exportMarkdown(books, tt)) },
      ]
      return h(
        DialogShell,
        { layerRef, tt, onClose, title: tt('action.exportTitle') },
        h(
          'div',
          { className: 'bs-dialog-body' },
          h('p', { className: 'bs-dialog-text' }, plural(tt, books.length, 'export.count', 'export.countOne', activeLocale)),
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
      const months = React.useMemo(() => {
        const format = (options, month) => {
          try {
            return new Intl.DateTimeFormat(activeLocale || undefined, options).format(new Date(2000, month, 15))
          } catch {
            return String(month + 1)
          }
        }
        return Array.from({ length: 12 }, (_, month) => ({ short: format({ month: 'short' }, month), long: format({ month: 'long' }, month) }))
      }, [activeLocale])
      const none = '–'
      const tiles = [
        { id: 'finished', value: formatNumber(stats.finished.length, activeLocale), label: tt('stats.finished') },
        { id: 'pages', value: formatNumber(stats.pages, activeLocale), label: tt('stats.pages') },
        {
          id: 'rating',
          value: stats.averageRating ? formatNumber(stats.averageRating, activeLocale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : none,
          label: tt('stats.avgRating'),
        },
        {
          id: 'days',
          value: stats.averageDays ? formatNumber(stats.averageDays, activeLocale, { style: 'unit', unit: 'day', unitDisplay: 'long' }) : none,
          label: tt('stats.avgDays'),
        },
      ]
      return h(
        DialogShell,
        { layerRef, tt, onClose, wide: true, title: tt('stats.title') },
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
            }, h(ChevronIcon, { size: 16 })),
            h('strong', { className: 'bs-year-label', 'aria-live': 'polite' }, String(year)),
            h('button', {
              type: 'button',
              className: 'bs-icon-button',
              onClick: () => setYear(value => value + 1),
              disabled: year >= thisYear,
              'aria-label': tt('stats.next'),
              title: tt('stats.next'),
            }, h(ChevronIcon, { size: 16, flip: true })),
          ),
          h(
            'dl',
            { className: 'bs-stat-tiles' },
            tiles.map(tile => h('div', { key: tile.id, className: 'bs-stat-tile' },
              h('dt', null, tile.label), h('dd', null, tile.value))),
          ),
          stats.finished.length === 0
            ? h('p', { className: 'bs-dialog-text' }, tt('stats.empty'))
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
                          'aria-label': tt('stats.monthCount', { month: months[index].long, count: formatNumber(count, activeLocale) }),
                        },
                        h('span', { className: 'bs-month-count', 'aria-hidden': true }, count > 0 ? formatNumber(count, activeLocale) : ''),
                        h('span', { className: 'bs-month-bar', style: { height: `${Math.round((count / peak) * 100)}%` } }),
                        h('span', { className: 'bs-month-label', 'aria-hidden': true }, months[index].short),
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
                        title: tt('book.filterTag', { tag }),
                      }, `#${tag}`, h('span', { className: 'bs-tag-count' }, formatNumber(count, activeLocale)))))),
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
                          h(RatingStars, { rating: book.rating, tt }),
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
    function StatusTabs({ filter, counts, tt, activeLocale, onChange, onAdd }) {
      const tabs = ['all', ...STATUSES]
      return h(
        'div',
        { className: 'bs-tabs' },
        h('div', { className: 'bs-tablist', role: 'tablist', 'aria-label': tt('status.label') }, tabs.map(id =>
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
            h('span', { className: 'bs-col-count' }, formatNumber(counts[id], activeLocale)),
          ),
        )),
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
          h(PlusIcon, { size: 14 }),
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
          h('button', { type: 'button', className: 'bs-btn bs-btn-secondary', onClick: () => setLimit(current => current + RENDER_STEP) },
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
        h('span', { className: 'is-off', 'aria-hidden': true }, '☆'.repeat(5 - rating)),
      )
    }

    function ProgressCell({ book, tt, activeLocale }) {
      if (book.status !== 'reading') return null
      return h(
        'div',
        { className: 'bs-row-progress', title: book.pages > 0 && book.currentPage > 0
          ? tt('book.pageOf', { page: formatNumber(book.currentPage, activeLocale), pages: formatNumber(book.pages, activeLocale) })
          : tt('book.progress') },
        h('div', { className: 'bs-track' }, h('span', { className: 'bs-fill', style: { width: `${book.progress}%` } })),
        h('span', null, formatNumber(book.progress / 100, activeLocale, { style: 'percent' })),
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
              book.author !== '' && h('span', { className: 'bs-list-author' }, book.author),
            ),
            h(
              'div',
              { className: 'bs-list-tags' },
              book.tags.slice(0, 3).map(tag =>
                h('button', { key: tag, type: 'button', className: 'bs-tag', onClick: () => onTag(tag), title: tt('book.filterTag', { tag }) }, `#${tag}`),
              ),
              book.excerpts.length > 0 &&
                h('span', { className: 'bs-tag is-excerpts' },
                  plural(tt, book.excerpts.length, 'book.excerpts', 'book.excerptsOne', activeLocale)),
            ),
            h('div', { className: 'bs-list-state' },
              h(ProgressCell, { book, tt, activeLocale }),
              book.status === 'read' && h(RatingStars, { rating: book.rating, tt })),
            h(StatusSelect, { book, tt, onStatus }),
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
              title: book.author ? `${book.title}\n${book.author}` : book.title,
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
            book.author !== '' && h('span', { className: 'bs-tile-sub' }, book.author),
          ),
        ),
        sentinel,
      )
    }

    /* ── page ──────────────────────────────────────────────────────────── */

    /**
     * Design tokens. The panel keeps its own warm palette instead of the host's
     * blue-grays; light and dark follow the host's `body[data-ds-dark-theme]`.
     * Accent: 黛绿 #426666 (light) and 青碧 #48c0a3 (dark), from the common
     * Chinese traditional color table; ≥4.5:1 on every surface they sit on.
     * Type scale has four steps: 12 / 14 / 17 / 24.
     */
    const CSS = `
.bs-page{--bs-bg:#faf8f5;--bs-surface:#fffefc;--bs-sunken:#f2efea;--bs-hover:#ebe7e0;--bs-line:#e6e1d9;--bs-line-strong:#d3ccc1;--bs-ink:#2b2722;--bs-ink-2:#6b6359;--bs-accent:#426666;--bs-on-accent:#fff;--bs-accent-soft:color-mix(in srgb,#426666 12%,transparent);--bs-danger:#9d2933;--bs-scrim:rgba(43,39,34,.36);--bs-shadow:0 12px 40px rgba(43,39,34,.18),0 2px 8px rgba(43,39,34,.08);--bs-cover-line:rgba(43,39,34,.12);--bs-fs-s:12px;--bs-fs-m:14px;--bs-fs-l:17px;--bs-fs-xl:24px;--bs-r-s:6px;--bs-r-m:8px;--bs-r-l:12px;--bs-r-xl:16px;--bs-control:32px;--bs-gutter:clamp(16px,2.6vw,32px)}
body[data-ds-dark-theme] .bs-page{--bs-bg:#1a1917;--bs-surface:#22201e;--bs-sunken:#2b2926;--bs-hover:#34312d;--bs-line:#36332f;--bs-line-strong:#4a463f;--bs-ink:#efebe5;--bs-ink-2:#ada499;--bs-accent:#48c0a3;--bs-on-accent:#1a1917;--bs-accent-soft:color-mix(in srgb,#48c0a3 14%,transparent);--bs-danger:#e8857f;--bs-scrim:rgba(0,0,0,.5);--bs-shadow:0 12px 40px rgba(0,0,0,.5);--bs-cover-line:rgba(255,255,255,.1)}
.bs-page,.bs-page *{box-sizing:border-box}
.bs-page{position:relative;display:flex;flex-direction:column;width:100%;height:100%;min-height:0;overflow:hidden;padding-left:var(--dsh-frame-leading-clearance,0px);background:var(--bs-bg);color:var(--bs-ink);font-family:inherit;font-size:var(--bs-fs-m);line-height:1.5;overflow-wrap:break-word}
:where(.bs-page) :where(button,input,select,textarea){font:inherit;color:inherit}
.bs-page :focus-visible{outline:2px solid var(--bs-accent);outline-offset:2px}
.bs-head{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 16px;flex:none;padding:28px var(--bs-gutter) 0}
.bs-title{margin:0;font-size:var(--bs-fs-xl);font-weight:700;line-height:1.3}
.bs-summary{margin:0;color:var(--bs-ink-2);font-size:var(--bs-fs-m)}
.bs-toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:8px 12px;flex:none;padding:20px var(--bs-gutter) 0}
.bs-search{position:relative;display:flex;align-items:center;flex:1 1 240px;max-width:420px;min-width:200px}
.bs-search-icon{position:absolute;left:10px;display:inline-flex;color:var(--bs-ink-2);pointer-events:none}
.bs-search-input{width:100%;height:var(--bs-control);padding:0 36px 0 34px;border:1px solid var(--bs-line-strong);border-radius:var(--bs-r-m);outline:none;background:var(--bs-surface);font-size:var(--bs-fs-m)}
.bs-search-input::placeholder,.bs-input::placeholder,.bs-textarea::placeholder{color:var(--bs-ink-2);opacity:1}
.bs-search-input:focus,.bs-input:focus,.bs-textarea:focus{border-color:var(--bs-accent);outline:none}
.bs-search-input::-webkit-search-cancel-button{-webkit-appearance:none;appearance:none}
.bs-search-clear{position:absolute;right:4px;display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:none;border-radius:var(--bs-r-s);background:transparent;color:var(--bs-ink-2);cursor:pointer}
.bs-search-clear:hover{background:var(--bs-hover);color:var(--bs-ink)}
.bs-sort{position:relative;display:inline-flex;align-items:center}
.bs-select-wrap{position:relative;display:inline-flex;align-items:center;min-width:0}
.bs-sort::after,.bs-select-wrap::after{content:"";position:absolute;right:11px;width:5px;height:5px;border-right:1.5px solid var(--bs-ink-2);border-bottom:1.5px solid var(--bs-ink-2);transform:rotate(45deg) translateY(-2px);pointer-events:none}
.bs-sort-select{height:var(--bs-control);padding:0 30px 0 10px;border:1px solid var(--bs-line-strong);border-radius:var(--bs-r-m);outline:none;appearance:none;background:var(--bs-surface);font-size:var(--bs-fs-m);cursor:pointer}
.bs-view-switch{display:inline-flex;align-items:center;gap:2px;padding:3px;border-radius:10px;background:var(--bs-sunken)}
.bs-view-button{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px;border:none;border-radius:7px;background:transparent;color:var(--bs-ink-2);font-size:var(--bs-fs-m);white-space:nowrap;cursor:pointer}
.bs-view-button:hover{color:var(--bs-ink)}
.bs-view-button[aria-pressed="true"]{background:var(--bs-surface);color:var(--bs-ink);font-weight:600}
.bs-toolbar-meta{color:var(--bs-ink-2);font-size:var(--bs-fs-s);white-space:nowrap}
.bs-toolbar-spacer{flex:1}
.bs-actions{display:flex;align-items:center;flex-wrap:wrap;gap:8px}
.bs-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:var(--bs-control);max-width:100%;padding:4px 12px;border:1px solid transparent;border-radius:var(--bs-r-m);background:transparent;font-size:var(--bs-fs-m);font-weight:500;line-height:1.4;text-align:center;cursor:pointer;transition:background-color .15s ease,border-color .15s ease}
.bs-btn>span{min-width:0}
.bs-btn:disabled{opacity:.45;cursor:default}
.bs-btn-primary{background:var(--bs-accent);color:var(--bs-on-accent);font-weight:600}
.bs-btn-primary:hover:not(:disabled){background:color-mix(in srgb,var(--bs-accent) 88%,var(--bs-ink))}
.bs-btn-secondary{border-color:var(--bs-line-strong);background:var(--bs-surface);color:var(--bs-ink)}
.bs-btn-secondary:hover:not(:disabled){background:var(--bs-hover)}
.bs-btn-quiet{padding:0 8px;color:var(--bs-ink-2)}
.bs-btn-quiet:hover:not(:disabled){background:var(--bs-hover);color:var(--bs-ink)}
.bs-btn-sm{min-height:28px;padding:2px 10px}
.bs-btn svg{flex:none}
.bs-badge{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 6px;border-radius:999px;background:var(--bs-sunken);color:var(--bs-ink-2);font-size:var(--bs-fs-s);font-variant-numeric:tabular-nums}
.bs-notice{display:flex;align-items:center;gap:12px;flex:none;margin:16px var(--bs-gutter) 0;padding:10px 12px;border-radius:var(--bs-r-m);background:var(--bs-sunken);font-size:var(--bs-fs-m);line-height:1.6}
.bs-notice-icon{display:inline-flex;flex:none;color:var(--bs-ink-2)}
.bs-notice-body{display:flex;flex-direction:column;gap:8px;flex:1;min-width:0}
.bs-notice-text{display:flex;flex-wrap:wrap;column-gap:.5em;margin:0;min-width:0}
.bs-notice-text strong{font-weight:600;font-variant-numeric:tabular-nums}
.bs-sync-current{min-width:0;overflow:hidden;color:var(--bs-ink-2);text-overflow:ellipsis;white-space:nowrap}
.bs-spin{animation:bs-spin .8s linear infinite}
@keyframes bs-spin{to{transform:rotate(360deg)}}
@keyframes bs-in{from{opacity:0;transform:translateY(4px)}}
@keyframes bs-pulse{50%{opacity:.5}}
.bs-board{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px;flex:1;min-height:0;padding:24px var(--bs-gutter) 0;overflow:hidden}
.bs-column{display:flex;flex-direction:column;min-width:0;min-height:0}
.bs-col-head{display:flex;align-items:center;gap:8px;flex:none;min-height:28px;padding:0 0 12px;border-bottom:1px solid var(--bs-line)}
.bs-col-icon{display:inline-flex;color:var(--bs-ink-2)}
.bs-column[data-status="reading"] .bs-col-icon{color:var(--bs-accent)}
.bs-col-title{margin:0;font-size:var(--bs-fs-m);font-weight:600;white-space:nowrap}
.bs-col-count{color:var(--bs-ink-2);font-size:var(--bs-fs-s);font-variant-numeric:tabular-nums}
.bs-col-add{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;margin-left:auto;padding:0;border:none;border-radius:var(--bs-r-s);background:transparent;color:var(--bs-ink-2);cursor:pointer}
.bs-col-add:hover{background:var(--bs-hover);color:var(--bs-ink)}
.bs-col-body{display:flex;flex-direction:column;gap:12px;flex:1;min-height:0;overflow-y:auto;padding:12px 2px 24px;scrollbar-width:thin;scrollbar-color:var(--bs-line-strong) transparent}
.bs-card{position:relative;flex:none;padding:12px;border:1px solid var(--bs-line);border-radius:var(--bs-r-l);background:var(--bs-surface);transition:border-color .15s ease}
.bs-card:hover{border-color:var(--bs-line-strong)}
.bs-card.is-syncing .bs-book-info{animation:bs-pulse 1.2s ease-in-out infinite}
.bs-card-open{display:flex;align-items:flex-start;gap:12px;width:100%;min-width:0;padding:0;border:none;background:transparent;text-align:left;cursor:pointer}
.bs-card-open:hover .bs-book-title{text-decoration:underline;text-decoration-color:var(--bs-line-strong);text-underline-offset:3px}
.bs-cover-wrap{position:relative;flex:none;display:block}
.bs-cover-busy{position:absolute;inset:0;z-index:3;display:flex;align-items:center;justify-content:center;border-radius:3px 6px 6px 3px;background:rgba(0,0,0,.4);color:#fff}
.bs-cover-button{flex:none;padding:0;border:none;background:transparent;cursor:pointer}
.bs-cover{position:relative;display:flex;align-items:center;justify-content:center;flex:none;width:48px;height:68px;overflow:hidden;border-radius:3px 6px 6px 3px;background:linear-gradient(155deg,color-mix(in srgb,var(--bs-cover-bg) 84%,#fff) 0%,var(--bs-cover-bg) 60%,color-mix(in srgb,var(--bs-cover-bg) 86%,#000) 100%);color:var(--bs-cover-ink);box-shadow:inset 3px 0 0 rgba(0,0,0,.16),inset 0 0 0 1px var(--bs-cover-line)}
.bs-cover::after{content:"";position:absolute;left:26px;top:0;bottom:0;width:1px;background:currentColor;opacity:.14}
.bs-cover-img{position:absolute;inset:0;z-index:2;width:100%;height:100%;object-fit:cover;background:var(--bs-sunken)}
.bs-cover.has-image::after{display:none}
.bs-cover-letter{position:relative;z-index:1;font-size:var(--bs-fs-l);font-weight:700;line-height:1}
.bs-cover-lg{width:96px;height:136px;border-radius:4px 8px 8px 4px}
.bs-cover-lg::after{left:66px}
.bs-cover-lg .bs-cover-letter,.bs-cover-tile .bs-cover-letter{font-size:var(--bs-fs-xl)}
.bs-cover-sm{width:28px;height:40px;border-radius:2px 4px 4px 2px}
.bs-cover-sm::after{left:15px}
.bs-cover-sm .bs-cover-letter{font-size:var(--bs-fs-s)}
.bs-book-info{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}
.bs-book-title{display:-webkit-box;overflow:hidden;font-size:var(--bs-fs-m);font-weight:600;line-height:1.4;-webkit-box-orient:vertical;-webkit-line-clamp:2}
.bs-book-author{overflow:hidden;color:var(--bs-ink-2);font-size:var(--bs-fs-s);line-height:1.5;text-overflow:ellipsis;white-space:nowrap}
.bs-book-meta{display:flex;flex-wrap:wrap;column-gap:8px;overflow:hidden;max-height:3em;color:var(--bs-ink-2);font-size:var(--bs-fs-s);line-height:1.5}
.bs-meta-part{white-space:nowrap}
.bs-desc,.bs-note{display:-webkit-box;overflow:hidden;margin:12px 0 0;color:var(--bs-ink-2);font-size:var(--bs-fs-s);line-height:1.6;-webkit-box-orient:vertical;-webkit-line-clamp:3}
.bs-note{color:var(--bs-ink)}
.bs-progress{margin-top:12px}
.bs-progress-meta{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;color:var(--bs-ink-2);font-size:var(--bs-fs-s);font-variant-numeric:tabular-nums}
.bs-track{height:4px;overflow:hidden;border-radius:999px;background:var(--bs-sunken)}
.bs-fill{display:block;height:100%;border-radius:inherit;background:var(--bs-accent);transition:width .3s ease}
.bs-mini-stars{display:inline-block;color:var(--bs-ink);font-size:var(--bs-fs-s);letter-spacing:.1em;line-height:1.5;white-space:nowrap}
.bs-card>.bs-mini-stars{margin-top:8px}
.bs-mini-stars .is-off{color:var(--bs-ink-2)}
.bs-tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
.bs-tag{display:inline-flex;align-items:center;gap:6px;max-width:100%;min-height:24px;overflow:hidden;padding:0 8px;border:none;border-radius:999px;background:var(--bs-sunken);color:var(--bs-ink-2);font-size:var(--bs-fs-s);text-overflow:ellipsis;white-space:nowrap;cursor:pointer}
.bs-tag:hover{background:var(--bs-hover);color:var(--bs-ink)}
.bs-tag.is-excerpts{background:transparent;padding:0 2px}
span.bs-tag{cursor:default}
.bs-tag-count{font-variant-numeric:tabular-nums}
.bs-card-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:12px}
.bs-status-select{height:28px;max-width:140px;padding:0 26px 0 10px;border:1px solid var(--bs-line);border-radius:var(--bs-r-s);outline:none;appearance:none;background:transparent;color:var(--bs-ink-2);font-size:var(--bs-fs-s);cursor:pointer}
.bs-status-select:hover{border-color:var(--bs-line-strong);color:var(--bs-ink)}
.bs-date{color:var(--bs-ink-2);font-size:var(--bs-fs-s);font-variant-numeric:tabular-nums;white-space:nowrap}
.bs-empty-add{display:flex;align-items:center;justify-content:center;gap:6px;min-height:68px;padding:12px;border:1px dashed var(--bs-line-strong);border-radius:var(--bs-r-l);background:transparent;color:var(--bs-ink-2);font-size:var(--bs-fs-m);cursor:pointer}
.bs-empty-add:hover{background:var(--bs-sunken);color:var(--bs-ink)}
.bs-welcome{display:flex;flex-direction:column;align-items:stretch;justify-content:center;gap:8px;flex:1;max-width:440px;margin:0 auto;padding:48px 24px;text-align:center}
.bs-welcome-icon{display:inline-flex;align-self:center;margin-bottom:8px;color:var(--bs-ink-2)}
.bs-welcome-title{margin:0;font-size:var(--bs-fs-l);font-weight:600;line-height:1.4}
.bs-welcome-hint{margin:0;text-wrap:balance;color:var(--bs-ink-2);font-size:var(--bs-fs-m);line-height:1.6}
.bs-welcome-actions{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-top:16px}
.bs-flat{display:flex;flex-direction:column;flex:1;min-height:0;padding:20px var(--bs-gutter) 0}
.bs-tabs{display:flex;align-items:center;gap:4px;flex:none;padding-bottom:12px;border-bottom:1px solid var(--bs-line);overflow-x:auto}
.bs-tablist{display:flex;align-items:center;gap:4px}
.bs-tabs-spacer{flex:1}
.bs-tab{display:inline-flex;align-items:center;gap:6px;height:var(--bs-control);padding:0 10px;border:none;border-radius:var(--bs-r-m);background:transparent;color:var(--bs-ink-2);font-size:var(--bs-fs-m);white-space:nowrap;cursor:pointer}
.bs-tab:hover{background:var(--bs-hover);color:var(--bs-ink)}
.bs-tab[aria-selected="true"]{background:var(--bs-sunken);color:var(--bs-ink);font-weight:600}
.bs-tab[data-status="reading"] svg{color:var(--bs-accent)}
.bs-tabs .bs-col-add{flex:none;margin-left:0}
.bs-flat-body{display:flex;flex-direction:column;flex:1;min-height:0;overflow-y:auto;padding:8px 0 24px;scrollbar-width:thin;scrollbar-color:var(--bs-line-strong) transparent}
.bs-flat-body>.bs-empty-add{margin-top:8px}
.bs-list{display:flex;flex-direction:column}
.bs-list-row{display:grid;grid-template-columns:28px minmax(160px,2fr) minmax(0,1.4fr) 132px auto 112px;align-items:center;gap:12px;padding:8px;border-bottom:1px solid var(--bs-line)}
.bs-list-row:hover{background:var(--bs-sunken)}
.bs-list-row.is-syncing .bs-list-main{animation:bs-pulse 1.2s ease-in-out infinite}
.bs-list-main{display:flex;flex-direction:column;justify-content:center;min-width:0;min-height:40px;padding:0;border:none;background:transparent;text-align:left;cursor:pointer}
.bs-list-title{overflow:hidden;font-size:var(--bs-fs-m);font-weight:600;line-height:1.4;text-overflow:ellipsis;white-space:nowrap}
.bs-list-author{overflow:hidden;color:var(--bs-ink-2);font-size:var(--bs-fs-s);text-overflow:ellipsis;white-space:nowrap}
.bs-list-tags{display:flex;gap:4px;min-width:0;overflow:hidden}
.bs-list-tags .bs-tag{flex:none}
.bs-list-state{display:flex;align-items:center;min-width:0}
.bs-row-progress{display:flex;align-items:center;gap:8px;width:100%;color:var(--bs-ink-2);font-size:var(--bs-fs-s);font-variant-numeric:tabular-nums;white-space:nowrap}
.bs-row-progress .bs-track{flex:1}
.bs-list-date{text-align:right}
.bs-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:24px 16px;padding-top:12px}
.bs-tile{display:flex;flex-direction:column;gap:4px;min-width:0;padding:0;border:none;background:transparent;text-align:left;cursor:pointer}
.bs-tile-cover{position:relative;display:block;margin-bottom:4px}
.bs-tile.is-syncing .bs-tile-cover{animation:bs-pulse 1.2s ease-in-out infinite}
.bs-cover.bs-cover-tile{width:100%;height:auto;aspect-ratio:2/3;border-radius:4px 8px 8px 4px}
.bs-cover.bs-cover-tile::after{left:58%}
.bs-tile-badge{position:absolute;top:6px;left:6px;z-index:3;display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:rgba(0,0,0,.5);color:#fff}
.bs-tile[data-status="reading"] .bs-tile-badge{background:var(--bs-accent);color:var(--bs-on-accent)}
.bs-tile-progress{position:absolute;right:6px;bottom:6px;left:6px;z-index:3;height:4px;overflow:hidden;border-radius:999px;background:rgba(255,255,255,.6)}
.bs-tile-progress span{display:block;height:100%;border-radius:inherit;background:var(--bs-accent)}
.bs-tile-title{display:-webkit-box;overflow:hidden;font-size:var(--bs-fs-m);font-weight:600;line-height:1.4;-webkit-box-orient:vertical;-webkit-line-clamp:2}
.bs-tile-sub{overflow:hidden;color:var(--bs-ink-2);font-size:var(--bs-fs-s);text-overflow:ellipsis;white-space:nowrap}
.bs-tile:hover .bs-tile-title{text-decoration:underline;text-decoration-color:var(--bs-line-strong);text-underline-offset:3px}
.bs-more{display:flex;justify-content:center;padding:16px 0 4px;grid-column:1/-1}
.bs-no-results{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;flex:1;padding:48px 24px;text-align:center}
.bs-no-results-icon{display:inline-flex;color:var(--bs-ink-2)}
.bs-no-results-title{margin:0;font-size:var(--bs-fs-l);font-weight:600}
.bs-scrim{position:fixed;inset:0;z-index:90;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--bs-scrim)}
.bs-dialog{display:flex;flex-direction:column;width:min(560px,100%);max-height:min(800px,calc(100vh - 48px));overflow:hidden;border-radius:var(--bs-r-xl);background:var(--bs-surface);box-shadow:var(--bs-shadow);animation:bs-in .16s ease}
.bs-dialog.is-wide{width:min(640px,100%)}
.bs-dialog-head{display:flex;align-items:center;justify-content:space-between;gap:16px;flex:none;padding:20px 24px 0}
.bs-dialog-title{margin:0;font-size:var(--bs-fs-l);font-weight:600;line-height:1.4}
.bs-icon-button{display:inline-flex;align-items:center;justify-content:center;flex:none;width:32px;height:32px;padding:0;border:none;border-radius:var(--bs-r-m);background:transparent;color:var(--bs-ink-2);cursor:pointer}
.bs-icon-button:hover:not(:disabled){background:var(--bs-hover);color:var(--bs-ink)}
.bs-icon-button:disabled{opacity:.35;cursor:default}
.bs-form{display:flex;flex-direction:column;min-height:0;overflow:hidden}
.bs-dialog-body{display:flex;flex-direction:column;gap:20px;min-height:0;overflow-y:auto;padding:20px 24px}
.bs-dialog-text{margin:0;text-wrap:pretty;color:var(--bs-ink-2);font-size:var(--bs-fs-m);line-height:1.6}
.bs-field{display:flex;flex-direction:column;gap:6px;margin:0}
.bs-field-label{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin:0;color:var(--bs-ink-2);font-size:var(--bs-fs-s);font-weight:600}
.bs-field-value{font-variant-numeric:tabular-nums;font-weight:400}
.bs-input,.bs-textarea{width:100%;border:1px solid var(--bs-line-strong);border-radius:var(--bs-r-m);outline:none;background:var(--bs-surface);font-size:var(--bs-fs-m)}
.bs-input{height:36px;padding:0 10px}
.bs-textarea{min-height:80px;padding:8px 10px;line-height:1.6;resize:vertical}
.bs-input[aria-invalid="true"]{border-color:var(--bs-danger)}
.bs-form-error{margin:0;color:var(--bs-danger);font-size:var(--bs-fs-s)}
.bs-seg{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:2px;padding:3px;border-radius:10px;background:var(--bs-sunken)}
.bs-seg-button{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:30px;padding:0 8px;border:none;border-radius:7px;background:transparent;color:var(--bs-ink-2);font-size:var(--bs-fs-m);cursor:pointer}
.bs-seg-button:hover{color:var(--bs-ink)}
.bs-seg-button[aria-pressed="true"]{background:var(--bs-surface);color:var(--bs-ink);font-weight:600}
.bs-range{width:100%;height:24px;margin:0;accent-color:var(--bs-accent);cursor:pointer}
.bs-rating-picker{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.bs-stars{display:flex;align-items:center;gap:2px}
.bs-star-button{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0;border:none;border-radius:var(--bs-r-s);background:transparent;color:var(--bs-ink-2);font-size:var(--bs-fs-l);line-height:1;cursor:pointer}
.bs-star-button.is-on{color:var(--bs-ink)}
.bs-star-button:hover{background:var(--bs-hover)}
.bs-clear-rating{min-height:24px;padding:0 4px;border:none;background:transparent;color:var(--bs-ink-2);font-size:var(--bs-fs-s);cursor:pointer}
.bs-clear-rating:hover{color:var(--bs-ink)}
.bs-dialog-foot{display:flex;align-items:center;gap:8px;flex:none;padding:16px 24px 20px;border-top:1px solid var(--bs-line)}
.bs-foot-spacer{flex:1}
.bs-more-fields{align-self:flex-start;margin-left:-8px}
.bs-hero{display:flex;align-items:flex-start;gap:20px}
.bs-hero-fields{display:flex;flex-direction:column;gap:12px;flex:1;min-width:0}
.bs-lookup{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.bs-lookup-msg{margin:0;color:var(--bs-ink-2);font-size:var(--bs-fs-s);line-height:1.5}
.bs-lookup-msg.is-error{color:var(--bs-danger)}
.bs-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.bs-excerpts{display:flex;flex-direction:column;gap:8px;max-height:240px;margin:0;padding:0;overflow-y:auto;list-style:none}
.bs-excerpt{display:flex;align-items:flex-start;gap:8px;padding:8px 4px 8px 12px;border-left:2px solid var(--bs-line-strong)}
.bs-excerpt-body{flex:1;min-width:0}
.bs-excerpt-text{margin:0;font-size:var(--bs-fs-m);line-height:1.6;white-space:pre-wrap}
.bs-excerpt-meta{display:flex;flex-wrap:wrap;column-gap:8px;margin:4px 0 0;color:var(--bs-ink-2);font-size:var(--bs-fs-s)}
.bs-excerpt-input{min-height:60px}
.bs-excerpt-add{display:grid;grid-template-columns:80px minmax(0,1fr) auto;gap:8px;align-items:center}
.bs-export-grid{display:flex;flex-direction:column;gap:8px}
.bs-export-button{justify-content:flex-start;min-height:40px;text-align:left}
.bs-year{display:flex;align-items:center;justify-content:center;gap:16px}
.bs-year-label{min-width:64px;font-size:var(--bs-fs-l);font-variant-numeric:tabular-nums;font-weight:600;text-align:center}
.bs-stat-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:0}
.bs-stat-tile{display:flex;flex-direction:column;justify-content:flex-start;gap:4px;padding:12px;border-radius:var(--bs-r-l);background:var(--bs-sunken)}
.bs-stat-tile dt{color:var(--bs-ink-2);font-size:var(--bs-fs-s);line-height:1.4}
.bs-stat-tile dd{order:-1;margin:0;font-size:var(--bs-fs-xl);font-variant-numeric:tabular-nums;font-weight:600;line-height:1.2;overflow-wrap:anywhere}
.bs-months{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));align-items:end;gap:4px;height:128px}
.bs-month{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:4px;height:100%;min-width:0}
.bs-month-bar{width:100%;min-height:2px;border-radius:4px 4px 1px 1px;background:var(--bs-accent)}
.bs-month-count,.bs-month-label{color:var(--bs-ink-2);font-size:var(--bs-fs-s);font-variant-numeric:tabular-nums;white-space:nowrap}
.bs-finished-list{display:flex;flex-direction:column;margin:0;padding:0;list-style:none}
.bs-finished-item{display:flex;align-items:center;gap:12px;width:100%;padding:6px 8px;border:none;border-radius:var(--bs-r-m);background:transparent;text-align:left;cursor:pointer}
.bs-finished-item:hover{background:var(--bs-sunken)}
.bs-finished-title{display:flex;flex-direction:column;flex:1;min-width:0;overflow:hidden;font-size:var(--bs-fs-m);font-weight:600;text-overflow:ellipsis;white-space:nowrap}
.bs-finished-title small{overflow:hidden;color:var(--bs-ink-2);font-size:var(--bs-fs-s);font-weight:400;text-overflow:ellipsis}
.bs-drop{border-radius:var(--bs-r-m)}
.bs-drop.is-dragging .bs-textarea{border-color:var(--bs-accent);background:var(--bs-accent-soft)}
.bs-import-text{min-height:168px}
.bs-import-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.bs-import-file{overflow:hidden;max-width:260px;color:var(--bs-ink-2);font-size:var(--bs-fs-s);text-overflow:ellipsis;white-space:nowrap}
.bs-check{display:flex;align-items:center;gap:8px;min-height:24px;font-size:var(--bs-fs-m);cursor:pointer;user-select:none}
.bs-check input{width:16px;height:16px;margin:0;accent-color:var(--bs-accent)}
.bs-import-preview{display:flex;flex-direction:column;gap:8px}
.bs-import-count{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin:0;font-size:var(--bs-fs-m);font-weight:600}
.bs-import-dup{color:var(--bs-ink-2);font-size:var(--bs-fs-s);font-weight:400}
.bs-chips{display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0;list-style:none}
.bs-chip{display:inline-flex;align-items:baseline;gap:6px;max-width:100%;padding:2px 8px;border-radius:999px;background:var(--bs-sunken);font-size:var(--bs-fs-s);line-height:1.6}
.bs-chip strong{overflow:hidden;font-weight:600;text-overflow:ellipsis;white-space:nowrap}
.bs-chip span{color:var(--bs-ink-2);white-space:nowrap}
.bs-chip.is-more{color:var(--bs-ink-2)}
.bs-toast{position:fixed;left:50%;bottom:24px;z-index:95;display:flex;align-items:center;gap:12px;max-width:calc(100vw - 48px);padding:8px 8px 8px 16px;border-radius:var(--bs-r-l);background:var(--bs-ink);color:var(--bs-bg);font-size:var(--bs-fs-m);box-shadow:var(--bs-shadow);transform:translateX(-50%);animation:bs-in .16s ease}
.bs-toast-text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bs-toast .bs-btn{min-height:28px;color:var(--bs-bg);font-weight:600}
.bs-toast .bs-btn:hover{background:color-mix(in srgb,var(--bs-bg) 14%,transparent)}
.bs-toast.is-plain{padding:8px 16px}
@media (max-width:980px){
  .bs-list-row{grid-template-columns:28px minmax(0,1fr) 112px auto}
  .bs-list-tags,.bs-list-date{display:none}
  .bs-board{grid-template-columns:minmax(0,1fr);grid-auto-rows:max-content;align-content:start;gap:32px;overflow-y:auto;padding-bottom:24px}
  .bs-col-body{overflow:visible;flex:none;padding-bottom:0}
}
@media (max-width:640px){
  .bs-search{flex-basis:100%;max-width:none}
  .bs-list-row{grid-template-columns:28px minmax(0,1fr) auto}
  .bs-list-state{display:none}
  .bs-toolbar-spacer{display:none}
  .bs-actions{flex:1 1 100%}
  .bs-actions [data-action]:not([data-action="add"]){width:var(--bs-control);padding:0}
  .bs-actions [data-action]:not([data-action="add"]) span{display:none}
  .bs-actions [data-action="add"]{margin-left:auto}
  .bs-hero>.bs-cover{display:none}
  .bs-hero-fields{width:100%}
  .bs-seg{grid-template-columns:minmax(0,1fr)}
  .bs-row{grid-template-columns:minmax(0,1fr)}
  .bs-stat-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}
  .bs-excerpt-add{grid-template-columns:80px minmax(0,1fr)}
  .bs-scrim{padding:12px}
  .bs-dialog-head{padding:16px 16px 0}
  .bs-dialog-body{padding:16px}
  .bs-dialog-foot{padding:12px 16px 16px}
}
@media (pointer:coarse){
  .bs-page{--bs-control:44px}
  .bs-status-select,.bs-col-add,.bs-icon-button,.bs-star-button,.bs-btn-sm,.bs-toast .bs-btn{min-height:44px;min-width:44px}
  .bs-tag{min-height:32px}
}
@media (prefers-reduced-motion:reduce){
  .bs-page *{transition:none!important;animation:none!important}
}
`

    function SyncBanner({ sync, tt, activeLocale, onStop, onDismiss }) {
      const percent = sync.total === 0 ? 100 : Math.round((sync.done / sync.total) * 100)
      if (sync.running) {
        return h(
          'div',
          { className: 'bs-notice', role: 'status' },
          h('span', { className: 'bs-notice-icon' }, h(SpinnerIcon, { size: 16 })),
          h(
            'div',
            { className: 'bs-notice-body' },
            h(
              'p',
              { className: 'bs-notice-text' },
              h('strong', null, tt('sync.running', { done: formatNumber(sync.done, activeLocale), total: formatNumber(sync.total, activeLocale) })),
              sync.current !== '' &&
                h('span', { className: 'bs-sync-current' }, tt('sync.current', { title: sync.current })),
            ),
            h('div', { className: 'bs-track' }, h('span', { className: 'bs-fill', style: { width: `${percent}%` } })),
          ),
          h('button', { type: 'button', className: 'bs-btn bs-btn-secondary bs-btn-sm', onClick: onStop },
            tt('action.stop')),
        )
      }
      const count = value => formatNumber(value, activeLocale)
      const offline = sync.failed > 0 && sync.updated === 0 && sync.missed === 0
      const parts = []
      if (offline) {
        parts.push(tt('sync.offline'))
      } else {
        parts.push(sync.cancelled
          ? tt('sync.cancelled', { count: count(sync.updated) })
          : plural(tt, sync.updated, 'sync.done', 'sync.doneOne', activeLocale))
        if (sync.missed > 0) parts.push(tt('sync.missed', { count: count(sync.missed) }))
        if (sync.failed > 0) parts.push(tt('sync.failed', { count: count(sync.failed) }))
      }
      return h(
        'div',
        { className: 'bs-notice', role: 'status' },
        h('span', { className: 'bs-notice-icon' }, offline ? h(CloseIcon, { size: 16 }) : h(ReadIcon, { size: 16 })),
        h('p', { className: 'bs-notice-text' }, parts.map((part, index) => h('span', { key: index }, part))),
        h('button', { type: 'button', className: 'bs-btn bs-btn-secondary bs-btn-sm', onClick: onDismiss },
          tt('action.dismiss')),
      )
    }

    /** A floating one-liner; `action` (Undo) is optional. Shadow allowed: it really floats. */
    function Toast({ toast, onAction, onClose }) {
      React.useEffect(() => {
        const timer = setTimeout(onClose, toast.action ? 6000 : 4000)
        return () => clearTimeout(timer)
      }, [toast, onClose])
      return h(
        'div',
        { className: toast.action ? 'bs-toast' : 'bs-toast is-plain', role: 'status' },
        h('span', { className: 'bs-toast-text' }, toast.text),
        toast.action && h('button', { type: 'button', className: 'bs-btn bs-btn-quiet', onClick: onAction }, toast.action),
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
      const [toast, setToast] = React.useState(null)
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
        if (mountedRef.current) setToast({ kind: 'merged', id: Date.now() })
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
              // First Host use: the browser copy (possibly empty) becomes revision 1.
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

      const closeToast = React.useCallback(() => setToast(null), [])

      /** A clean lookup run needs no acknowledgement; misses and failures stay until dismissed. */
      React.useEffect(() => {
        if (sync === null || sync.running || sync.missed > 0 || sync.failed > 0 || sync.cancelled) return undefined
        const timer = setTimeout(() => setSync(null), 4000)
        return () => clearTimeout(timer)
      }, [sync])

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

      /** Delete at once and offer Undo, instead of asking first. */
      function deleteBook() {
        if (dialog.mode !== 'edit') return
        const index = booksRef.current.findIndex(book => book.id === dialog.book.id)
        const removed = booksRef.current[index]
        setBooks(current => current.filter(book => book.id !== dialog.book.id))
        setDialog(null)
        if (removed !== undefined) setToast({ kind: 'deleted', id: Date.now(), book: removed, index })
      }

      function undoDelete() {
        if (toast === null || toast.kind !== 'deleted') return
        const { book, index } = toast
        setBooks(current => {
          if (current.some(item => item.id === book.id)) return current
          const next = current.slice()
          next.splice(Math.min(Math.max(index, 0), next.length), 0, { ...book, updatedAt: Date.now() })
          return next
        })
        setToast(null)
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

      /** Only books never looked up; re-fetching everything would overwrite the user's own edits. */
      function syncAll() {
        if (incomplete.length > 0) runSync(incomplete, false)
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
            h(StatusTabs, { filter: statusFilter, counts: statusCounts, tt, activeLocale, onChange: setStatusFilter, onAdd: addBook }),
            h(
              'div',
              // Keyed so switching view, tab, search, or sort starts back at the top.
              { className: 'bs-flat-body', key: flatReset },
              flatBooks.length === 0
                ? h(EmptyColumn, { status: statusFilter === 'all' ? 'want' : statusFilter, tt, onAdd: () => addBook(statusFilter === 'all' ? 'want' : statusFilter) })
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

      const shelfEmpty = books.length === 0 && storageReady
      const actionButton = (action, icon, label, onClick, extra) => h(
        'button',
        { type: 'button', className: 'bs-btn bs-btn-secondary', 'data-action': action, 'aria-label': label, onClick, ...(extra || {}) },
        icon,
        h('span', null, label),
      )
      let body
      if (shelfEmpty) {
        body = h(EmptyShelf, { tt, onAdd: () => addBook('want'), onImport: () => setDialog({ mode: 'import' }) })
      } else if (searchActive && visibleBooks.length === 0) {
        body = h(
          'div',
          { className: 'bs-no-results' },
          h('span', { className: 'bs-no-results-icon', 'aria-hidden': true }, h(SearchIcon, { size: 32 })),
          h('p', { className: 'bs-no-results-title' }, tt('search.emptyTitle')),
          h('button', { type: 'button', className: 'bs-btn bs-btn-secondary', onClick: () => setQuery('') }, tt('search.clear')),
        )
      } else {
        body = view === 'board' ? h('div', { className: 'bs-board' }, columnNodes) : shelfNode
      }

      return h(
        'div',
        { className: 'bs-page', 'data-dsh-plugin': 'bookshelf' },
        h('style', { 'data-dsh-bookshelf': 'styles' }, CSS),
        h(
          'header',
          { className: 'bs-head' },
          h('h1', { className: 'bs-title' }, tt('panel.title')),
          finishedThisYear > 0 &&
            h('p', { className: 'bs-summary' },
              plural(tt, finishedThisYear, 'panel.finishedThisYear', 'panel.finishedThisYearOne', activeLocale)),
        ),
        !shelfEmpty && h(
          'div',
          { className: 'bs-toolbar' },
          h(
            'div',
            { className: 'bs-search', role: 'search' },
            h('span', { className: 'bs-search-icon', 'aria-hidden': true }, h(SearchIcon, { size: 16 })),
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
            'span',
            { className: 'bs-sort' },
            h(
              'select',
              {
                className: 'bs-sort-select',
                value: sortBy,
                onChange: event => setSortBy(event.target.value),
                'aria-label': tt('sort.label'),
                title: tt('sort.label'),
              },
              SORT_OPTIONS.map(option =>
                h('option', { key: option.id, value: option.id }, tt(option.label)),
              ),
            ),
          ),
          h(ViewSwitch, { view, tt, onChange: changeView }),
          searchActive &&
            h('span', { className: 'bs-toolbar-meta' }, tt('panel.filteredCount', { count: formatNumber(visibleBooks.length, activeLocale) })),
          h('span', { className: 'bs-toolbar-spacer' }),
          h(
            'div',
            { className: 'bs-actions' },
            incomplete.length > 0 &&
              actionButton('lookup', syncing ? h(SpinnerIcon, { size: 16 }) : h(SparkIcon, { size: 16 }), tt('action.lookup'), syncAll, {
                disabled: syncing,
                title: tt('action.lookupHint'),
              }),
            actionButton('stats', h(ChartIcon, { size: 16 }), tt('action.stats'), () => setDialog({ mode: 'stats' })),
            actionButton('import', h(ImportIcon, { size: 16 }), tt('action.import'), () => setDialog({ mode: 'import' }), { title: tt('action.importTitle') }),
            actionButton('export', h(ExportIcon, { size: 16 }), tt('action.export'), () => setDialog({ mode: 'export' }), { title: tt('action.exportTitle') }),
            h('button', { type: 'button', className: 'bs-btn bs-btn-primary', 'data-action': 'add', onClick: () => addBook(view !== 'board' && statusFilter !== 'all' ? statusFilter : 'want') },
              h(PlusIcon, { size: 16 }), h('span', null, tt('action.add'))),
          ),
        ),
        sync !== null &&
          h(SyncBanner, { sync, tt, activeLocale, onStop: stopSync, onDismiss: () => setSync(null) }),
        saveFailed && h('p', { className: 'bs-notice', role: 'status' }, tt('save.failed')),
        body,
        toast !== null &&
          h(Toast, {
            key: toast.id,
            toast: toast.kind === 'deleted'
              ? { text: tt('toast.deleted', { title: toast.book.title }), action: tt('action.undo') }
              : { text: tt('toast.merged') },
            onAction: undoDelete,
            onClose: closeToast,
          }),
        dialog !== null && dialog.mode === 'import' &&
          h(ImportDialog, { books, tt, activeLocale, onClose: closeDialog, onImport: importBooks }),
        dialog !== null && dialog.mode === 'export' &&
          h(ExportDialog, { books, tt, activeLocale, onClose: closeDialog }),
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
            activeLocale,
            onClose: closeDialog,
            onSubmit: submitBook,
            onDelete: deleteBook,
          }),
      )
    }

    // test/ loads this file in a vm and checks these against the Host half.
    if (globalThis.__DSH_BOOKSHELF_TEST__) {
      Object.assign(globalThis.__DSH_BOOKSHELF_TEST__, {
        zh,
        en,
        normalizeBook,
        applyStatus,
        mergeShelves,
        yearStats,
        parseImport,
        exportCsv,
        loadLocalBooks,
        formatNumber,
        plural,
      })
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
