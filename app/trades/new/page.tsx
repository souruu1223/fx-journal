'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import styles from './page.module.css'

type Side = 'BUY' | 'SELL'

export default function NewTradePage() {
  const [message, setMessage] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [previewUrls, setPreviewUrls] = useState<string[]>([])

  const [symbol, setSymbol] = useState('USDJPY')
  const [side, setSide] = useState<Side>('BUY')
  const [entryTime, setEntryTime] = useState('')
  const [entryPrice, setEntryPrice] = useState('')
  const [size, setSize] = useState('0.1')
  const [riskReward, setRiskReward] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    if (files.length === 0) {
      setPreviewUrls([])
      return
    }

    const urls = files.map((file) => URL.createObjectURL(file))
    setPreviewUrls(urls)

    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [files])

  const handleRemovePreviewImage = (indexToRemove: number) => {
    setFiles((prev) => prev.filter((_, index) => index !== indexToRemove))
  }

  const handleSaveTrade = async () => {
    setMessage('')

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setMessage('ログインしてください')
      return
    }

    if (!symbol || !entryTime || !entryPrice || !size) {
      setMessage('必須項目を入力してください')
      return
    }

    const { data: insertedTrade, error: tradeError } = await supabase
      .from('trades')
      .insert({
        user_id: user.id,
        symbol,
        side,
        entry_time: new Date(entryTime).toISOString(),
        entry_price: Number(entryPrice),
        size: Number(size),
        risk_reward: riskReward ? Number(riskReward) : null,
        note,
      })
      .select()
      .single()

    if (tradeError) {
      setMessage('保存エラー: ' + tradeError.message)
      return
    }

    if (files.length > 0) {
      const attachmentRows = []

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const fileExt = file.name.split('.').pop() || 'jpg'
        const fileName = `${Date.now()}-${i}.${fileExt}`
        const filePath = `users/${user.id}/trades/${insertedTrade.id}/${fileName}`

        const { error: uploadError } = await supabase.storage
          .from('trade-screenshots')
          .upload(filePath, file)

        if (uploadError) {
          setMessage('画像アップロードエラー: ' + uploadError.message)
          return
        }

        const { data: publicUrlData } = supabase.storage
          .from('trade-screenshots')
          .getPublicUrl(filePath)

        attachmentRows.push({
          trade_id: insertedTrade.id,
          user_id: user.id,
          storage_path: filePath,
          public_url: publicUrlData.publicUrl,
          mime_type: file.type,
          file_size: file.size,
        })
      }

      const { error: attachmentError } = await supabase
        .from('attachments')
        .insert(attachmentRows)

      if (attachmentError) {
        setMessage('画像情報保存エラー: ' + attachmentError.message)
        return
      }
    }

    setMessage('トレードを保存しました')
    setSymbol('USDJPY')
    setSide('BUY')
    setEntryTime('')
    setEntryPrice('')
    setSize('0.1')
    setRiskReward('')
    setNote('')
    setFiles([])
    setPreviewUrls([])
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>新規トレード登録</h1>
            <p className={styles.subtitle}>
              エントリー内容とスクリーンショットをまとめて記録できます
            </p>
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

        <div className={styles.formCard}>
          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label className={styles.label}>通貨ペア</label>
              <input
                type="text"
                placeholder="例: USDJPY"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className={styles.input}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>売買</label>
              <select
                value={side}
                onChange={(e) => setSide(e.target.value as Side)}
                className={styles.input}
              >
                <option value="BUY">BUY</option>
                <option value="SELL">SELL</option>
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>エントリー日時</label>
              <input
                type="datetime-local"
                value={entryTime}
                onChange={(e) => setEntryTime(e.target.value)}
                className={styles.input}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>エントリー価格</label>
              <input
                type="number"
                placeholder="例: 151.250"
                value={entryPrice}
                onChange={(e) => setEntryPrice(e.target.value)}
                className={styles.input}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>ロット</label>
              <input
                type="number"
                step="0.01"
                placeholder="例: 0.1"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                className={styles.input}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>リスクリワード</label>
              <input
                type="number"
                step="0.1"
                placeholder="例: 1.5"
                value={riskReward}
                onChange={(e) => setRiskReward(e.target.value)}
                className={styles.input}
              />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>メモ</label>
            <textarea
              placeholder="根拠、反省、相場状況など"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={styles.textarea}
            />
          </div>

          <div className={styles.uploadCard}>
            <p className={styles.uploadTitle}>スクリーンショット</p>
            <p className={styles.uploadSubText}>複数枚まとめて選択できます</p>

            <input
              type="file"
              multiple
              accept="image/*"
              onChange={(e) => {
                const selectedFiles = Array.from(e.target.files || [])
                setFiles((prev) => [...prev, ...selectedFiles])
                e.target.value = ''
              }}
              className={styles.fileInput}
            />

            <p className={styles.fileCount}>
              選択中: {files.length} 枚
            </p>

            {previewUrls.length > 0 && (
              <div className={styles.previewGrid}>
                {previewUrls.map((url, index) => (
                  <div key={`${url}-${index}`} className={styles.previewItem}>
                    <button
                      type="button"
                      onClick={() => handleRemovePreviewImage(index)}
                      className={styles.removePreviewButton}
                    >
                      ×
                    </button>
            
                    <img
                      src={url}
                      alt={`プレビュー画像 ${index + 1}`}
                      className={styles.previewImage}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={styles.actionRow}>
            <button
              type="button"
              onClick={handleSaveTrade}
              className={styles.primaryButton}
            >
              保存する
            </button>
          </div>

          {message && <p className={styles.message}>{message}</p>}
        </div>
      </div>
    </main>
  )
}