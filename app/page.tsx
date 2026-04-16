'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import styles from './page.module.css'

type Side = 'BUY' | 'SELL'

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

export default function Home() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [trades, setTrades] = useState<Trade[]>([])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [dashboardMemo, setDashboardMemo] = useState('')
  const [isSavingMemo, setIsSavingMemo] = useState(false)

  const [initialBalance, setInitialBalance] = useState<number | null>(null)

  const loadTrades = async (userId: string) => {
    const { data, error } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', userId)
      .order('entry_time', { ascending: false })

    if (error) {
      setMessage('一覧取得エラー: ' + error.message)
      return
    }

    setTrades((data as Trade[]) || [])
  }

  const loadProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      setMessage('メモ取得エラー: ' + error.message)
      return
    }

    setDashboardMemo(data?.dashboard_memo || '')
    setInitialBalance(
      data?.initial_balance !== null && data?.initial_balance !== undefined
        ? Number(data.initial_balance)
        : null
    )
  }

  useEffect(() => {
    let isMounted = true

    const initialize = async () => {
      try {
        setMessage('')

        const timeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('auth timeout')), 5000)
        )

        const sessionResult = await Promise.race([
          supabase.auth.getSession(),
          timeout,
        ])

        const {
          data: { session },
        } = sessionResult as Awaited<ReturnType<typeof supabase.auth.getSession>>

        const currentUser = session?.user ?? null

        if (!isMounted) return

        if (!currentUser) {
          setUser(null)
          setTrades([])
          setDashboardMemo('')
          setInitialBalance(null)
          return
        }

        const {
          data: { user: verifiedUser },
          error: userError,
        } = await supabase.auth.getUser()

        if (userError || !verifiedUser) {
          await supabase.auth.signOut()

          if (!isMounted) return

          setUser(null)
          setTrades([])
          setDashboardMemo('')
          setInitialBalance(null)
          setMessage('セッションを更新しました。もう一度ログインしてください。')
          return
        }

        setUser(verifiedUser)
        await loadTrades(verifiedUser.id)
        await loadProfile(verifiedUser.id)
      } catch (error) {
        console.error('TOP initialize error:', error)
    
        await supabase.auth.signOut()

        if (!isMounted) return

        setUser(null)
        setTrades([])
        setDashboardMemo('')
        setInitialBalance(null)
        setMessage('認証状態をリセットしました。もう一度ログインしてください。')
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    initialize()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const currentUser = session?.user ?? null

      if (!isMounted) return
    
      try {
        setMessage('')

        if (!currentUser) {
          setUser(null)
          setTrades([])
          setDashboardMemo('')
          setInitialBalance(null)
          return
        }
    
        // 🔥 ここ追加（重要）
        const {
          data: { user: verifiedUser },
          error: userError,
        } = await supabase.auth.getUser()

        if (userError || !verifiedUser) {
          await supabase.auth.signOut()

          if (!isMounted) return

          setUser(null)
          setTrades([])
          setDashboardMemo('')
          setInitialBalance(null)
          setMessage('セッションを更新しました。再ログインしてください。')
          return
       }

        setUser(verifiedUser)

        await loadTrades(verifiedUser.id)
        await loadProfile(verifiedUser.id)
      } catch (error) {
        console.error('auth state change error:', error)

        if (!isMounted) return
    
        setMessage('認証状態の更新でエラーが発生しました')
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  const handleSignUp = async () => {
    setMessage('')

    const { error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) {
      setMessage('新規登録エラー: ' + error.message)
      return
    }

    setMessage('新規登録できました。次にログインしてください。')
  }

  const handleSignIn = async () => {
    setMessage('')

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setMessage('ログインエラー: ' + error.message)
      return
    }

    window.location.reload()
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    setMessage('ログアウトしました')
  }

  const handleSaveMemo = async () => {
    if (!user) {
      setMessage('ログインしてください')
      return
    }

    setMessage('')
    setIsSavingMemo(true)

    const { error } = await supabase
      .from('profiles')
      .upsert({
        user_id: user.id,
        dashboard_memo: dashboardMemo,
        updated_at: new Date().toISOString(),
      })

    if (error) {
      setMessage('メモ保存エラー: ' + error.message)
      setIsSavingMemo(false)
      return
    }

    setMessage('メモを保存しました')
    setIsSavingMemo(false)
  }

 const summary = useMemo(() => {
   const closedTrades = trades.filter(
     (trade) => trade.price_profit !== null || trade.fee !== null
   )

   const openTrades = trades.filter(
     (trade) => trade.price_profit === null && trade.fee === null
    )

   const totalProfit = closedTrades.reduce((sum, trade) => {
     return sum + (trade.price_profit ?? 0) + (trade.fee ?? 0)
    }, 0)

    const winTrades = closedTrades.filter((trade) => {
      const profit = (trade.price_profit ?? 0) + (trade.fee ?? 0)
      return profit > 0
    })

    const loseTrades = closedTrades.filter((trade) => {
      const profit = (trade.price_profit ?? 0) + (trade.fee ?? 0)
      return profit < 0
    })

    const winRate =
      closedTrades.length > 0
        ? (winTrades.length / closedTrades.length) * 100
        : 0

    const rrTrades = trades.filter((trade) => trade.risk_reward !== null)
    const averageRiskReward =
      rrTrades.length > 0
        ? rrTrades.reduce((sum, trade) => sum + (trade.risk_reward ?? 0), 0) / rrTrades.length
        : 0

    const startingBalance = initialBalance ?? 0

    let balance = startingBalance
    let peakBalance = startingBalance
    let maxDrawdown = 0
    let maxDrawdownPercent = 0

    let currentWinStreak = 0
    let currentLoseStreak = 0
    let maxWinStreak = 0
    let maxLoseStreak = 0

    for (const trade of closedTrades) {
      const profit = (trade.price_profit ?? 0) + (trade.fee ?? 0)

      balance += profit

      if (balance > peakBalance) {
        peakBalance = balance
      }

      const drawdown = peakBalance - balance

      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown
      }

      if (peakBalance > 0) {
        const drawdownPercent = (drawdown / peakBalance) * 100

        if (drawdownPercent > maxDrawdownPercent) {
         maxDrawdownPercent = drawdownPercent
        }
      }

      if (profit > 0) {
        currentWinStreak += 1
        currentLoseStreak = 0
      } else if (profit < 0) {
        currentLoseStreak += 1
        currentWinStreak = 0
      } else {
        currentWinStreak = 0
        currentLoseStreak = 0
      }

      if (currentWinStreak > maxWinStreak) {
        maxWinStreak = currentWinStreak
      }
    
      if (currentLoseStreak > maxLoseStreak) {
        maxLoseStreak = currentLoseStreak
      }
    }
  
    return {
      totalProfit,
      winRate,
      averageRiskReward,
      totalTrades: trades.length,
      winTrades: winTrades.length,
      loseTrades: loseTrades.length,
      openTrades: openTrades.length,
      maxDrawdown,
      maxDrawdownPercent,
      maxWinStreak,
      maxLoseStreak,
    }
  }, [trades, initialBalance])

  if (loading) {
    return <main className={styles.loading}>読み込み中...</main>
  }

  if (!user) {
    return (
      <main className={styles.authWrapper}>
        <div className={styles.authCard}>
          <h1 className={styles.title}>FXトレード記録アプリ</h1>
          <p className={styles.subtitle}>まずはログインしてください</p>

          <div className={styles.authForm}>
            <input
              type="email"
              placeholder="メールアドレス"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={styles.input}
            />

            <input
              type="password"
              placeholder="パスワード"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={styles.input}
            />

            <button onClick={handleSignUp} className={styles.primaryButton}>
              新規登録
            </button>

            <button onClick={handleSignIn} className={styles.secondaryButton}>
              ログイン
            </button>

            {message && <p className={styles.message}>{message}</p>}
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>FXトレード記録アプリ</h1>
            <p className={styles.userText}>ログイン中: {user.email}</p>
          </div>

          <button onClick={handleSignOut} className={styles.logoutButton}>
            ログアウト
          </button>
        </header>

        {message && <p className={styles.message}>{message}</p>}

        <section className={styles.hero}>
          <div>
            <h2 className={styles.heroTitle}>ダッシュボード</h2>
            <p className={styles.heroText}>
              今日の振り返りと次のトレード準備がすぐできるTOPページです。
            </p>
          </div>

          <div className={styles.actionRow}>
            <Link href="/trades/new" className={styles.primaryLink}>
              新規トレード登録
            </Link>
            <Link href="/trades" className={styles.secondaryLink}>
              一覧を見る
            </Link>
            <Link href="/analytics" className={styles.secondaryLink}>
              グラフを見る
            </Link>
            <Link href="/settings" className={styles.secondaryLink}>
              設定
            </Link>
          </div>
        </section>

        <section className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <p className={styles.cardLabel}>勝率</p>
            <p className={styles.cardValue}>{summary.winRate.toFixed(1)}%</p>
          </div>

          <div className={styles.summaryCard}>
            <p className={styles.cardLabel}>平均リスクリワード</p>
            <p className={styles.cardValue}>
              {summary.averageRiskReward > 0
                ? summary.averageRiskReward.toFixed(2)
                : '—'}
            </p>
          </div>

          <div className={styles.summaryCard}>
            <p className={styles.cardLabel}>損益</p>
            <p className={styles.cardValue}>
              {summary.totalProfit.toLocaleString()}
            </p>
          </div>
        </section>

        <section className={styles.infoGrid}>
          <div className={styles.infoCard}>
            <p className={styles.cardLabel}>総トレード数</p>
            <p className={styles.infoValue}>{summary.totalTrades}</p>

            <div className={styles.tradeBreakdown}>
              <p className={styles.infoSubText}>勝ち：{summary.winTrades}</p>
              <p className={styles.infoSubText}>負け：{summary.loseTrades}</p>
              <p className={styles.infoSubText}>未決済：{summary.openTrades}</p>
            </div>
          </div>

          <div className={styles.analysisCard}>
            <p className={styles.cardLabel}>分析</p>
        
            <div className={styles.tradeBreakdown}>
              <p className={styles.infoSubText}>最大DD：{summary.maxDrawdownPercent.toFixed(2)}%</p>
              <p className={styles.infoSubText}>最大連勝：{summary.maxWinStreak}</p>
              <p className={styles.infoSubText}>最大連敗：{summary.maxLoseStreak}</p>
            </div>
          </div>

          <div className={styles.memoCard}>
            <p className={styles.cardLabel}>メモ</p>
            <textarea
              value={dashboardMemo}
              onChange={(e) => setDashboardMemo(e.target.value)}
              placeholder="自分ルール、反省、今日の注意点などを書けます"
              className={styles.memoTextarea}
            />
            <div className={styles.memoActionRow}>
              <button
                type="button"
                onClick={handleSaveMemo}
                disabled={isSavingMemo}
                className={styles.primaryButton}
              >
                {isSavingMemo ? '保存中...' : 'メモを保存'}
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}