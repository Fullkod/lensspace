'use client'

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

export type FormSelectOption = { value: string; label: string }

type FormSelectProps = {
  name?: string
  value?: string
  defaultValue?: string
  options: FormSelectOption[]
  ariaLabel: string
  className?: string
  disabled?: boolean
  required?: boolean
  menuPlacement?: 'top' | 'bottom'
  onValueChange?: (value: string) => void
}

const menuMaxHeight = 280
const menuGap = 4
const viewportMargin = 8

// The menu lives in <body> with fixed coordinates: inside a dialog, an absolute menu is
// clipped by the scrolling body and adds a second scrollbar.
function menuPosition(trigger: DOMRect, preferred: 'top' | 'bottom', optionCount: number): CSSProperties {
  const needed = Math.min(menuMaxHeight, optionCount * 44 + 10)
  const below = window.innerHeight - trigger.bottom - menuGap - viewportMargin
  const above = trigger.top - menuGap - viewportMargin
  const [preferredSpace, otherSpace] = preferred === 'top' ? [above, below] : [below, above]
  const keepPreferred = preferredSpace >= needed || preferredSpace >= otherSpace
  const opensUp = keepPreferred ? preferred === 'top' : preferred !== 'top'
  const box = { left: trigger.left, width: trigger.width, maxHeight: Math.min(menuMaxHeight, opensUp ? above : below) }
  return opensUp ? { ...box, bottom: window.innerHeight - trigger.top + menuGap } : { ...box, top: trigger.bottom + menuGap }
}

export function FormSelect({ name, value: controlledValue, defaultValue, options, ariaLabel, className = '', disabled = false, required = false, menuPlacement = 'bottom', onValueChange }: FormSelectProps) {
  const initialValue = options.some(({ value }) => value === defaultValue) ? defaultValue! : options[0]?.value ?? ''
  const [internalValue, setInternalValue] = useState(initialValue)
  const [open, setOpen] = useState(false)
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({})
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const listboxId = useId()
  const value = controlledValue ?? internalValue
  const selected = options.find((option) => option.value === value)

  function selectValue(nextValue: string) {
    if (controlledValue === undefined) setInternalValue(nextValue)
    onValueChange?.(nextValue)
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false)
    }
    // QA-47: capture phase + stopImmediatePropagation so Escape closes only the open
    // listbox, not the dialog that also listens on window.
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.stopImmediatePropagation()
      setOpen(false)
    }
    function followTrigger() {
      setMenuStyle(menuPosition(rootRef.current!.getBoundingClientRect(), menuPlacement, options.length))
    }
    document.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('scroll', followTrigger, true)
    window.addEventListener('resize', followTrigger)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('scroll', followTrigger, true)
      window.removeEventListener('resize', followTrigger)
    }
  }, [open, menuPlacement, options.length])

  useEffect(() => {
    if (controlledValue !== undefined) return
    const form = rootRef.current?.closest('form')
    if (!form) return
    function handleReset() {
      setInternalValue(initialValue)
      setOpen(false)
    }
    form.addEventListener('reset', handleReset)
    return () => form.removeEventListener('reset', handleReset)
  }, [controlledValue, initialValue])

  return <div ref={rootRef} className={`relative min-w-0 ${className}`}>{name ? <input type="hidden" name={name} value={value} required={required} /> : null}<button type="button" aria-label={ariaLabel} aria-haspopup="listbox" aria-controls={listboxId} aria-expanded={open} disabled={disabled || !options.length} onClick={() => { setMenuStyle(menuPosition(rootRef.current!.getBoundingClientRect(), menuPlacement, options.length)); setOpen((current) => !current) }} onKeyDown={(event) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || !options.length) return
    event.preventDefault()
    const currentIndex = Math.max(0, options.findIndex((option) => option.value === value))
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : event.key === 'ArrowDown' ? (currentIndex + 1) % options.length : (currentIndex - 1 + options.length) % options.length
    selectValue(options[nextIndex].value)
  }} className="flex h-11 w-full min-w-0 items-center justify-between gap-3 rounded-control border border-line bg-field px-3.5 text-left text-[16px] text-text outline-none transition md:text-[15px] focus:border-[1.5px] focus:border-action focus:bg-surface focus:ring-4 focus:ring-action-soft disabled:cursor-not-allowed disabled:opacity-60"><span className="min-w-0 truncate">{selected?.label ?? 'Selecciona una opción'}</span><svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className={`h-4 w-4 shrink-0 text-ink transition-transform duration-150 ${open ? 'rotate-180' : ''}`}><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg></button>{open ? createPortal(<div ref={menuRef} id={listboxId} role="listbox" aria-label={ariaLabel} style={menuStyle} className="fixed z-[70] min-w-0 overflow-y-auto rounded-control border border-line bg-surface p-1 shadow-e2">{options.map((option) => <button key={option.value} type="button" role="option" aria-selected={option.value === value} onClick={() => selectValue(option.value)} className={`block min-h-11 w-full min-w-0 rounded-[8px] px-3 py-2.5 text-left text-[15px] ${option.value === value ? 'bg-action-soft font-semibold text-ink' : 'text-text-secondary hover:bg-action-tint'}`}>{option.label}</button>)}</div>, document.body) : null}</div>
}
