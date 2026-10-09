'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Calendar as CalendarIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

export interface DatePickerProps {
  date?: Date | undefined
  onDateChange?: (date: Date | undefined) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function DatePicker({
  date,
  onDateChange,
  placeholder = 'Seleccionar fecha',
  disabled,
  className,
}: DatePickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            'w-full min-w-0 justify-start gap-2 px-3 text-left font-normal',
            !date && 'text-slate-400',
            className
          )}
        >
          <CalendarIcon className="h-4 w-4 shrink-0 text-[#3b9bff]" />
          <span className="truncate">{date ? format(date, 'd MMM yyyy', { locale: es }) : placeholder}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          required={false}
          selected={date}
          onSelect={onDateChange ?? (() => {})}
        />
      </PopoverContent>
    </Popover>
  )
}
