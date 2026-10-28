import type { ReactNode } from 'react'
import type { BudgetStatus } from '../domain/budgets'
import { statusClass, statusLabel } from './format'

export function StatusBadge({ status }: { status: BudgetStatus }) {
  return <span className={`text-xs px-2 py-0.5 rounded-full ${statusClass[status]}`}>{statusLabel[status]}</span>
}

export function Modal({ title, onClose, children }: { title: string; onClose?: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90svh] overflow-y-auto p-5 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  )
}
