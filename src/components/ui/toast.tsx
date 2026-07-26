"use client"
import { useState, useEffect, createContext, useContext, useCallback } from "react"
import { cn } from "@/lib/utils"

interface Toast {
  id: string
  message: string
  type: "success" | "error" | "warning"
}

const ToastContext = createContext<{
  addToast: (message: string, type?: Toast["type"]) => void
}>({ addToast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((message: string, type: Toast["type"] = "success") => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { id, message, type }])
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDone={() => removeToast(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onDone }: { toast: Toast; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, toast.type === "error" ? 5000 : 2000)
    return () => clearTimeout(timer)
  }, [toast, onDone])

  return (
    <div
      className={cn(
        "animate-slide-up rounded-lg px-4 py-3 text-sm font-medium shadow-lg transition-all",
        toast.type === "success" && "bg-green-600 text-white",
        toast.type === "error" && "bg-brand-accent text-white",
        toast.type === "warning" && "bg-yellow-500 text-white"
      )}
    >
      {toast.message}
    </div>
  )
}
