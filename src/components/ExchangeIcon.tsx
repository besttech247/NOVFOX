import React from 'react'
import type { ExchangeId } from '@/types'

export function ExchangeIcon({
  exchange,
  size = 16,
  className = '',
}: {
  exchange: ExchangeId
  size?: number
  className?: string
}) {
  switch (exchange) {
    case 'binance':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`shrink-0 ${className}`}
          title="Binance"
        >
          <rect width="32" height="32" rx="6" fill="#181A20" />
          <path
            d="M16 6.5L19.7 10.2L13.8 16.1L10.1 12.4L16 6.5ZM21.9 12.4L25.6 16.1L21.9 19.8L18.2 16.1L21.9 12.4ZM16 25.7L10.1 19.8L13.8 16.1L19.7 22L16 25.7ZM10.1 19.8L6.4 16.1L10.1 12.4L13.8 16.1L10.1 19.8ZM16 13.9L18.2 16.1L16 18.3L13.8 16.1L16 13.9Z"
            fill="#F0B90B"
          />
        </svg>
      )
    case 'bybit':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`shrink-0 ${className}`}
          title="Bybit"
        >
          <rect width="32" height="32" rx="6" fill="#17181E" />
          <path
            d="M8 8H15.5C18.5 8 20.5 9.8 20.5 12.3C20.5 13.9 19.6 15.3 18.2 16C20 16.8 21.2 18.3 21.2 20.2C21.2 23 18.8 24.8 15.5 24.8H8V8ZM13.8 14.7C15.2 14.7 16.3 13.9 16.3 12.6C16.3 11.3 15.2 10.5 13.8 10.5H11.5V14.7H13.8ZM14.1 22.3C15.7 22.3 17 21.4 17 20C17 18.6 15.7 17.7 14.1 17.7H11.5V22.3H14.1Z"
            fill="#F7A600"
          />
        </svg>
      )
    case 'okx':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`shrink-0 ${className}`}
          title="OKX"
        >
          <rect width="32" height="32" rx="6" fill="#000000" />
          <rect x="7" y="7" width="6" height="6" fill="#FFFFFF" />
          <rect x="19" y="7" width="6" height="6" fill="#FFFFFF" />
          <rect x="13" y="13" width="6" height="6" fill="#FFFFFF" />
          <rect x="7" y="19" width="6" height="6" fill="#FFFFFF" />
          <rect x="19" y="19" width="6" height="6" fill="#FFFFFF" />
        </svg>
      )
    case 'kucoin':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`shrink-0 ${className}`}
          title="KuCoin"
        >
          <rect width="32" height="32" rx="6" fill="#1C202F" />
          <path
            d="M8.5 16C8.5 11.9 11.9 8.5 16 8.5C18.2 8.5 20.2 9.4 21.6 11L18.9 13.7C18.2 12.9 17.1 12.4 16 12.4C14 12.4 12.4 14 12.4 16C12.4 18 14 19.6 16 19.6C17.1 19.6 18.2 19.1 18.9 18.3L21.6 21C20.2 22.6 18.2 23.5 16 23.5C11.9 23.5 8.5 20.1 8.5 16Z"
            fill="#24AE8F"
          />
          <path d="M21 13.5H23.5V18.5H21V13.5Z" fill="#24AE8F" />
        </svg>
      )
    case 'hyperliquid':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`shrink-0 ${className}`}
          title="Hyperliquid"
        >
          <rect width="32" height="32" rx="6" fill="#0A1E1A" />
          <path
            d="M8 10L14 7V25L8 22V10ZM24 10L18 7V25L24 22V10Z"
            fill="#50E3C2"
          />
          <path d="M14 14H18V18H14V14Z" fill="#A8F5E5" />
        </svg>
      )
    case 'kraken':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`shrink-0 ${className}`}
          title="Kraken"
        >
          <rect width="32" height="32" rx="6" fill="#5841D8" />
          <path
            d="M8 11C8 9.3 9.3 8 11 8H21C22.7 8 24 9.3 24 11V18C24 20.5 22.4 22.6 20.2 23.3L22 25H18.8L17.2 23.4C16.8 23.5 16.4 23.5 16 23.5C15.6 23.5 15.2 23.5 14.8 23.4L13.2 25H10L11.8 23.3C9.6 22.6 8 20.5 8 18V11ZM12.5 18C12.5 19 13.2 19.8 14.1 20H17.9C18.8 19.8 19.5 19 19.5 18V12H12.5V18Z"
            fill="#FFFFFF"
          />
        </svg>
      )
    case 'coinbase':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`shrink-0 ${className}`}
          title="Coinbase"
        >
          <rect width="32" height="32" rx="6" fill="#0052FF" />
          <path
            d="M16 8C11.6 8 8 11.6 8 16C8 20.4 11.6 24 16 24C20.4 24 24 20.4 24 16C24 11.6 20.4 8 16 8ZM14 18.5C12.6 18.5 11.5 17.4 11.5 16C11.5 14.6 12.6 13.5 14 13.5C15.2 13.5 16.1 14.3 16.4 15.3H19C18.6 12.9 16.5 11 14 11C11.2 11 9 13.2 9 16C9 18.8 11.2 21 14 21C16.5 21 18.6 19.1 19 16.7H16.4C16.1 17.7 15.2 18.5 14 18.5Z"
            fill="#FFFFFF"
          />
        </svg>
      )
    default:
      return null
  }
}
