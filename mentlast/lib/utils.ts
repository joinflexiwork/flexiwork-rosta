import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-SG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })
}

export function formatTime(time: string): string {
  return new Date(`2000-01-01T${time}`).toLocaleTimeString('en-SG', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  })
}
