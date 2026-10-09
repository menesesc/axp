import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl text-sm font-medium transition-[color,background-color,box-shadow,transform] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b9bff] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-gradient-to-b from-[#4aa6ff] to-[#1f7fe6] text-white shadow-[0_10px_24px_-12px_rgba(31,127,230,0.8),inset_0_1px_0_rgba(255,255,255,0.25)] hover:shadow-[0_14px_30px_-12px_rgba(31,127,230,0.9),inset_0_1px_0_rgba(255,255,255,0.25)]',
        destructive:
          'bg-red-500 text-white shadow-sm hover:bg-red-600',
        outline:
          'border border-slate-900/[0.14] bg-white text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.05)] hover:bg-slate-50',
        secondary:
          'bg-slate-900/[0.05] text-slate-900 hover:bg-slate-900/[0.09]',
        ghost: 'hover:bg-slate-900/[0.05] hover:text-slate-900',
        link: 'text-[#1667c7] underline-offset-4 hover:underline',
        primary:
          'bg-gradient-to-b from-[#4aa6ff] to-[#1f7fe6] text-white shadow-[0_10px_24px_-12px_rgba(31,127,230,0.8),inset_0_1px_0_rgba(255,255,255,0.25)] hover:shadow-[0_14px_30px_-12px_rgba(31,127,230,0.9),inset_0_1px_0_rgba(255,255,255,0.25)]',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 rounded-lg px-3 text-xs',
        lg: 'h-11 rounded-xl px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
