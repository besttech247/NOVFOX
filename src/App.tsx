import { useCallback, useEffect, useMemo, useState } from 'react'
import { useScanner } from '@/hooks/useScanner'
import { useJournal } from '@/hooks/useJournal'
import { EXCHANGE_LIST } from '@/lib/exchanges'
import type { ConnStatus, SymbolScan } from '@/types'
import { api } from '@/lib/api'
import { Login } from '@/pages/Login'
import { compareScans, SignalTable, SORT_KEYS, type SortKey } from '@/components/scanner/SignalTable'
import { SignalCards } from '@/components/scanner/SignalCards'
import { AlertsFeed } from '@/components/scanner/AlertsFeed'
import { StatsBar } from '@/components/scanner/StatsBar'
import { SettingsPanel } from '@/components/scanner/SettingsPanel'
import { FiltersPanel } from '@/components/scanner/FiltersPanel'
import { DEFAULT_DISPLAY_FILTERS, type DisplayFilters } from '@/types'
import { BacktestView } from '@/components/scanner/BacktestView'
import { JournalView } from '@/components/scanner/JournalView'
import { HistoryView } from '@/components/scanner/HistoryView'
import { EconView } from '@/components/scanner/EconView'
import { ExchangeIcon } from '@/components/ExchangeIcon'
import { isCommodityOrStock, isGamblingToken, isLendingToken, isMetal, isOil, isStockOrIndex } from '@/lib/tradfi'
import { ArrowDown, ArrowUp, BookOpen, CalendarClock, FlaskConical, History, LayoutList, Loader2, LogOut, Power, Radar, RefreshCcw, Settings2, SlidersHorizontal, Volume2, VolumeX } from 'lucide-react'

type View = 'live' | 'econ' | 'backtest' | 'journal' | 'history'

const SORT_CHIPS: { k: SortKey; label: string }[] = [
  { k: 'score', label: 'النقاط' },
  { k: 'change', label: 'التغير 24س' },
  { k: 'relVol', label: 'الحجم' },
  { k: 'rsi', label: 'RSI' },
  { k: 'updated', label: 'التحديث' },
]

function StatusDot({ status }: { status: ConnStatus }) {
  const map: Record<ConnStatus, { color: string; label: string; pulse: boolean }> = {
    idle: { color: '#71717a', label: 'خامل', pulse: false },
    connecting: { color: '#f5c518', label: 'جارٍ الاتصال', pulse: true },
    open: { color: '#00d9a3', label: 'متصل مباشرة', pulse: true },
    reconnecting: { color: '#f5c518', label: 'إعادة اتصال', pulse: true },
    error: { color: '#ff4d4d', label: 'خطأ', pulse: false },
  }
  const s = map[status]
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-zinc-400">
      <span className="relative flex h-2 w-2">
        {s.pulse && (
          <span
            className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-50"
            style={{ background: s.color }}
          />
        )}
        <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: s.color }} />
      </span>
      <span className="hidden sm:inline">{s.label}</span>
    </span>
  )
}

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const {
    running,
    startScanner,
    stopScanner,
    exchanges,
    setExchanges,
    markets,
    setMarkets,
    market,
    settings,
    setSettings,
    status,
    connStalled,
    loading,
    error,
    scans,
    alerts,
    clearAlerts,
    lastTick,
    demo,
  } = useScanner()
  const [showSettings, setShowSettings] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<DisplayFilters>(() => {
    try {
      const saved = localStorage.getItem('scalp:filters')
      if (saved) return { ...DEFAULT_DISPLAY_FILTERS, ...JSON.parse(saved) }
    } catch {
      /* ignore invalid JSON */
    }
    return DEFAULT_DISPLAY_FILTERS
  })

  const handleFilterChange = useCallback((patch: Partial<DisplayFilters>) => {
    setFilters((prev) => {
      const next = { ...prev, ...patch }
      try {
        localStorage.setItem('scalp:filters', JSON.stringify(next))
      } catch {
        /* ignore storage write failures */
      }
      return next
    })
  }, [])

  const handleResetFilters = useCallback(() => {
    setFilters(DEFAULT_DISPLAY_FILTERS)
    try {
      localStorage.removeItem('scalp:filters')
    } catch {
      /* ignore storage remove failures */
    }
    const patch: Partial<ScannerSettings> = {}
    if (settings.hideTradFi) patch.hideTradFi = false
    if (settings.hideLending) patch.hideLending = false
    if (settings.hideGambling) patch.hideGambling = false
    if (Object.keys(patch).length > 0) setSettings(patch)
  }, [settings.hideTradFi, settings.hideLending, settings.hideGambling, setSettings])

  const activeFilterCount = useMemo(() => {
    let c = 0
    if (settings.hideTradFi || filters.hideMetals || filters.hideOil || filters.hideStocks) c++
    if (filters.hideLending) c++
    if (filters.hideGambling) c++
    if (filters.minScore > 0) c++
    if (filters.strength !== 'all') c++
    if (filters.direction !== 'all') c++
    return c
  }, [settings.hideTradFi, filters])

  const [mobileTab] = useState<'signals' | 'alerts'>('signals')
  const [view, setView] = useState<View>('live')
  const [now, setNow] = useState(() => Date.now())
  const [alertsCollapsed, setAlertsCollapsed] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>(() => {
    const v = localStorage.getItem('scalp:sortKey') ?? ''
    return (SORT_KEYS as string[]).includes(v) ? (v as SortKey) : 'score'
  })
  const [sortDir, setSortDir] = useState<1 | -1>(() => (localStorage.getItem('scalp:sortDir') === 'asc' ? 1 : -1))
  const journal = useJournal()

  const handleSort = useCallback(
    (k: SortKey) => {
      if (k === sortKey) {
        setSortDir((d) => (d === 1 ? -1 : 1))
      } else {
        setSortKey(k)
        setSortDir(k === 'base' ? 1 : -1) // names ascend; numbers default to descending
      }
    },
    [sortKey]
  )

  useEffect(() => {
    localStorage.setItem('scalp:sortKey', sortKey)
    localStorage.setItem('scalp:sortDir', sortDir === 1 ? 'asc' : 'desc')
  }, [sortKey, sortDir])

  const filteredScans = useMemo(() => {
    let list = scans

    // 1. TradFi / Commodities / Stocks
    if (settings.hideTradFi) {
      list = list.filter((s) => !isCommodityOrStock(s.meta.base, s.meta.symbol))
    } else {
      if (filters.hideMetals) {
        list = list.filter((s) => !isMetal(s.meta.base, s.meta.symbol))
      }
      if (filters.hideOil) {
        list = list.filter((s) => !isOil(s.meta.base, s.meta.symbol))
      }
      if (filters.hideStocks) {
        list = list.filter((s) => !isStockOrIndex(s.meta.base, s.meta.symbol))
      }
    }

    // 2. DeFi Lending Tokens
    if (filters.hideLending) {
      list = list.filter((s) => !isLendingToken(s.meta.base, s.meta.symbol))
    }

    // 3. Gambling Tokens
    if (filters.hideGambling) {
      list = list.filter((s) => !isGamblingToken(s.meta.base, s.meta.symbol))
    }

    // 4. Minimum Score
    if (filters.minScore > 0) {
      list = list.filter((s) => s.score >= filters.minScore)
    }

    // 5. Strength
    if (filters.strength === 'strong') {
      list = list.filter((s) => s.strength === 'strong')
    }

    // 6. Direction
    if (filters.direction === 'long') {
      list = list.filter((s) => s.trendUp)
    } else if (filters.direction === 'short') {
      list = list.filter((s) => !s.trendUp)
    }

    return [...list].sort(compareScans(sortKey, sortDir))
  }, [scans, settings.hideTradFi, filters, sortKey, sortDir])

  const filteredAlerts = useMemo(() => {
    let list = alerts
    if (settings.hideTradFi) {
      list = list.filter((a) => !isCommodityOrStock(a.base, a.symbol))
    } else {
      if (filters.hideMetals) {
        list = list.filter((a) => !isMetal(a.base, a.symbol))
      }
      if (filters.hideOil) {
        list = list.filter((a) => !isOil(a.base, a.symbol))
      }
      if (filters.hideStocks) {
        list = list.filter((a) => !isStockOrIndex(a.base, a.symbol))
      }
    }
    if (filters.hideLending) {
      list = list.filter((a) => !isLendingToken(a.base, a.symbol))
    }
    if (filters.hideGambling) {
      list = list.filter((a) => !isGamblingToken(a.base, a.symbol))
    }
    if (filters.strength === 'strong') {
      list = list.filter((a) => a.strength === 'strong')
    }
    return list
  }, [alerts, settings.hideTradFi, filters])

  const webhookReady = settings.webhookUrl.trim().length > 0

  // coin logos: symbol → image URL (server-cached from CoinGecko, 6h TTL);
  // refetch every 30min so a server restart heals without a page reload
  const [icons, setIcons] = useState<Record<string, string>>({})
  useEffect(() => {
    let stop = false
    const load = () =>
      api
        .icons()
        .then((r) => {
          if (!stop && Object.keys(r.icons).length > 0) setIcons(r.icons)
        })
        .catch(() => {})
    load()
    const t = setInterval(load, 30 * 60_000)
    return () => {
      stop = true
      clearInterval(t)
    }
  }, [])
  const handleWebhookSend = useCallback(async (symbol: string): Promise<'ok' | 'err'> => {
    try {
      await api.webhookSend(symbol)
      return 'ok'
    } catch {
      return 'err'
    }
  }, [])

  const handleEnter = (s: SymbolScan) => {
    journal.addEntry({
      symbol: s.meta.symbol,
      base: s.meta.base,
      exchange: s.meta.exchange,
      entryPrice: s.meta.price,
      score: s.score,
      parts: s.parts.filter((p) => p.points > 0).map((p) => p.label),
    })
  }

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const strongCount = filteredScans.filter((s) => s.strength === 'strong').length

  return (
    <div className="flex min-h-screen flex-col bg-[#0a0a0a] text-zinc-200">
      {/* ===== Header ===== */}
      <header
        className="sticky top-0 z-40 border-b border-zinc-800/80 bg-[#0a0a0a]/95 backdrop-blur"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:px-4 sm:py-3">
          {/* brand */}
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#00d9a3]/10 text-[#00d9a3] sm:h-8 sm:w-8">
              <Radar size={16} />
            </span>
            <div>
              <h1 className="font-display text-sm font-bold leading-tight tracking-tight text-white sm:text-[15px]">
                سكانر السكالبنغ
              </h1>
              <p className="hidden text-[10px] leading-tight text-zinc-500 sm:block">إشارات شراء فقط · فريمات 1m و 5m</p>
            </div>
          </div>

          {/* exchange + market switchers */}
          <div className="order-last flex w-full flex-wrap items-center gap-2 sm:order-none sm:ms-1 sm:w-auto sm:flex-nowrap">
            <nav className="flex flex-1 overflow-hidden rounded-md border border-zinc-800 sm:flex-none" aria-label="المنصة">
              {EXCHANGE_LIST.map((ex) => (
                <button
                  key={ex.id}
                  onClick={() => {
                    if (exchanges.includes(ex.id)) {
                      if (exchanges.length > 1) setExchanges(exchanges.filter((e) => e !== ex.id))
                    } else {
                      setExchanges([...exchanges, ex.id])
                    }
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold transition-colors sm:flex-none ${
                    exchanges.includes(ex.id)
                      ? 'bg-[#00d9a3] text-black'
                      : 'text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-200'
                  }`}
                >
                  <ExchangeIcon exchange={ex.id} size={13} className="rounded-sm" />
                  <span>{ex.name}</span>
                </button>
              ))}
            </nav>
            <nav className="flex overflow-hidden rounded-md border border-zinc-800" aria-label="السوق">
              {(
                [
                  { id: 'spot', label: 'سبوت' },
                  { id: 'futures', label: 'فيوتشر' },
                ] as const
              ).map((m) => {
                const active = (markets ?? [market]).includes(m.id)
                return (
                  <button
                    key={m.id}
                    onClick={() => {
                      const cur = markets ?? [market]
                      if (cur.includes(m.id)) {
                        if (cur.length > 1) setMarkets(cur.filter((x) => x !== m.id))
                      } else {
                        setMarkets([...cur, m.id])
                      }
                    }}
                    className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                      active
                        ? m.id === 'futures'
                          ? 'bg-purple-500/20 text-purple-300 shadow-[inset_0_0_0_1px_rgba(168,85,247,0.5)]'
                          : 'bg-[#00d9a3]/15 text-[#00d9a3] shadow-[inset_0_0_0_1px_rgba(0,217,163,0.5)]'
                        : 'text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-200'
                    }`}
                  >
                    {m.label}
                  </button>
                )
              })}
            </nav>
          </div>

          <div className="ms-auto flex items-center gap-1.5 sm:gap-2">
            <StatusDot status={status} />

            {demo && (
              <span className="rounded border border-[#f5c518]/40 bg-[#f5c518]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#f5c518]">
                تجريبي
              </span>
            )}

            {/* master power: full start/stop of the server-side scanner */}
            <button
              onClick={() => (running ? stopScanner() : startScanner())}
              title={running ? 'إيقاف السكانر تماماً' : 'تشغيل السكانر'}
              className={`flex items-center gap-1.5 rounded-md border px-2.5 py-2 text-xs font-bold transition-colors sm:py-2 ${
                running
                  ? 'border-[#00d9a3]/40 bg-[#00d9a3]/10 text-[#00d9a3] hover:bg-[#ff4d4d]/10 hover:text-[#ff4d4d] hover:border-[#ff4d4d]/40'
                  : 'border-zinc-700 bg-zinc-800/60 text-zinc-300 hover:border-[#00d9a3]/40 hover:text-[#00d9a3]'
              }`}
            >
              <Power size={15} />
              <span className="hidden sm:inline">{running ? 'يعمل' : 'متوقف'}</span>
            </button>

            <button
              onClick={() => setSettings({ sound: !settings.sound })}
              title={settings.sound ? 'كتم الصوت' : 'تفعيل الصوت'}
              className={`rounded-md border p-2 transition-colors ${
                settings.sound
                  ? 'border-[#00d9a3]/40 bg-[#00d9a3]/10 text-[#00d9a3]'
                  : 'border-zinc-800 text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {settings.sound ? <Volume2 size={15} /> : <VolumeX size={15} />}
            </button>

            {/* Filters modal */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowFilters((v) => !v)
                  setShowSettings(false)
                }}
                title="فلاتر العرض"
                className={`flex items-center gap-1.5 rounded-md border p-2 text-xs font-semibold transition-colors sm:px-2.5 sm:py-2 ${
                  showFilters || activeFilterCount > 0
                    ? 'border-[#00d9a3]/40 bg-[#00d9a3]/10 text-[#00d9a3]'
                    : 'border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <SlidersHorizontal size={15} />
                <span className="hidden sm:inline">فلاتر</span>
                {activeFilterCount > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[#00d9a3] px-1 text-[10px] font-bold text-black">
                    {activeFilterCount}
                  </span>
                )}
              </button>
              {showFilters && (
                <FiltersPanel
                  hideTradFi={settings.hideTradFi ?? false}
                  onTradFiChange={(val) => setSettings({ hideTradFi: val })}
                  filters={filters}
                  onChange={handleFilterChange}
                  onReset={handleResetFilters}
                  onClose={() => setShowFilters(false)}
                />
              )}
            </div>

            <div className="relative">
              <button
                onClick={() => {
                  setShowSettings((v) => !v)
                  setShowFilters(false)
                }}
                title="الإعدادات"
                className={`rounded-md border p-2 transition-colors ${
                  showSettings
                    ? 'border-[#00d9a3]/40 bg-[#00d9a3]/10 text-[#00d9a3]'
                    : 'border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Settings2 size={15} />
              </button>
              {showSettings && (
                <SettingsPanel settings={settings} onChange={setSettings} onClose={() => setShowSettings(false)} />
              )}
            </div>

            <button
              onClick={() => {
                void api.logout().finally(onLogout)
              }}
              title="تسجيل الخروج"
              className="rounded-md border border-zinc-800 p-2 text-zinc-500 transition-colors hover:border-[#ff4d4d]/40 hover:text-[#ff4d4d]"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>

        <StatsBar scans={filteredScans} lastTick={lastTick} />

        {/* view switcher — horizontally scrollable so five tabs never crush on mobile */}
        <div className="flex overflow-x-auto border-t border-zinc-800/70">
          {(
            [
              { id: 'live', label: 'المسح الحي', icon: <LayoutList size={13} /> },
              { id: 'history', label: 'الأرشيف', icon: <History size={13} /> },
              { id: 'econ', label: 'الأحداث', icon: <CalendarClock size={13} /> },
              { id: 'backtest', label: 'الباك تست', icon: <FlaskConical size={13} /> },
              { id: 'journal', label: 'سجل الصفقات', icon: <BookOpen size={13} /> },
            ] as const
          ).map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={`flex flex-none items-center justify-center gap-1.5 whitespace-nowrap px-3.5 py-2 text-xs font-semibold transition-colors sm:px-5 ${
                view === v.id ? 'bg-zinc-900/60 text-[#00d9a3] shadow-[inset_0_-2px_0_#00d9a3]' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {v.icon} {v.label}
              {v.id === 'live' && strongCount > 0 && (
                <span className="rounded-full bg-[#00d9a3] px-1.5 text-[10px] font-bold text-black">{strongCount}</span>
              )}
              {v.id === 'journal' && journal.entries.filter((e) => e.exitPrice === undefined).length > 0 && (
                <span className="rounded-full bg-[#f5c518] px-1.5 text-[10px] font-bold text-black">
                  {journal.entries.filter((e) => e.exitPrice === undefined).length}
                </span>
              )}
            </button>
          ))}
        </div>
      </header>

      {/* ===== geo-block warning banner ===== */}
      {connStalled && view === 'live' && !error && (
        <div className="border-b border-[#f5c518]/30 bg-[#f5c518]/[0.07] px-4 py-2 text-center text-xs leading-relaxed text-[#f5c518]">
          تعذّر الاتصال اللحظي بإحدى المنصات — قد تكون محظورة في منطقتك.{' '}
          <span className="text-zinc-400">حاول تحديد منصة أخرى.</span>
        </div>
      )}

      {/* ===== Body ===== */}
      {view === 'history' ? (
        <HistoryView icons={icons} />
      ) : view === 'econ' ? (
        <EconView />
      ) : view === 'backtest' ? (
        <BacktestView exchange={exchanges[0]} market={market} settings={settings} />
      ) : view === 'journal' ? (
        <JournalView
          entries={journal.entries}
          scans={filteredScans}
          onClose={journal.closeEntry}
          onRemove={journal.removeEntry}
          onClearClosed={journal.clearClosed}
        />
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-24 text-center">
          <p className="text-sm text-[#ff4d4d]">تعذّر الاتصال بمصدر البيانات: {error}</p>
          <p className="max-w-md text-xs leading-relaxed text-zinc-500">
            قد تكون المنصة تحظر الطلبات من منطقتك. جرّب منصة أخرى من الأعلى أو أعد المحاولة.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 flex items-center gap-2 rounded-md border border-zinc-700 px-4 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            <RefreshCcw size={13} /> إعادة المحاولة
          </button>
        </div>
      ) : !running ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-24 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-800 bg-[#121214] text-zinc-500">
            <Power size={24} />
          </span>
          <p className="text-sm font-semibold text-zinc-300">السكانر متوقف حالياً</p>
          <p className="max-w-md text-xs leading-relaxed text-zinc-500">
            السيرفر لا يسحب أي بيانات الآن — مناسب لأوقات إغلاق الأسواق أو الإجازات. اضغط زر التشغيل لاستئناف المسح
            اللحظي فوراً.
          </p>
          <button
            onClick={startScanner}
            className="mt-2 flex items-center gap-2 rounded-md bg-[#00d9a3] px-5 py-2.5 text-xs font-bold text-black transition-opacity hover:opacity-90"
          >
            <Power size={14} /> تشغيل السكانر
          </button>
        </div>
      ) : (
        <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col lg:flex-row">
          {/* signals: table on desktop, cards on mobile */}
          <section className={`min-w-0 flex-1 ${mobileTab === 'signals' ? '' : 'hidden lg:block'}`}>
            
          {/* Alerts Feed moved to top */}
          <div className="px-2 pt-2 md:px-0 md:pt-0">
            <AlertsFeed
              alerts={filteredAlerts}
              onClear={clearAlerts}
              now={now}
              collapsed={alertsCollapsed}
              onToggleCollapse={() => setAlertsCollapsed((v) => !v)}
              icons={icons}
              market={market}
            />
          </div>

            <div className="hidden md:block">
              <SignalTable
                scans={filteredScans}
                loading={loading}
                onEnter={handleEnter}
                webhookReady={webhookReady}
                onWebhookSend={handleWebhookSend}
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
                icons={icons}
              />
            </div>
            <div className="md:hidden">
              {/* mobile sort chips — cards have no column headers */}
              <div className="flex items-center gap-1.5 overflow-x-auto border-b border-zinc-800/60 px-3 py-2">
                <span className="shrink-0 text-[10px] text-zinc-500">فرز:</span>
                {SORT_CHIPS.map((chip) => {
                  const active = sortKey === chip.k
                  return (
                    <button
                      key={chip.k}
                      onClick={() => handleSort(chip.k)}
                      className={`flex shrink-0 items-center gap-0.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                        active ? 'border-[#00d9a3]/50 bg-[#00d9a3]/10 text-[#00d9a3]' : 'border-zinc-800 text-zinc-500'
                      }`}
                    >
                      {chip.label}
                      {active && (sortDir === 1 ? <ArrowUp size={9} /> : <ArrowDown size={9} />)}
                    </button>
                  )
                })}
              </div>
              <SignalCards scans={filteredScans} loading={loading} onEnter={handleEnter} webhookReady={webhookReady} onWebhookSend={handleWebhookSend} icons={icons} />
            </div>
          </section>
        </main>
      )}

      {/* ===== Footer ===== */}
      <footer
        className="border-t border-zinc-800/70 px-4 py-2.5 text-center text-[10px] leading-relaxed text-zinc-600"
        style={{ paddingBottom: 'calc(0.625rem + env(safe-area-inset-bottom))' }}
      >
        البيانات لحظية عبر WebSocket من المنصة المختارة، يجمعها السيرفر ويعمل 24/7 — بدون مفاتيح API. هذه الأداة للمسح
        الفني فقط وليست نصيحة استثمارية؛ السكالبنغ عالي المخاطر، استخدم وقف خسارة دائماً.
      </footer>
    </div>
  )
}

export default function App() {
  const [auth, setAuth] = useState<'checking' | 'authed' | 'guest'>('checking')

  useEffect(() => {
    api
      .me()
      .then(() => setAuth('authed'))
      .catch(() => setAuth('guest'))
    const onRequired = () => setAuth('guest')
    window.addEventListener('auth:required', onRequired)
    return () => window.removeEventListener('auth:required', onRequired)
  }, [])

  if (auth === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a] text-[#00d9a3]">
        <Loader2 size={26} className="animate-spin" />
      </div>
    )
  }
  if (auth === 'guest') {
    return <Login onSuccess={() => setAuth('authed')} />
  }
  return <Dashboard onLogout={() => setAuth('guest')} />
}
