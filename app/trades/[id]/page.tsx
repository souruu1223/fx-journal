'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabaseClient'
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

type Attachment = {
  id: string
  trade_id: string
  public_url: string
  storage_path: string
  mime_type: string | null
  file_size: number | null
}

export default function TradeDetailPage() {
  const params = useParams()
  const router = useRouter()
  const tradeId = params.id as string

  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [trade, setTrade] = useState<Trade | null>(null)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [selectedImage, setSelectedImage] = useState<string | null>(null)

  const [isEditing, setIsEditing] = useState(false)
  const [editSymbol, setEditSymbol] = useState('')
  const [editSide, setEditSide] = useState<Side>('BUY')
  const [editEntryTime, setEditEntryTime] = useState('')
  const [editEntryPrice, setEditEntryPrice] = useState('')
  const [editExitTime, setEditExitTime] = useState('')
  const [editExitPrice, setEditExitPrice] = useState('')
  const [editRiskReward, setEditRiskReward] = useState('')
  const [editPriceProfit, setEditPriceProfit] = useState('')
  const [editFee, setEditFee] = useState('')
  const [editSize, setEditSize] = useState('')
  const [editNote, setEditNote] = useState('')

  const [deletingImageId, setDeletingImageId] = useState<string | null>(null)
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [previewUrls, setPreviewUrls] = useState<string[]>([])
  const [isUploadingImages, setIsUploadingImages] = useState(false)

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const formatForDatetimeLocal = (value: string) => {
    const date = new Date(value)
    const offset = date.getTimezoneOffset()
    const localDate = new Date(date.getTime() - offset * 60 * 1000)
    return localDate.toISOString().slice(0, 16)
  }

  const getPipMultiplier = (symbol: string) => {
    return symbol.toUpperCase().includes('JPY') ? 100 : 10000
  }

  const calculatePips = (targetTrade: Trade) => {
    if (targetTrade.exit_price === null) return null

    const priceDiff =
      targetTrade.side === 'BUY'
        ? targetTrade.exit_price - targetTrade.entry_price
        : targetTrade.entry_price - targetTrade.exit_price

    return priceDiff * getPipMultiplier(targetTrade.symbol)
  }

  const getTotalProfit = (targetTrade: Trade) => {
    if (targetTrade.price_profit === null && targetTrade.fee === null) return null
    return (targetTrade.price_profit ?? 0) + (targetTrade.fee ?? 0)
  }

  const getStatus = (targetTrade: Trade) => {
    const totalProfit = getTotalProfit(targetTrade)

    if (totalProfit === null) {
      return {
        label: '未決済',
        className: styles.statusPending,
      }
    }

    if (totalProfit > 0) {
      return {
        label: '勝ち',
        className: styles.statusWin,
      }
    }

    if (totalProfit < 0) {
      return {
        label: '負け',
        className: styles.statusLose,
      }
    }

    return {
      label: '同値',
      className: styles.statusEven,
    }
  }

  const loadTradeDetail = async () => {
    setLoading(true)
    setMessage('')

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setMessage('ログインしてください')
      setLoading(false)
      return
    }

    const { data: tradeData, error: tradeError } = await supabase
      .from('trades')
      .select('*')
      .eq('id', tradeId)
      .eq('user_id', user.id)
      .single()

    if (tradeError) {
      setMessage('トレード取得エラー: ' + tradeError.message)
      setLoading(false)
      return
    }

    const { data: attachmentData, error: attachmentError } = await supabase
      .from('attachments')
      .select('*')
      .eq('trade_id', tradeId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })

    if (attachmentError) {
      setMessage('画像取得エラー: ' + attachmentError.message)
      setLoading(false)
      return
    }

    const loadedTrade = tradeData as Trade

    setTrade(loadedTrade)
    setAttachments((attachmentData as Attachment[]) || [])

    setEditSymbol(loadedTrade.symbol)
    setEditSide(loadedTrade.side)
    setEditEntryTime(formatForDatetimeLocal(loadedTrade.entry_time))
    setEditEntryPrice(String(loadedTrade.entry_price))
    setEditExitTime(loadedTrade.exit_time ? formatForDatetimeLocal(loadedTrade.exit_time) : '')
    setEditExitPrice(loadedTrade.exit_price !== null ? String(loadedTrade.exit_price) : '')
    setEditRiskReward(loadedTrade.risk_reward !== null ? String(loadedTrade.risk_reward) : '')
    setEditPriceProfit(loadedTrade.price_profit !== null ? String(loadedTrade.price_profit) : '')
    setEditFee(loadedTrade.fee !== null ? String(loadedTrade.fee) : '')
    setEditSize(String(loadedTrade.size))
    setEditNote(loadedTrade.note || '')

    setLoading(false)
  }

  useEffect(() => {
    if (tradeId) {
      loadTradeDetail()
    }
  }, [tradeId])

  useEffect(() => {
    if (newFiles.length === 0) {
      setPreviewUrls([])
      return
    }

    const urls = newFiles.map((file) => URL.createObjectURL(file))
    setPreviewUrls(urls)

    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [newFiles])

  const handleUpdateTrade = async () => {
    setMessage('')

    if (!trade) {
      setMessage('トレード情報がありません')
      return
    }

    if (!editSymbol || !editEntryTime || !editEntryPrice || !editSize) {
      setMessage('必須項目を入力してください')
      return
    }

    const { error } = await supabase
      .from('trades')
      .update({
        symbol: editSymbol,
        side: editSide,
        entry_time: new Date(editEntryTime).toISOString(),
        entry_price: Number(editEntryPrice),
        exit_time: editExitTime ? new Date(editExitTime).toISOString() : null,
        exit_price: editExitPrice ? Number(editExitPrice) : null,
        risk_reward: editRiskReward ? Number(editRiskReward) : null,
        price_profit: editPriceProfit ? Number(editPriceProfit) : null,
        fee: editFee ? Number(editFee) : null,
        size: Number(editSize),
        note: editNote,
        updated_at: new Date().toISOString(),
      })
      .eq('id', trade.id)

    if (error) {
      setMessage('更新エラー: ' + error.message)
      return
    }

    setMessage('トレードを更新しました')
    setIsEditing(false)
    await loadTradeDetail()
  }

  const handleCancelEdit = () => {
    if (!trade) return

    setEditSymbol(trade.symbol)
    setEditSide(trade.side)
    setEditEntryTime(formatForDatetimeLocal(trade.entry_time))
    setEditEntryPrice(String(trade.entry_price))
    setEditExitTime(trade.exit_time ? formatForDatetimeLocal(trade.exit_time) : '')
    setEditExitPrice(trade.exit_price !== null ? String(trade.exit_price) : '')
    setEditRiskReward(trade.risk_reward !== null ? String(trade.risk_reward) : '')
    setEditPriceProfit(trade.price_profit !== null ? String(trade.price_profit) : '')
    setEditFee(trade.fee !== null ? String(trade.fee) : '')
    setEditSize(String(trade.size))
    setEditNote(trade.note || '')
    setNewFiles([])
    setPreviewUrls([])
    setIsEditing(false)
    setMessage('')
  }

  const handleDeleteImage = async (attachment: Attachment) => {
    const confirmed = window.confirm('この画像を削除しますか？')
    if (!confirmed) return

    setMessage('')
    setDeletingImageId(attachment.id)

    const { error: storageError } = await supabase.storage
      .from('trade-screenshots')
      .remove([attachment.storage_path])

    if (storageError) {
      setMessage('Storage削除エラー: ' + storageError.message)
      setDeletingImageId(null)
      return
    }

    const { error: dbError } = await supabase
      .from('attachments')
      .delete()
      .eq('id', attachment.id)

    if (dbError) {
      setMessage('画像情報削除エラー: ' + dbError.message)
      setDeletingImageId(null)
      return
    }

    if (selectedImage === attachment.public_url) {
      setSelectedImage(null)
    }

    setMessage('画像を削除しました')
    setDeletingImageId(null)
    await loadTradeDetail()
  }

  const handleRemovePreviewImage = (indexToRemove: number) => {
    setNewFiles((prev) => prev.filter((_, index) => index !== indexToRemove))
  }

  const handleAddImages = async () => {
    if (!trade) {
      setMessage('トレード情報がありません')
      return
    }

    if (newFiles.length === 0) {
      setMessage('追加する画像を選択してください')
      return
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setMessage('ログインしてください')
      return
    }

    setMessage('')
    setIsUploadingImages(true)

    const attachmentRows = []

    for (let i = 0; i < newFiles.length; i++) {
      const file = newFiles[i]
      const fileExt = file.name.split('.').pop() || 'jpg'
      const fileName = `${Date.now()}-${i}.${fileExt}`
      const filePath = `users/${user.id}/trades/${trade.id}/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('trade-screenshots')
        .upload(filePath, file)

      if (uploadError) {
        setMessage('画像アップロードエラー: ' + uploadError.message)
        setIsUploadingImages(false)
        return
      }

      const { data: publicUrlData } = supabase.storage
        .from('trade-screenshots')
        .getPublicUrl(filePath)

      attachmentRows.push({
        trade_id: trade.id,
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
      setIsUploadingImages(false)
      return
    }

    setMessage('画像を追加しました')
    setNewFiles([])
    setPreviewUrls([])
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    setIsUploadingImages(false)
    await loadTradeDetail()
  }

  if (loading) {
    return <main className={styles.loading}>読み込み中...</main>
  }

  if (message && !trade) {
    return (
      <main className={styles.page}>
        <div className={styles.container}>
          <button onClick={() => router.push('/trades')} className={styles.backButton}>
            一覧に戻る
          </button>
          <p className={styles.message}>{message}</p>
        </div>
      </main>
    )
  }

  if (!trade) {
    return (
      <main className={styles.page}>
        <div className={styles.container}>
          <button onClick={() => router.push('/trades')} className={styles.backButton}>
            一覧に戻る
          </button>
          <p className={styles.message}>トレードが見つかりませんでした</p>
        </div>
      </main>
    )
  }

  const pips = calculatePips(trade)
  const totalProfit = getTotalProfit(trade)
  const status = getStatus(trade)

  return (
    <>
      <main className={styles.page}>
        <div className={styles.container}>
          <div className={styles.header}>
            <div>
              <h1 className={styles.title}>トレード詳細</h1>
              <p className={styles.subtitle}>
                記録内容、損益、スクリーンショットを確認できます
              </p>
            </div>
          </div>

          {message && <p className={styles.message}>{message}</p>}

          <section className={styles.heroCard}>
            <div className={styles.heroMain}>
              <div>
                <p className={styles.heroLabel}>通貨ペア</p>
                <p className={styles.heroValue}>{trade.symbol}</p>
              </div>

              <div>
                <p className={styles.heroLabel}>状態</p>
                <span className={`${styles.statusBadge} ${status.className}`}>
                  {status.label}
                </span>
              </div>

              <div>
                <p className={styles.heroLabel}>売買</p>
                <span
                  className={
                    trade.side === 'BUY' ? styles.buyBadge : styles.sellBadge
                  }
                >
                  {trade.side}
                </span>
              </div>

              <div>
                <p className={styles.heroLabel}>損益</p>
                <p
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
                </p>
              </div>
            </div>
          </section>

          <div className={styles.topActionRow}>
            <button
              onClick={() => router.push('/trades')}
              className={styles.backButton}
            >
              一覧に戻る
            </button>

            {!isEditing && (
              <button
                type="button"
                onClick={() => {
                 setIsEditing(true)
                  setMessage('')
                }}
                className={styles.primaryButton}
              >
                編集する
              </button>
            )}
          </div>

          {!isEditing ? (
            <>
              <section className={styles.detailGrid}>
                <div className={styles.detailCard}>
                  <h2 className={styles.sectionTitle}>基本情報</h2>

                  <div className={styles.infoList}>
                    <div className={styles.infoRow}>
                      <span className={styles.infoLabel}>エントリー日時</span>
                      <span className={styles.infoValueText}>
                        {new Date(trade.entry_time).toLocaleString('ja-JP')}
                      </span>
                    </div>

                    <div className={styles.infoRow}>
                      <span className={styles.infoLabel}>エントリー価格</span>
                      <span className={styles.infoValueText}>
                        {trade.entry_price}
                      </span>
                    </div>

                    <div className={styles.infoRow}>
                      <span className={styles.infoLabel}>決済日時</span>
                      <span className={styles.infoValueText}>
                        {trade.exit_time
                          ? new Date(trade.exit_time).toLocaleString('ja-JP')
                          : '未決済'}
                      </span>
                    </div>

                    <div className={styles.infoRow}>
                      <span className={styles.infoLabel}>決済価格</span>
                      <span className={styles.infoValueText}>
                        {trade.exit_price ?? '未決済'}
                      </span>
                    </div>

                    <div className={styles.infoRow}>
                      <span className={styles.infoLabel}>ロット</span>
                      <span className={styles.infoValueText}>{trade.size}</span>
                    </div>

                    <div className={styles.infoRow}>
                      <span className={styles.infoLabel}>リスクリワード</span>
                      <span className={styles.infoValueText}>
                        {trade.risk_reward ?? '—'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className={styles.detailCard}>
                  <h2 className={styles.sectionTitle}>結果</h2>

                  <div className={styles.infoList}>
                    <div className={styles.infoRow}>
                      <span className={styles.infoLabel}>pips</span>
                      <span className={styles.infoValueText}>
                        {pips !== null ? pips.toFixed(1) : '—'}
                      </span>
                    </div>

                    <div className={styles.infoRow}>
                      <span className={styles.infoLabel}>価格差損益</span>
                      <span className={styles.infoValueText}>
                        {trade.price_profit ?? '—'}
                      </span>
                    </div>

                    <div className={styles.infoRow}>
                      <span className={styles.infoLabel}>手数料</span>
                      <span className={styles.infoValueText}>
                        {trade.fee ?? '—'}
                      </span>
                    </div>

                    <div className={styles.infoRow}>
                      <span className={styles.infoLabel}>損益</span>
                      <span
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
                      </span>
                    </div>
                  </div>
                </div>
              </section>

              <section className={styles.memoCard}>
                <h2 className={styles.sectionTitle}>メモ</h2>
                <p className={styles.memoText}>{trade.note || 'なし'}</p>
              </section>
            </>
          ) : (
            <section className={styles.editCard}>
              <h2 className={styles.sectionTitle}>編集</h2>

              <div className={styles.formGrid}>
                <div className={styles.field}>
                  <label className={styles.label}>通貨ペア</label>
                  <input
                    type="text"
                    value={editSymbol}
                    onChange={(e) => setEditSymbol(e.target.value)}
                    className={styles.input}
                  />
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>売買</label>
                  <select
                    value={editSide}
                    onChange={(e) => setEditSide(e.target.value as Side)}
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
                    value={editEntryTime}
                    onChange={(e) => setEditEntryTime(e.target.value)}
                    className={styles.input}
                  />
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>エントリー価格</label>
                  <input
                    type="number"
                    value={editEntryPrice}
                    onChange={(e) => setEditEntryPrice(e.target.value)}
                    className={styles.input}
                  />
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>決済日時</label>
                  <input
                    type="datetime-local"
                    value={editExitTime}
                    onChange={(e) => setEditExitTime(e.target.value)}
                    className={styles.input}
                  />
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>決済価格</label>
                  <input
                    type="number"
                    value={editExitPrice}
                    onChange={(e) => setEditExitPrice(e.target.value)}
                    className={styles.input}
                  />
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>リスクリワード</label>
                  <input
                    type="number"
                    step="0.1"
                    value={editRiskReward}
                    onChange={(e) => setEditRiskReward(e.target.value)}
                    className={styles.input}
                  />
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>価格差損益</label>
                  <input
                    type="number"
                    value={editPriceProfit}
                    onChange={(e) => setEditPriceProfit(e.target.value)}
                    className={styles.input}
                  />
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>手数料</label>
                  <input
                    type="number"
                    value={editFee}
                    onChange={(e) => setEditFee(e.target.value)}
                    className={styles.input}
                  />
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>ロット</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editSize}
                    onChange={(e) => setEditSize(e.target.value)}
                    className={styles.input}
                  />
                </div>
              </div>

              <div className={styles.field}>
                <label className={styles.label}>メモ</label>
                <textarea
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  className={styles.textarea}
                />
              </div>

              <div className={styles.uploadCard}>
                <p className={styles.uploadTitle}>画像を追加</p>
                <p className={styles.uploadSubText}>複数枚まとめて追加できます</p>

                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => {
                    const selectedFiles = Array.from(e.target.files || [])
                    setNewFiles((prev) => [...prev, ...selectedFiles])
                    e.target.value = ''
                  }}
                  className={styles.hiddenInput}
                />

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={styles.secondaryButton}
                >
                  画像を選ぶ
                </button>

                <p className={styles.fileCount}>
                  選択中: {newFiles.length} 枚
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

                <button
                  type="button"
                  onClick={handleAddImages}
                  disabled={isUploadingImages}
                  className={styles.addImageButton}
                >
                  {isUploadingImages ? '画像追加中...' : '選んだ画像を追加'}
                </button>
              </div>

              <div className={styles.editActions}>
                <button
                  type="button"
                  onClick={handleUpdateTrade}
                  className={styles.primaryButton}
                >
                  保存する
                </button>

                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className={styles.cancelButton}
                >
                  キャンセル
                </button>
              </div>
            </section>
          )}

          <section className={styles.imageSection}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>スクリーンショット</h2>
              <p className={styles.sectionSubText}>
                クリックで拡大表示できます
              </p>
            </div>

            {attachments.length === 0 ? (
              <div className={styles.emptyImageBox}>画像はありません</div>
            ) : (
              <div className={styles.imageGrid}>
                {attachments.map((attachment) => (
                  <div key={attachment.id} className={styles.imageCard}>
                    <button
                      type="button"
                      onClick={() => setSelectedImage(attachment.public_url)}
                      className={styles.imageButton}
                    >
                      <img
                        src={attachment.public_url}
                        alt="トレード画像"
                        className={styles.image}
                      />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteImage(attachment)}
                      disabled={deletingImageId === attachment.id}
                      className={styles.deleteImageButton}
                    >
                      {deletingImageId === attachment.id ? '削除中...' : '削除'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      {selectedImage && (
        <div
          onClick={() => setSelectedImage(null)}
          className={styles.modalOverlay}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={styles.modalContent}
          >
            <button
              type="button"
              onClick={() => setSelectedImage(null)}
              className={styles.modalCloseButton}
            >
              閉じる
            </button>

            <img
              src={selectedImage}
              alt="拡大画像"
              className={styles.modalImage}
            />
          </div>
        </div>
      )}
    </>
  )
}