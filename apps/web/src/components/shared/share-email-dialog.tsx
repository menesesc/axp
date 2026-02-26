'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Loader2, Mail, Send } from 'lucide-react'

interface ShareEmailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultEmail?: string
  description: string
  onSend: (to: string, message: string) => Promise<void>
}

export function ShareEmailDialog({
  open,
  onOpenChange,
  defaultEmail = '',
  description,
  onSend,
}: ShareEmailDialogProps) {
  const [email, setEmail] = useState(defaultEmail)
  const [message, setMessage] = useState('')
  const [isSending, setIsSending] = useState(false)

  const handleSend = async () => {
    if (!email) return
    setIsSending(true)
    try {
      await onSend(email, message)
      onOpenChange(false)
      setMessage('')
    } finally {
      setIsSending(false)
    }
  }

  // Reset email when dialog opens with new defaultEmail
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setEmail(defaultEmail)
      setMessage('')
    }
    onOpenChange(newOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Enviar por email
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm text-slate-500">{description}</p>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Destinatario
            </label>
            <Input
              type="email"
              placeholder="email@ejemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Mensaje (opcional)
            </label>
            <textarea
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[80px] resize-none"
              placeholder="Agregar un mensaje al email..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSending}>
            Cancelar
          </Button>
          <Button onClick={handleSend} disabled={!email || isSending}>
            {isSending ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-1.5" />
            )}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
