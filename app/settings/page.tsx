'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import styles from './page.module.css'

type CapitalEvent = {
  id: string
  event_date: string
  amount: number
  note: string | null
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [initialBalance, setInitialBalance] = useState('')

  const [capitalDate, setCapitalDate] = useState('')
  const [capitalAmount, setCapitalAmount] = useState('')
  const [capitalNote, setCapitalNote] = useState('')
  const [capitalEvents, setCapitalEvents] = useState<CapitalEvent[]>([])

  const [editingEventId, setEditingEventId] = useState<string | null>(null)
  const [editCapitalDate, setEditCapitalDate] = useState('')
  const [editCapitalAmount, setEditCapitalAmount] = useState('')
  const [editCapitalNote, setEditCapitalNote] = useState('')

  const formatForDatetimeLocal = (value: string) => {
    const date = new Date(value)
    const offset = date.getTimezoneOffset()
    const localDate = new Date(date.getTime() - offset * 60 * 1000)
    return localDate.toISOString().slice(0, 16)
  }

  const loadCapitalEvents = async (userId: string) => {
    const { data, error } = await supabase
      .from('capital_events')
      .select('*')
      .eq('user_id', userId)
      .order('event_date', { ascending: false })

    if (error) {
      setMessage('追加資金取得エラー: ' + error.message)
      return
    }

    setCapitalEvents((data as CapitalEvent[]) || [])
  }

  useEffect(() => {
    const loadProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        setMessage('ログインしてください')
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('initial_balance')
        .eq('user_id', user.id)
        .maybeSingle()

      await loadCapitalEvents(user.id)

      if (error) {
        setMessage('設定取得エラー: ' + error.message)
        setLoading(false)
        return
      }

      setInitialBalance(
        data?.initial_balance !== null && data?.initial_balance !== undefined
          ? String(data.initial_balance)
          : ''
      )

      setLoading(false)
    }

    loadProfile()
  }, [])

  const handleSave = async () => {
    setMessage('')

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setMessage('ログインしてください')
      return
    }

    const balanceValue = initialBalance ? Number(initialBalance) : null

    if (initialBalance && Number.isNaN(balanceValue)) {
      setMessage('初期資金を正しく入力してください')
      return
    }

    const { error } = await supabase
      .from('profiles')
      .upsert({
        user_id: user.id,
        initial_balance: balanceValue,
        updated_at: new Date().toISOString(),
      })

    if (error) {
      setMessage('保存エラー: ' + error.message)
      return
    }

    setMessage('設定を保存しました')
  }

  const handleSaveCapitalEvent = async () => {
    setMessage('')

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setMessage('ログインしてください')
      return
    }

    if (!capitalDate || !capitalAmount) {
      setMessage('追加日と金額を入力してください')
      return
    }

    const amountValue = Number(capitalAmount)

    if (Number.isNaN(amountValue)) {
      setMessage('金額を正しく入力してください')
      return
    }

    const { error } = await supabase
      .from('capital_events')
      .insert({
        user_id: user.id,
        event_date: new Date(capitalDate).toISOString(),
        amount: amountValue,
        note: capitalNote || null,
      })

    if (error) {
      setMessage('追加資金保存エラー: ' + error.message)
      return
    }

    setMessage('追加資金を保存しました')
    setCapitalDate('')
    setCapitalAmount('')
    setCapitalNote('')
    await loadCapitalEvents(user.id)
  }

  const handleStartEdit = (event: CapitalEvent) => {
    setEditingEventId(event.id)
    setEditCapitalDate(formatForDatetimeLocal(event.event_date))
    setEditCapitalAmount(String(event.amount))
    setEditCapitalNote(event.note || '')
    setMessage('')
  }

  const handleCancelEdit = () => {
    setEditingEventId(null)
    setEditCapitalDate('')
    setEditCapitalAmount('')
    setEditCapitalNote('')
    setMessage('')
  }

  const handleUpdateCapitalEvent = async (eventId: string) => {
    setMessage('')

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setMessage('ログインしてください')
      return
    }

    if (!editCapitalDate || !editCapitalAmount) {
      setMessage('追加日と金額を入力してください')
      return
    }

    const amountValue = Number(editCapitalAmount)

    if (Number.isNaN(amountValue)) {
      setMessage('金額を正しく入力してください')
      return
    }

    const { error } = await supabase
      .from('capital_events')
      .update({
        event_date: new Date(editCapitalDate).toISOString(),
        amount: amountValue,
        note: editCapitalNote || null,
      })
      .eq('id', eventId)
      .eq('user_id', user.id)

    if (error) {
      setMessage('追加資金更新エラー: ' + error.message)
      return
    }

    setMessage('追加資金を更新しました')
    handleCancelEdit()
    await loadCapitalEvents(user.id)
  }

  const handleDeleteCapitalEvent = async (eventId: string) => {
    const confirmed = window.confirm('この追加履歴を削除しますか？')
    if (!confirmed) return

    setMessage('')

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setMessage('ログインしてください')
      return
    }

    const { error } = await supabase
      .from('capital_events')
      .delete()
      .eq('id', eventId)
      .eq('user_id', user.id)

    if (error) {
      setMessage('追加資金削除エラー: ' + error.message)
      return
    }

    setMessage('追加資金を削除しました')

    if (editingEventId === eventId) {
      handleCancelEdit()
    }

    await loadCapitalEvents(user.id)
  }

  if (loading) {
    return <main className={styles.loading}>読み込み中...</main>
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>設定</h1>
            <p className={styles.subtitle}>
              初期資金と追加資金を管理できます
            </p>
          </div>

          <Link href="/" className={styles.secondaryLink}>
            TOPへ戻る
          </Link>
        </div>

        <section className={styles.card}>
          <h2 className={styles.sectionTitle}>初期資金</h2>

          <label className={styles.label}>初期資金</label>

          <input
            type="number"
            value={initialBalance}
            onChange={(e) => setInitialBalance(e.target.value)}
            placeholder="例: 100000"
            className={styles.input}
          />

          <p className={styles.helpText}>
            例: 100000 と入れると、10万円スタートとしてDD%と全体収支を計算します
          </p>

          <button
            type="button"
            onClick={handleSave}
            className={styles.primaryButton}
          >
            保存する
          </button>

          {message && <p className={styles.message}>{message}</p>}
        </section>

        <section className={styles.card}>
          <h2 className={styles.sectionTitle}>追加資金</h2>

          <div className={styles.formGrid}>
            <input
              type="datetime-local"
              value={capitalDate}
              onChange={(e) => setCapitalDate(e.target.value)}
              className={styles.input}
            />

            <input
              type="number"
              value={capitalAmount}
              onChange={(e) => setCapitalAmount(e.target.value)}
              placeholder="追加金額 例: 50000"
              className={styles.input}
            />

            <input
              type="text"
              value={capitalNote}
              onChange={(e) => setCapitalNote(e.target.value)}
              placeholder="メモ（任意）"
              className={styles.input}
            />
          </div>

          <button
            type="button"
            onClick={handleSaveCapitalEvent}
            className={styles.primaryButton}
          >
            追加資金を保存
          </button>
        </section>

        <section className={styles.card}>
          <h2 className={styles.sectionTitle}>追加履歴</h2>

          {capitalEvents.length === 0 ? (
            <p className={styles.emptyText}>まだ追加資金はありません</p>
          ) : (
            <div className={styles.historyList}>
              {capitalEvents.map((event) => (
                <div key={event.id} className={styles.historyItem}>
                  {editingEventId === event.id ? (
                    <>
                      <div className={styles.formGrid}>
                        <input
                          type="datetime-local"
                          value={editCapitalDate}
                          onChange={(e) => setEditCapitalDate(e.target.value)}
                          className={styles.input}
                        />

                        <input
                          type="number"
                          value={editCapitalAmount}
                          onChange={(e) => setEditCapitalAmount(e.target.value)}
                          className={styles.input}
                        />

                        <input
                          type="text"
                          value={editCapitalNote}
                          onChange={(e) => setEditCapitalNote(e.target.value)}
                          placeholder="メモ（任意）"
                          className={styles.input}
                        />
                      </div>

                      <div className={styles.historyActions}>
                        <button
                          type="button"
                          onClick={() => handleUpdateCapitalEvent(event.id)}
                          className={styles.primaryButton}
                        >
                          更新する
                        </button>

                        <button
                          type="button"
                          onClick={handleCancelEdit}
                          className={styles.secondaryButton}
                        >
                          キャンセル
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className={styles.historyLine}>
                        日時: {new Date(event.event_date).toLocaleString('ja-JP')}
                      </p>
                      <p className={styles.historyLine}>
                        金額: {Number(event.amount).toLocaleString()}
                      </p>
                      <p className={styles.historyLine}>
                        メモ: {event.note || 'なし'}
                      </p>

                      <div className={styles.historyActions}>
                        <button
                          type="button"
                          onClick={() => handleStartEdit(event)}
                          className={styles.secondaryButton}
                        >
                          編集
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteCapitalEvent(event.id)}
                          className={styles.dangerButton}
                        >
                          削除
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}