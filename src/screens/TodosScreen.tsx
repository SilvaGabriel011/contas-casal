import { useState } from 'react'
import type { TodoItem } from '../types'
import { useAppData } from '../data/DataProvider'
import { useI18n, formatDay } from '../lib/i18n'
import { daysBetween, todayISO } from '../lib/dates'
import { EmptyState, inputCls } from '../components/ui'

const KEEP_DAYS = 15

const isExpired = (t: TodoItem, today: string) =>
  t.done && t.doneAt !== null && daysBetween(t.doneAt.slice(0, 10), today) > KEEP_DAYS

// Deliberately tiny: name, check, undo. Done items fade away after 15 days.
export function TodosScreen() {
  const { snapshot, saveSettings } = useAppData()
  const { t, locale } = useI18n()
  const today = todayISO()
  const [text, setText] = useState('')

  const todos = (snapshot.settings.todos ?? []).filter((td) => !isExpired(td, today))
  const open = todos.filter((td) => !td.done)
  const done = [...todos.filter((td) => td.done)].sort((a, b) =>
    (a.doneAt ?? '') < (b.doneAt ?? '') ? 1 : -1
  )

  const persist = async (next: TodoItem[]) => {
    await saveSettings({ ...snapshot.settings, todos: next.filter((td) => !isExpired(td, today)) })
  }

  const add = async () => {
    const trimmed = text.trim()
    if (!trimmed) return
    await persist([
      ...todos,
      { id: crypto.randomUUID(), text: trimmed, done: false, doneAt: null, createdAt: new Date().toISOString() },
    ])
    setText('')
  }

  const setDone = async (id: string, value: boolean) => {
    await persist(
      todos.map((td) =>
        td.id === id ? { ...td, done: value, doneAt: value ? new Date().toISOString() : null } : td
      )
    )
  }

  const remove = async (id: string) => {
    await persist(todos.filter((td) => td.id !== id))
  }

  return (
    <div className="space-y-4">
      <header className="pt-1">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">✅ {t('menuTodos')}</h1>
      </header>

      <div className="flex items-end gap-2">
        <input
          className={`${inputCls} flex-1`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder={t('todoPlaceholder')}
          enterKeyHint="done"
        />
        <button
          onClick={add}
          disabled={!text.trim()}
          aria-label={t('todoAdd')}
          className="press grad-accent flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-xl font-bold text-white disabled:opacity-50"
        >
          ＋
        </button>
      </div>

      {open.length === 0 && done.length === 0 ? (
        <EmptyState emoji="✅" title={t('todoEmptyTitle')} body={t('todoEmptyBody')} />
      ) : (
        <>
          {open.length > 0 && (
            <div className="divide-y divide-line rounded-2xl border border-line bg-card">
              {open.map((td, i) => (
                <div
                  key={td.id}
                  className="anim-rise flex items-center gap-3 px-4 py-3"
                  style={{ animationDelay: `${Math.min(i * 40, 300)}ms` }}
                >
                  <button
                    onClick={() => setDone(td.id, true)}
                    aria-label={t('todoDoneTitle')}
                    className="press h-8 w-8 shrink-0 rounded-full border-2 border-line"
                  />
                  <span className="min-w-0 flex-1 text-[15px] font-semibold break-words text-ink">{td.text}</span>
                  <button
                    onClick={() => remove(td.id)}
                    aria-label={t('delete')}
                    className="press shrink-0 px-1 text-[13px] font-bold text-ink2"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {done.length > 0 && (
            <section>
              <h2 className="mb-1 px-1 text-[13px] font-extrabold tracking-wide text-ink2 uppercase">
                {t('todoDoneTitle')}
              </h2>
              <p className="mb-2 px-1 text-[11px] text-ink2">{t('todoDoneHint')}</p>
              <div className="divide-y divide-line rounded-2xl border border-line bg-card">
                {done.map((td) => (
                  <div key={td.id} className="flex items-center gap-3 px-4 py-3 opacity-60">
                    <button
                      onClick={() => setDone(td.id, false)}
                      aria-label={t('todoRestore')}
                      className="press flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-good text-[13px] font-bold text-white"
                    >
                      ✓
                    </button>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold break-words text-ink line-through">
                        {td.text}
                      </span>
                      {td.doneAt && (
                        <span className="block text-[11px] text-ink2">{formatDay(td.doneAt.slice(0, 10), locale)}</span>
                      )}
                    </span>
                    <button
                      onClick={() => setDone(td.id, false)}
                      className="press shrink-0 rounded-full border border-line px-2.5 py-1 text-[11px] font-bold text-ink2"
                    >
                      ↩︎ {t('todoRestore')}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
