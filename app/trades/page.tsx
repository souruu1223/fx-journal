'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import styles from './page.module.css'

type Side = 'BUY' | 'SELL'

type Trade = {
  id: string
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

type Attachment = {
  id: string
  trade_id: string
  public_url: string
  storage_path: string
  mime_type: string | null
  file_size: number | null
}

export default function TradesPage() {
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  type TradeWithAttachments = Trade & {
    attachments: Attachment[]
  }

  const [trades, setTrades] = useState<TradeWithAttachments[]>([])

  const [searchSymbol, setSearchSymbol] = useState('')
  const [sideFilter, setSideFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const [deletingTradeId, setDeletingTradeId] = useState<string | null>(null)

  const loadTrades = async (userId: string) => {
    const { data: tradeData, error: tradeError } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', userId)
      .order('entry_time', { ascending: false })

    if (tradeError) {
      setMessage('一覧取得エラー: ' + tradeError.message)
      return
    }

    const { data: attachmentData, error: attachmentError } = await supabase
      .from('attachments')
      .select('*')
      .eq('user_id', userId)

    if (attachmentError) {
      setMessage('画像一覧取得エラー: ' + attachmentError.message)
      return
    }

    const tradesOnly = (tradeData as Trade[]) || []
    const attachmentsOnly = (attachmentData as Attachment[]) || []
  
    const mergedTrades: TradeWithAttachments[] = tradesOnly.map((trade) => ({
      ...trade,
      attachments: attachmentsOnly.filter(
        (attachment) => attachment.trade_id === trade.id
      ),
    }))

    setTrades(mergedTrades)
  }

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        await loadTrades(user.id)
      }

      setLoading(false)
    }

    getUser()
  }, [])

  const getTotalProfit = (trade: Trade) => {
    if (trade.price_profit === null && trade.fee === null) return null
    return (trade.price_profit ?? 0) + (trade.fee ?? 0)
  }

  const getStatus = (trade: Trade) => {
    const totalProfit = getTotalProfit(trade)

    if (totalProfit === null) {
      return { label: '未決済', className: styles.statusPending, key: 'pending' }
    }

    if (totalProfit > 0) {
      return { label: '勝ち', className: styles.statusWin, key: 'win' }
    }

    if (totalProfit < 0) {
      return { label: '負け', className: styles.statusLose, key: 'lose' }
    }

    return { label: '同値', className: styles.statusEven, key: 'even' }
  }

  const handleDeleteTrade = async (trade: TradeWithAttachments) => {
    const confirmed = window.confirm('このトレードを削除しますか？')
    if (!confirmed) return

    setMessage('')
    setDeletingTradeId(trade.id)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setMessage('ログインしてください')
      setDeletingTradeId(null)
      return
    }

    const storagePaths = trade.attachments.map((attachment) => attachment.storage_path)

    if (storagePaths.length > 0) {
      const { error: storageError } = await supabase.storage
        .from('trade-screenshots')
        .remove(storagePaths)

      if (storageError) {
        setMessage('画像削除エラー: ' + storageError.message)
        setDeletingTradeId(null)
        return
      }
    }

    if (trade.attachments.length > 0) {
      const attachmentIds = trade.attachments.map((attachment) => attachment.id)

      const { error: attachmentError } = await supabase
        .from('attachments')
        .delete()
        .in('id', attachmentIds)

      if (attachmentError) {
        setMessage('画像情報削除エラー: ' + attachmentError.message)
        setDeletingTradeId(null)
        return
      }
    }

    const { error: tradeError } = await supabase
      .from('trades')
      .delete()
      .eq('id', trade.id)

    if (tradeError) {
      setMessage('トレード削除エラー: ' + tradeError.message)
      setDeletingTradeId(null)
      return
    }

    setMessage('トレードを削除しました')
    setDeletingTradeId(null)
    await loadTrades(user.id)
  }



  const formatDate = (value: string) => {
    const date = new Date(value)
    return date.toLocaleDateString('ja-JP')
  }

  const formatTime = (value: string | null) => {
    if (!value) return '—'
    const date = new Date(value)
    return date.toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const filteredTrades = useMemo(() => {
    return trades.filter((trade) => {
      const symbolMatch =
        searchSymbol === '' ? true : trade.symbol === searchSymbol

      const sideMatch =
        sideFilter === 'all' ? true : trade.side === sideFilter

      const status = getStatus(trade)
      const statusMatch =
        statusFilter === 'all' ? true : status.key === statusFilter

      const tradeDate = new Date(trade.entry_time)
      const startMatch = startDate
        ? tradeDate >= new Date(`${startDate}T00:00:00`)
        : true
      const endMatch = endDate
        ? tradeDate <= new Date(`${endDate}T23:59:59`)
        : true

      return symbolMatch && sideMatch && statusMatch && startMatch && endMatch
    })
  }, [trades, searchSymbol, sideFilter, statusFilter, startDate, endDate])

  const resetFilters = () => {
    setSearchSymbol('')
    setSideFilter('all')
    setStatusFilter('all')
    setStartDate('')
    setEndDate('')
  }

  if (loading) {
    return <main className={styles.loading}>読み込み中...</main>
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>トレード一覧</h1>
            <p className={styles.subtitle}>表形式でまとめて確認できます</p>
          </div>

          <div className={styles.headerActions}>
            <Link href="/" className={styles.secondaryLink}>
              TOPへ戻る
            </Link>
            <Link href="/trades/new" className={styles.primaryLink}>
              新規トレード登録
            </Link>
          </div>
        </div>

        {message && <p className={styles.message}>{message}</p>}

        <section className={styles.filterCard}>
          <div className={styles.filterGrid}>
            <div className={styles.filterItem}>
              <label className={styles.filterLabel}>通貨ペア</label>
              <select
                value={searchSymbol}
                onChange={(e) => setSearchSymbol(e.target.value)}
                className={styles.filterInput}
              >
                <option value="">すべて</option>
                {Array.from(new Set(trades.map((trade) => trade.symbol))).map((symbol) => (
                  <option key={symbol} value={symbol}>
                    {symbol}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.filterItem}>
              <label className={styles.filterLabel}>売買</label>
              <select
                value={sideFilter}
                onChange={(e) => setSideFilter(e.target.value)}
                className={styles.filterInput}
              >
                <option value="all">すべて</option>
                <option value="BUY">BUY</option>
                <option value="SELL">SELL</option>
              </select>
            </div>

            <div className={styles.filterItem}>
              <label className={styles.filterLabel}>状態</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className={styles.filterInput}
              >
                <option value="all">すべて</option>
                <option value="win">勝ち</option>
                <option value="lose">負け</option>
                <option value="even">同値</option>
                <option value="pending">未決済</option>
              </select>
            </div>

            <div className={styles.filterItem}>
              <label className={styles.filterLabel}>開始日</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={styles.filterInput}
              />
            </div>

            <div className={styles.filterItem}>
              <label className={styles.filterLabel}>終了日</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={styles.filterInput}
              />
            </div>
          </div>

          <div className={styles.filterActions}>
            <p className={styles.resultCount}>
              表示件数: {filteredTrades.length} / {trades.length}
            </p>

            <button
              type="button"
              onClick={resetFilters}
              className={styles.resetButton}
            >
              絞り込みをリセット
            </button>
          </div>
        </section>

        {filteredTrades.length === 0 ? (
          <div className={styles.emptyBox}>条件に合うトレードがありません</div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>エントリー日付</th>
                  <th>時間</th>
                  <th>通貨ペア</th>
                  <th>状態</th>
                  <th>売買</th>
                  <th>価格</th>
                  <th>リスクリワード</th>
                  <th>決済時間</th>
                  <th>決済価格</th>
                  <th>損益</th>
                  <th>詳細</th>
                  <th>削除</th>
                </tr>
              </thead>
              <tbody>
                {filteredTrades.map((trade) => {
                  const totalProfit = getTotalProfit(trade)
                  const status = getStatus(trade)

                  return (
                    <tr key={trade.id}>
                      <td>{formatDate(trade.entry_time)}</td>
                      <td>{formatTime(trade.entry_time)}</td>
                      <td className={styles.symbolCell}>{trade.symbol}</td>
                      <td>
                        <span className={`${styles.statusBadge} ${status.className}`}>
                          {status.label}
                        </span>
                      </td>
                      <td>
                        <span
                          className={
                            trade.side === 'BUY' ? styles.buyBadge : styles.sellBadge
                          }
                        >
                          {trade.side}
                        </span>
                      </td>
                      <td>{trade.entry_price}</td>
                      <td>{trade.risk_reward ?? '—'}</td>
                      <td>{formatTime(trade.exit_time)}</td>
                      <td>{trade.exit_price ?? '—'}</td>
                      <td
                        className={
                          totalProfit === null
                            ? styles.profitPending
                            : totalProfit > 0
                            ? styles.profitWin
                            : totalProfit < 0
                            ? styles.profitLose
                            : styles.profitEven
                        }
                      >
                        {totalProfit !== null ? totalProfit.toLocaleString() : '—'}
                      </td>
                      <td>
                        <Link
                          href={`/trades/${trade.id}`}
                          className={styles.detailLink}
                        >
                          詳細
                        </Link>
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => handleDeleteTrade(trade)}
                          disabled={deletingTradeId === trade.id}
                          className={styles.deleteButton}
                        >
                          {deletingTradeId === trade.id ? '削除中...' : '削除'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  )
}