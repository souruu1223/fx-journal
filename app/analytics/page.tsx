'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { supabase } from '../../lib/supabaseClient'
import styles from './page.module.css'

type Side = 'BUY' | 'SELL'
type GraphMode = 'profit' | 'balance'

type Trade = {
  id: string
  user_id: string
  symbol: string
  side: Side
  entry_time: string
  entry_price: number
  exit_time: string | null
  exit_price: number | null
  risk_reward: number | null
  price_profit: number | null
  fee: number | null
  size: number
  note: string | null
  created_at: string
}

type ChartRow = {
  xKey: string
  dateLabel: string
  fullDate: string
  cumulativeProfit: number
  balance: number
  tradeProfit: number
  symbol: string
  pointType: 'trade' | 'capital'
  capitalAmount: number
  label: string
}

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [trades, setTrades] = useState<Trade[]>([])
  const [initialBalance, setInitialBalance] = useState<number | null>(null)
  const [graphMode, setGraphMode] = useState<GraphMode>('profit')

  const [capitalEvents, setCapitalEvents] = useState<any[]>([])

  useEffect(() => {
    let isMounted = true

    const loadData = async () => {
      try {
        setMessage('')

        const {
          data: { session },
        } = await supabase.auth.getSession()

        const user = session?.user ?? null

        if (!isMounted) return

        if (!user) {
          setMessage('ログインしてください')
          setTrades([])
          setInitialBalance(null)
          setCapitalEvents([])
          return
        }

        const { data: tradeData, error: tradeError } = await supabase
          .from('trades')
          .select('*')
          .eq('user_id', user.id)
          .order('entry_time', { ascending: true })
  
        if (tradeError) {
          throw new Error('グラフ用データ取得エラー: ' + tradeError.message)
        }
  
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('initial_balance')
          .eq('user_id', user.id)
          .maybeSingle()
  
        if (profileError) {
          throw new Error('初期資金取得エラー: ' + profileError.message)
        }
  
        const { data: capitalData, error: capitalError } = await supabase
          .from('capital_events')
          .select('*')
          .eq('user_id', user.id)
          .order('event_date', { ascending: true })
  
        if (capitalError) {
          throw new Error('追加資金取得エラー: ' + capitalError.message)
        }
  
        if (!isMounted) return
  
        setTrades((tradeData as Trade[]) || [])
        setInitialBalance(
          profileData?.initial_balance !== null &&
            profileData?.initial_balance !== undefined
            ? Number(profileData.initial_balance)
            : null
        )
        setCapitalEvents(capitalData || [])
      } catch (error) {
        console.error('analytics error:', error)
  
        if (!isMounted) return
  
        setMessage(
          error instanceof Error ? error.message : 'データ取得エラー'
        )
        setTrades([])
        setCapitalEvents([])
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }
  
    loadData()
  
    return () => {
      isMounted = false
    }
  }, [])

  const chartData = useMemo<ChartRow[]>(() => {
    const closedTrades = trades
      .filter((trade) => trade.price_profit !== null || trade.fee !== null)
      .map((trade) => ({
        type: 'trade' as const,
        time: new Date(trade.entry_time).getTime(),
        entry_time: trade.entry_time,
        trade,
      }))

    const capitalItems = capitalEvents.map((event) => ({
      type: 'capital' as const,
      time: new Date(event.event_date).getTime(),
      event,
    }))

    const merged = [...closedTrades, ...capitalItems].sort((a, b) => a.time - b.time)

    let cumulativeProfit = 0
    let balance = initialBalance ?? 0
  
    return merged.map((item, index) => {
      if (item.type === 'trade') {
        const tradeProfit =
          (item.trade.price_profit ?? 0) + (item.trade.fee ?? 0)
  
        cumulativeProfit += tradeProfit
      balance += tradeProfit

        return {
          xKey: `${item.trade.entry_time}-trade-${index}`,
          dateLabel: new Date(item.trade.entry_time).toLocaleDateString('ja-JP', {
            month: 'numeric',
            day: 'numeric',
          }),
          fullDate: new Date(item.trade.entry_time).toLocaleString('ja-JP'),
          cumulativeProfit,
          balance,
          tradeProfit,
          symbol: item.trade.symbol,
          pointType: 'trade' as const,
          capitalAmount: 0,
          label: `トレード ${item.trade.symbol}`,
        }
      }

      balance += Number(item.event.amount)

      return {
        xKey: `${item.event.event_date}-capital-${index}`,
        dateLabel: new Date(item.event.event_date).toLocaleDateString('ja-JP', {
          month: 'numeric',
          day: 'numeric',
        }),
        fullDate: new Date(item.event.event_date).toLocaleString('ja-JP'),
        cumulativeProfit,
        balance,
        tradeProfit: 0,
        symbol: '',
        pointType: 'capital' as const,
        capitalAmount: Number(item.event.amount),
        label: `追加資金 ${Number(item.event.amount).toLocaleString()}`,
      }
    })
  }, [trades, initialBalance, capitalEvents])

  const summary = useMemo(() => {
    const closedTrades = trades.filter(
      (trade) => trade.price_profit !== null || trade.fee !== null
    )

    const totalProfit = closedTrades.reduce((sum, trade) => {
      return sum + (trade.price_profit ?? 0) + (trade.fee ?? 0)
    }, 0)

    const maxProfit =
      chartData.length > 0
        ? Math.max(...chartData.map((row) => row.cumulativeProfit))
        : 0

    const minProfit =
      chartData.length > 0
        ? Math.min(...chartData.map((row) => row.cumulativeProfit))
        : 0

    const totalAddedCapital = capitalEvents.reduce((sum, event) => {
      return sum + Number(event.amount)
    }, 0)

    const totalInvestment = (initialBalance ?? 0) + totalAddedCapital
  
    const latestBalance =
      chartData.length > 0
        ? chartData[chartData.length - 1].balance
        : totalInvestment
  
    return {
      totalTrades: closedTrades.length,
      totalProfit,
      maxProfit,
      minProfit,
      totalAddedCapital,
      totalInvestment,
      latestBalance,
    }
  }, [trades, chartData, initialBalance, capitalEvents])

  const getProfitClassName = (value: number) => {
    if (value > 0) return styles.profitPositive
    if (value < 0) return styles.profitNegative
    return styles.profitNeutral
  }

  if (loading) {
    return <main className={styles.loading}>読み込み中...</main>
  }

  const renderCustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || payload.length === 0) return null

    const row = payload[0].payload as ChartRow

    const diffValue =
      row.pointType === 'capital' ? row.capitalAmount : row.tradeProfit
  
    const diffLabel =
      row.pointType === 'capital' ? '入金額' : '損益'
  
    const diffText =
      diffValue > 0
        ? `+${diffValue.toLocaleString()}`
        : diffValue < 0
        ? `${diffValue.toLocaleString()}`
        : '0'
  
    const bottomLabel = graphMode === 'profit' ? '累計損益' : '全体収支'
    const bottomValue =
      graphMode === 'profit' ? row.cumulativeProfit : row.balance
  
    return (
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: '12px',
          boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)',
          padding: '12px 14px',
          minWidth: '220px',
        }}
      >
        <p style={{ margin: 0, color: '#111827', fontWeight: 700 }}>
          {row.pointType === 'capital'
            ? `日時: ${row.fullDate} / 追加資金`
            : `日時: ${row.fullDate} / 通貨ペア: ${row.symbol}`}
        </p>
  
        <p
          style={{
            margin: '8px 0 0',
            color: diffValue >= 0 ? '#16a34a' : '#dc2626',
            fontWeight: 700,
          }}
        >
          {diffLabel}: {diffText}
        </p>
  
        <p style={{ margin: '8px 0 0', color: '#374151' }}>
          {bottomLabel}: {bottomValue.toLocaleString()}
        </p>
      </div>
    )
  }

  const graphTitle =
    graphMode === 'profit' ? '累積損益グラフ' : '全体収支グラフ'

  const graphDescription =
    graphMode === 'profit'
      ? '各トレードの損益を足し上げた推移です'
      : '初期資金を含めた残高推移です'

  const lineDataKey = graphMode === 'profit' ? 'cumulativeProfit' : 'balance'
  const lineName = graphMode === 'profit' ? '累積損益' : '全体収支'

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>グラフ</h1>
            <p className={styles.subtitle}>損益と全体収支を切り替えて確認できます</p>
          </div>

          <div className={styles.headerActions}>
            <Link href="/" className={styles.secondaryLink}>
              TOPへ戻る
            </Link>

            <Link href="/trades" className={styles.secondaryLink}>
              一覧を見る
            </Link>
          </div>
        </div>

        {message && <p className={styles.message}>{message}</p>}

        <section className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <p className={styles.cardLabel}>決済済み件数</p>
            <p className={styles.cardValue}>{summary.totalTrades}</p>
          </div>

          <div className={styles.summaryCard}>
            <p className={styles.cardLabel}>合計損益</p>
            <p className={`${styles.cardValue} ${getProfitClassName(summary.totalProfit)}`}>
              {summary.totalProfit.toLocaleString()}
            </p>
          </div>

          <div className={styles.summaryCard}>
            <p className={styles.cardLabel}>投資資金合計</p>

            <p className={styles.cardValue}>
              {summary.totalInvestment.toLocaleString()}
            </p>

            <p className={styles.cardSubText}>
              初期: {(initialBalance ?? 0).toLocaleString()} / 追加: {summary.totalAddedCapital.toLocaleString()}
            </p>
          </div>

          <div className={styles.summaryCard}>
            <p className={styles.cardLabel}>現在残高</p>
            <p className={styles.cardValue}>
              {summary.latestBalance.toLocaleString()}
            </p>
          </div>
        </section>

        <section className={styles.chartCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>{graphTitle}</h2>
              <p className={styles.sectionSubtext}>{graphDescription}</p>
            </div>

            <div className={styles.toggleRow}>
              <button
                type="button"
                onClick={() => setGraphMode('profit')}
                className={
                  graphMode === 'profit'
                    ? `${styles.toggleButton} ${styles.toggleButtonActive}`
                    : styles.toggleButton
                }
              >
                損益のみ
              </button>

              <button
                type="button"
                onClick={() => setGraphMode('balance')}
                className={
                  graphMode === 'balance'
                    ? `${styles.toggleButton} ${styles.toggleButtonActive}`
                    : styles.toggleButton
                }
              >
                全体収支
              </button>
            </div>
          </div>

          {chartData.length === 0 ? (
            <p className={styles.emptyText}>決済済みトレードがまだありません</p>
          ) : (
            <div className={styles.chartArea}>
              <ResponsiveContainer width="100%" height={460}>
                <LineChart
                  key={graphMode}
                  data={chartData}
                  margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="xKey"
                    tick={{ fontSize: 12 }}
                    tickFormatter={(_, index) => {
                      const row = chartData[index]
                      return row ? row.dateLabel : ''
                    }}
                  />
                  <YAxis tick={{ fontSize: 12 }} />

                  <Tooltip content={renderCustomTooltip} />

                  <Line
                    type="monotone"
                    dataKey={lineDataKey}
                    stroke="#2563eb"
                    strokeWidth={3}
                    isAnimationActive={false}
                    dot={(props: any) => {
                      const { cx, cy, payload } = props
                  
                      if (payload.pointType === 'capital' && graphMode === 'balance') {
                        return (
                          <circle
                            cx={cx}
                            cy={cy}
                            r={6}
                            fill="#16a34a"
                            stroke="#ffffff"
                            strokeWidth={2}
                          />
                        )
                      }

                      return (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={4}
                          fill="#2563eb"
                        />
                      )
                    }}
                    activeDot={{ r: 6 }}
                    name={lineName}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        {chartData.length > 0 && (
          <section className={styles.recentCard}>
            <h2 className={styles.sectionTitle}>直近の損益</h2>

            <div className={styles.recentGrid}>
              {chartData.slice(-4).reverse().map((row, index) => (
                <div
                  key={`${row.fullDate}-${index}`}
                  className={styles.recentItem}
                >
                  <p className={styles.recentDate}>{row.fullDate}</p>
                  <p className={styles.recentSymbol}>{row.symbol}</p>
                  <p className={`${styles.recentProfit} ${getProfitClassName(row.tradeProfit)}`}>
                    {row.tradeProfit.toLocaleString()}
                  </p>
                  <p className={styles.recentCumulative}>
                    累積損益: {row.cumulativeProfit.toLocaleString()}
                  </p>
                  <p className={styles.recentCumulative}>
                    全体収支: {row.balance.toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}